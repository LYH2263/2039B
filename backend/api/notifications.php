<?php
/**
 * 提醒接口 api/notifications.php
 * 
 * 用途：
 * 1. GET: 获取当前登录用户的提醒列表（支持分页）
 * 2. POST: 标记单个提醒为已读
 * 3. PUT: 标记所有提醒为已读
 * 
 * 核心逻辑：
 * - 查询 notifications 表，按创建时间倒序
 * - 支持未读/已读筛选
 * - 标记已读时更新 is_read 和 read_at 字段
 */

require_once '../db.php';
require_once '../mention_helper.php';

check_user_auth();

$conn = get_db_connection();
$current_user = get_current_logged_user();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $page = isset($_GET['page']) && is_numeric($_GET['page']) ? (int)$_GET['page'] : 1;
    $per_page = 20;
    $offset = ($page - 1) * $per_page;
    $type = isset($_GET['type']) ? trim($_GET['type']) : 'all';

    $where_sql = "WHERE user_id = ?";
    $params = [$current_user['id']];
    $param_types = 'i';

    if ($type === 'unread') {
        $where_sql .= " AND is_read = 0";
    } elseif ($type === 'mention') {
        $where_sql .= " AND type = 'mention'";
    }

    $count_sql = "SELECT COUNT(*) as total FROM notifications $where_sql";
    $stmt = $conn->prepare($count_sql);
    $stmt->bind_param($param_types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    $total_row = $result->fetch_assoc();
    $total = (int)$total_row['total'];
    $total_pages = ceil($total / $per_page);

    $sql = "SELECT * FROM notifications $where_sql ORDER BY created_at DESC LIMIT ?, ?";
    $stmt = $conn->prepare($sql);
    $params[] = $offset;
    $params[] = $per_page;
    $param_types .= 'ii';
    $stmt->bind_param($param_types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    $notifications = [];
    while ($row = $result->fetch_assoc()) {
        $notifications[] = [
            'id' => (int)$row['id'],
            'user_id' => (int)$row['user_id'],
            'type' => $row['type'],
            'source_type' => $row['source_type'],
            'source_id' => (int)$row['source_id'],
            'post_id' => (int)$row['post_id'],
            'actor_nickname' => $row['actor_nickname'],
            'title' => $row['title'],
            'content' => $row['content'],
            'is_read' => (bool)$row['is_read'],
            'read_at' => $row['read_at'],
            'created_at' => $row['created_at']
        ];
    }

    $unread_sql = "SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = 0";
    $stmt = $conn->prepare($unread_sql);
    $stmt->bind_param("i", $current_user['id']);
    $stmt->execute();
    $result = $stmt->get_result();
    $unread_row = $result->fetch_assoc();
    $unread_count = (int)$unread_row['unread_count'];

    jsonResponse([
        'message' => '获取成功',
        'data' => [
            'list' => $notifications,
            'pagination' => [
                'current_page' => $page,
                'total_pages' => $total_pages,
                'total' => $total,
                'per_page' => $per_page
            ],
            'unread_count' => $unread_count
        ]
    ]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = trim($input['action'] ?? '');

    if ($action === 'mark_read') {
        $notification_id = isset($input['id']) ? (int)$input['id'] : 0;
        if ($notification_id <= 0) {
            jsonResponse(['error' => '无效的提醒ID'], 400);
        }

        $stmt = $conn->prepare("UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?");
        $stmt->bind_param("ii", $notification_id, $current_user['id']);
        
        if ($stmt->execute()) {
            $unread_sql = "SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND is_read = 0";
            $stmt = $conn->prepare($unread_sql);
            $stmt->bind_param("i", $current_user['id']);
            $stmt->execute();
            $result = $stmt->get_result();
            $unread_row = $result->fetch_assoc();
            
            jsonResponse([
                'message' => '标记已读成功',
                'data' => [
                    'unread_count' => (int)$unread_row['unread_count']
                ]
            ]);
        } else {
            jsonResponse(['error' => '标记失败'], 500);
        }
    } else {
        jsonResponse(['error' => '无效的操作'], 400);
    }

} elseif ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = trim($input['action'] ?? '');

    if ($action === 'mark_all_read') {
        $stmt = $conn->prepare("UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0");
        $stmt->bind_param("i", $current_user['id']);
        
        if ($stmt->execute()) {
            jsonResponse([
                'message' => '全部标记已读成功',
                'data' => [
                    'unread_count' => 0
                ]
            ]);
        } else {
            jsonResponse(['error' => '标记失败'], 500);
        }
    } else {
        jsonResponse(['error' => '无效的操作'], 400);
    }
} else {
    jsonResponse(['error' => 'Method not allowed'], 405);
}
?>
