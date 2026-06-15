<?php
require_once '../db.php';

check_user_auth();

$conn = get_db_connection();
$current_user = get_current_logged_user();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$conversation_id = intval($_GET['conversation_id'] ?? 0);
$page = intval($_GET['page'] ?? 1);
$page_size = intval($_GET['page_size'] ?? 20);

if ($conversation_id <= 0) {
    jsonResponse(['error' => '会话ID无效'], 400);
}

if ($page < 1) $page = 1;
if ($page_size < 1 || $page_size > 100) $page_size = 20;

$stmt = $conn->prepare("SELECT id, user1_id, user2_id FROM private_conversations WHERE id = ?");
$stmt->bind_param("i", $conversation_id);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    jsonResponse(['error' => '会话不存在'], 404);
}

$conversation = $result->fetch_assoc();

if ($conversation['user1_id'] !== $current_user['id'] && $conversation['user2_id'] !== $current_user['id']) {
    jsonResponse(['error' => '无权访问该会话'], 403);
}

$count_sql = "SELECT COUNT(*) as total FROM private_messages WHERE conversation_id = ?";
$count_stmt = $conn->prepare($count_sql);
$count_stmt->bind_param("i", $conversation_id);
$count_stmt->execute();
$count_result = $count_stmt->get_result();
$total = $count_result->fetch_assoc()['total'];

$total_pages = ceil($total / $page_size);
if ($page > $total_pages && $total_pages > 0) {
    $page = $total_pages;
}

$offset = ($page - 1) * $page_size;

$sql = "SELECT 
            id,
            conversation_id,
            sender_id,
            receiver_id,
            content,
            is_read,
            read_at,
            created_at
        FROM private_messages 
        WHERE conversation_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?";

$stmt = $conn->prepare($sql);
$stmt->bind_param("iii", $conversation_id, $page_size, $offset);
$stmt->execute();
$result = $stmt->get_result();

$messages = [];
while ($row = $result->fetch_assoc()) {
    $messages[] = [
        'id' => intval($row['id']),
        'conversation_id' => intval($row['conversation_id']),
        'sender_id' => intval($row['sender_id']),
        'receiver_id' => intval($row['receiver_id']),
        'content' => $row['content'],
        'is_read' => boolval($row['is_read']),
        'read_at' => $row['read_at'],
        'created_at' => $row['created_at']
    ];
}

$messages = array_reverse($messages);

jsonResponse([
    'message' => '获取成功',
    'data' => [
        'list' => $messages,
        'total' => intval($total),
        'page' => $page,
        'page_size' => $page_size,
        'total_pages' => intval($total_pages)
    ]
]);
?>
