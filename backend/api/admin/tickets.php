<?php
require_once '../../db.php';
check_admin_auth();

$conn = get_db_connection();

$STATUS_FLOW = [
    'pending' => ['processing', 'closed'],
    'processing' => ['resolved', 'closed'],
    'resolved' => ['closed'],
    'closed' => []
];

$VALID_STATUSES = ['pending', 'processing', 'resolved', 'closed'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['id']) && is_numeric($_GET['id'])) {
        $ticket_id = (int)$_GET['id'];
        $stmt = $conn->prepare("SELECT * FROM tickets WHERE id = ?");
        $stmt->bind_param("i", $ticket_id);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows === 0) {
            $stmt->close();
            jsonResponse(['error' => '工单不存在'], 404);
        }
        $ticket = $result->fetch_assoc();
        $stmt->close();

        $reply_stmt = $conn->prepare("SELECT id, reply_type, replier_name, content, created_at FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC");
        $reply_stmt->bind_param("i", $ticket_id);
        $reply_stmt->execute();
        $reply_result = $reply_stmt->get_result();
        $replies = [];
        while ($row = $reply_result->fetch_assoc()) {
            $replies[] = $row;
        }
        $reply_stmt->close();

        $ticket['replies'] = $replies;
        jsonResponse(['ticket' => $ticket]);
    }

    $status_filter = $_GET['status'] ?? '';
    $page = max(1, (int)($_GET['page'] ?? 1));
    $per_page = 20;
    $offset = ($page - 1) * $per_page;

    $where = "";
    $count_where = "";
    $params = [];
    $types = "";

    if (!empty($status_filter) && in_array($status_filter, $VALID_STATUSES)) {
        $where = "WHERE t.status = ?";
        $count_where = "WHERE status = ?";
        $params[] = $status_filter;
        $types .= "s";
    }

    $count_sql = "SELECT COUNT(*) as total FROM tickets $count_where";
    if (!empty($params)) {
        $count_stmt = $conn->prepare($count_sql);
        $count_stmt->bind_param($types, ...$params);
        $count_stmt->execute();
        $count_result = $count_stmt->get_result();
    } else {
        $count_result = $conn->query($count_sql);
    }
    $total = (int)$count_result->fetch_assoc()['total'];

    $sql = "SELECT t.*, (SELECT COUNT(*) FROM ticket_replies tr WHERE tr.ticket_id = t.id) as reply_count
            FROM tickets t $where ORDER BY t.created_at DESC LIMIT ? OFFSET ?";
    $query_types = $types . "ii";
    $query_params = array_merge($params, [$per_page, $offset]);

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($query_types, ...$query_params);
    $stmt->execute();
    $result = $stmt->get_result();

    $tickets = [];
    while ($row = $result->fetch_assoc()) {
        $tickets[] = $row;
    }
    $stmt->close();

    $status_stats_stmt = $conn->prepare("SELECT status, COUNT(*) as count FROM tickets GROUP BY status");
    $status_stats_stmt->execute();
    $stats_result = $status_stats_stmt->get_result();
    $status_stats = ['pending' => 0, 'processing' => 0, 'resolved' => 0, 'closed' => 0];
    while ($row = $stats_result->fetch_assoc()) {
        $status_stats[$row['status']] = (int)$row['count'];
    }
    $status_stats_stmt->close();

    jsonResponse([
        'tickets' => $tickets,
        'total' => $total,
        'page' => $page,
        'per_page' => $per_page,
        'total_pages' => ceil($total / $per_page),
        'status_stats' => $status_stats
    ]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';
    $ticket_id = isset($input['ticket_id']) ? (int)$input['ticket_id'] : 0;

    if ($ticket_id <= 0) {
        jsonResponse(['error' => '缺少有效的工单ID'], 400);
    }

    $check_stmt = $conn->prepare("SELECT id, status, ticket_no FROM tickets WHERE id = ?");
    $check_stmt->bind_param("i", $ticket_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();
    if ($check_result->num_rows === 0) {
        $check_stmt->close();
        jsonResponse(['error' => '工单不存在'], 404);
    }
    $ticket = $check_result->fetch_assoc();
    $check_stmt->close();

    if ($action === 'update_status') {
        $new_status = trim($input['status'] ?? '');

        if (!in_array($new_status, $VALID_STATUSES)) {
            jsonResponse(['error' => '无效的状态值'], 400);
        }

        $current_status = $ticket['status'];
        if (!in_array($new_status, $STATUS_FLOW[$current_status])) {
            $allowed = implode('/', $STATUS_FLOW[$current_status]);
            if (empty($allowed)) {
                jsonResponse(['error' => '该工单已关闭，无法变更状态'], 400);
            }
            jsonResponse(['error' => "状态不允许从「{$current_status}」变更为「{$new_status}」，允许的目标状态：{$allowed}"], 400);
        }

        $update_stmt = $conn->prepare("UPDATE tickets SET status = ? WHERE id = ? AND status = ?");
        $update_stmt->bind_param("sis", $new_status, $ticket_id, $current_status);
        $update_stmt->execute();

        if ($update_stmt->affected_rows > 0) {
            $status_names = ['pending' => '待处理', 'processing' => '处理中', 'resolved' => '已解决', 'closed' => '已关闭'];
            $auto_content = "工单状态由「{$status_names[$current_status]}」变更为「{$status_names[$new_status]}」";

            $reply_stmt = $conn->prepare("INSERT INTO ticket_replies (ticket_id, reply_type, replier_name, content) VALUES (?, 'system', '系统', ?)");
            $reply_stmt->bind_param("is", $ticket_id, $auto_content);
            $reply_stmt->execute();
            $reply_stmt->close();

            $update_stmt->close();
            jsonResponse(['message' => '状态更新成功', 'new_status' => $new_status]);
        } else {
            $update_stmt->close();
            jsonResponse(['error' => '状态更新失败，请重试'], 500);
        }

    } elseif ($action === 'reply') {
        $content = trim($input['content'] ?? '');

        if (empty($content)) {
            jsonResponse(['error' => '回复内容不能为空'], 400);
        }
        if (mb_strlen($content) > 5000) {
            jsonResponse(['error' => '回复内容不能超过5000个字符'], 400);
        }

        if ($ticket['status'] === 'closed') {
            jsonResponse(['error' => '已关闭的工单无法回复'], 400);
        }

        $reply_stmt = $conn->prepare("INSERT INTO ticket_replies (ticket_id, reply_type, replier_name, content) VALUES (?, 'admin', '管理员', ?)");
        $reply_stmt->bind_param("is", $ticket_id, $content);
        $reply_stmt->execute();
        $reply_stmt->close();

        if ($ticket['status'] === 'pending') {
            $processing = 'processing';
            $pending = 'pending';
            $auto_stmt = $conn->prepare("UPDATE tickets SET status = ? WHERE id = ? AND status = ?");
            $auto_stmt->bind_param("sis", $processing, $ticket_id, $pending);
            $auto_stmt->execute();
            $auto_stmt->close();

            $sys_reply_stmt = $conn->prepare("INSERT INTO ticket_replies (ticket_id, reply_type, replier_name, content) VALUES (?, 'system', '系统', ?)");
            $sys_content = '工单状态由「待处理」变更为「处理中」';
            $sys_reply_stmt->bind_param("is", $ticket_id, $sys_content);
            $sys_reply_stmt->execute();
            $sys_reply_stmt->close();
        }

        jsonResponse(['message' => '回复成功'], 201);

    } else {
        jsonResponse(['error' => '不支持的操作类型'], 400);
    }

} else {
    jsonResponse(['error' => 'Method not allowed'], 405);
}
