<?php
require_once '../db.php';

check_user_auth();

$conn = get_db_connection();
$current_user = get_current_logged_user();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$conversation_id = intval($input['conversation_id'] ?? 0);

if ($conversation_id <= 0) {
    jsonResponse(['error' => '会话ID无效'], 400);
}

$stmt = $conn->prepare("SELECT id, user1_id, user2_id, user1_unread_count, user2_unread_count FROM private_conversations WHERE id = ?");
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

$is_user1 = ($conversation['user1_id'] === $current_user['id']);

$now = date('Y-m-d H:i:s');

$conn->begin_transaction();

try {
    $stmt = $conn->prepare("UPDATE private_messages SET is_read = 1, read_at = ? WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0");
    $stmt->bind_param("sii", $now, $conversation_id, $current_user['id']);
    $stmt->execute();
    $updated_count = $stmt->affected_rows;

    if ($is_user1) {
        $stmt = $conn->prepare("UPDATE private_conversations SET user1_unread_count = 0 WHERE id = ?");
    } else {
        $stmt = $conn->prepare("UPDATE private_conversations SET user2_unread_count = 0 WHERE id = ?");
    }
    $stmt->bind_param("i", $conversation_id);
    $stmt->execute();

    $conn->commit();

    jsonResponse([
        'message' => '标记已读成功',
        'data' => [
            'updated_count' => $updated_count
        ]
    ]);

} catch (Exception $e) {
    $conn->rollback();
    jsonResponse(['error' => '操作失败：' . $e->getMessage()], 500);
}
?>
