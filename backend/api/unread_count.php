<?php
require_once '../db.php';

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$current_user = get_current_user();

if (!$current_user) {
    jsonResponse([
        'message' => '未登录',
        'data' => [
            'unread_count' => 0
        ]
    ]);
}

$total_unread = 0;

$stmt = $conn->prepare("SELECT 
    SUM(CASE 
        WHEN user1_id = ? THEN user1_unread_count 
        WHEN user2_id = ? THEN user2_unread_count 
        ELSE 0 
    END) as total_unread
    FROM private_conversations 
    WHERE user1_id = ? OR user2_id = ?");
$stmt->bind_param("iiii", $current_user['id'], $current_user['id'], $current_user['id'], $current_user['id']);
$stmt->execute();
$result = $stmt->get_result();
$row = $result->fetch_assoc();

if ($row && $row['total_unread']) {
    $total_unread = intval($row['total_unread']);
}

jsonResponse([
    'message' => '获取成功',
    'data' => [
        'unread_count' => $total_unread
    ]
]);
?>
