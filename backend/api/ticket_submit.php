<?php
require_once '../db.php';

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);

$type = trim($input['type'] ?? '');
$title = trim($input['title'] ?? '');
$description = trim($input['description'] ?? '');
$contact = trim($input['contact'] ?? '');

$valid_types = ['bug', 'feature', 'account', 'other'];
if (!in_array($type, $valid_types)) {
    jsonResponse(['error' => '工单类型无效，可选：bug/feature/account/other'], 400);
}

if (empty($title)) {
    jsonResponse(['error' => '标题不能为空'], 400);
}
if (mb_strlen($title) > 200) {
    jsonResponse(['error' => '标题不能超过200个字符'], 400);
}

if (empty($description)) {
    jsonResponse(['error' => '问题描述不能为空'], 400);
}
if (mb_strlen($description) > 5000) {
    jsonResponse(['error' => '问题描述不能超过5000个字符'], 400);
}

if (empty($contact)) {
    jsonResponse(['error' => '联系方式不能为空'], 400);
}
if (mb_strlen($contact) > 200) {
    jsonResponse(['error' => '联系方式不能超过200个字符'], 400);
}

$current_user = get_current_logged_user();
$user_id = $current_user ? (int)$current_user['id'] : null;
$nickname = $current_user ? $current_user['nickname'] : ('访客' . substr(md5($contact), 0, 6));

$conn->begin_transaction();

try {
    $today = date('Ymd');
    $prefix = "TK-{$today}-";

    $stmt = $conn->prepare("SELECT ticket_no FROM tickets WHERE ticket_no LIKE ? ORDER BY ticket_no DESC LIMIT 1 FOR UPDATE");
    $like_prefix = $prefix . '%';
    $stmt->bind_param("s", $like_prefix);
    $stmt->execute();
    $result = $stmt->get_result();

    $seq = 1;
    if ($row = $result->fetch_assoc()) {
        $last_no = $row['ticket_no'];
        $last_seq = (int)substr($last_no, strrpos($last_no, '-') + 1);
        $seq = $last_seq + 1;
    }
    $stmt->close();

    $ticket_no = $prefix . str_pad($seq, 4, '0', STR_PAD_LEFT);

    $insert_stmt = $conn->prepare("INSERT INTO tickets (ticket_no, user_id, nickname, type, title, description, contact, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')");
    $insert_stmt->bind_param("sisssss", $ticket_no, $user_id, $nickname, $type, $title, $description, $contact);
    $insert_stmt->execute();
    $ticket_id = $insert_stmt->insert_id;
    $insert_stmt->close();

    $conn->commit();
} catch (Exception $e) {
    $conn->rollback();
    error_log("ticket_submit error: " . $e->getMessage());
    jsonResponse(['error' => '工单提交失败，请稍后重试'], 500);
}

jsonResponse([
    'message' => '工单提交成功',
    'ticket_no' => $ticket_no,
    'ticket_id' => $ticket_id
], 201);
