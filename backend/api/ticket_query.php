<?php
require_once '../db.php';

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$ticket_no = trim($_GET['ticket_no'] ?? '');

if (empty($ticket_no)) {
    jsonResponse(['error' => '工单号不能为空'], 400);
}

if (!preg_match('/^TK-\d{8}-\d{4}$/', $ticket_no)) {
    jsonResponse(['error' => '工单号格式不正确'], 400);
}

$stmt = $conn->prepare("SELECT id, ticket_no, nickname, type, title, description, status, created_at, updated_at FROM tickets WHERE ticket_no = ?");
$stmt->bind_param("s", $ticket_no);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    $stmt->close();
    jsonResponse(['error' => '未找到该工单'], 404);
}

$ticket = $result->fetch_assoc();
$stmt->close();

$reply_stmt = $conn->prepare("SELECT id, reply_type, replier_name, content, created_at FROM ticket_replies WHERE ticket_id = ? ORDER BY created_at ASC");
$reply_stmt->bind_param("i", $ticket['id']);
$reply_stmt->execute();
$reply_result = $reply_stmt->get_result();

$replies = [];
while ($row = $reply_result->fetch_assoc()) {
    $replies[] = $row;
}
$reply_stmt->close();

$ticket['replies'] = $replies;

jsonResponse(['ticket' => $ticket]);
