<?php
require_once '../db.php';

check_user_auth();

$conn = get_db_connection();
$current_user = get_current_user();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$page = intval($_GET['page'] ?? 1);
$page_size = intval($_GET['page_size'] ?? 20);

if ($page < 1) $page = 1;
if ($page_size < 1 || $page_size > 100) $page_size = 20;

$offset = ($page - 1) * $page_size;

$sql = "SELECT 
            c.id as conversation_id,
            CASE 
                WHEN c.user1_id = ? THEN c.user2_id
                ELSE c.user1_id
            END as other_user_id,
            CASE 
                WHEN c.user1_id = ? THEN c.user2_nickname
                ELSE c.user1_nickname
            END as other_user_nickname,
            c.last_message_content,
            c.last_message_time,
            c.last_sender_id,
            CASE 
                WHEN c.user1_id = ? THEN c.user1_unread_count
                ELSE c.user2_unread_count
            END as unread_count
        FROM private_conversations c
        WHERE c.user1_id = ? OR c.user2_id = ?
        ORDER BY c.last_message_time DESC, c.updated_at DESC
        LIMIT ? OFFSET ?";

$stmt = $conn->prepare($sql);
$stmt->bind_param("iiiiiii", 
    $current_user['id'], 
    $current_user['id'], 
    $current_user['id'], 
    $current_user['id'], 
    $current_user['id'],
    $page_size,
    $offset
);
$stmt->execute();
$result = $stmt->get_result();

$conversations = [];
while ($row = $result->fetch_assoc()) {
    $conversations[] = [
        'conversation_id' => $row['conversation_id'],
        'other_user_id' => $row['other_user_id'],
        'other_user_nickname' => $row['other_user_nickname'],
        'last_message_content' => $row['last_message_content'],
        'last_message_time' => $row['last_message_time'],
        'last_sender_id' => $row['last_sender_id'],
        'unread_count' => intval($row['unread_count'])
    ];
}

$count_sql = "SELECT COUNT(*) as total FROM private_conversations WHERE user1_id = ? OR user2_id = ?";
$count_stmt = $conn->prepare($count_sql);
$count_stmt->bind_param("ii", $current_user['id'], $current_user['id']);
$count_stmt->execute();
$count_result = $count_stmt->get_result();
$total = $count_result->fetch_assoc()['total'];

jsonResponse([
    'message' => '获取成功',
    'data' => [
        'list' => $conversations,
        'total' => intval($total),
        'page' => $page,
        'page_size' => $page_size
    ]
]);
?>
