<?php
require_once '../db.php';

check_user_auth();

$conn = get_db_connection();
$current_user = get_current_user();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);

$receiver_id = intval($input['receiver_id'] ?? 0);
$content = trim($input['content'] ?? '');

if ($receiver_id <= 0) {
    jsonResponse(['error' => '接收用户ID无效'], 400);
}

if ($receiver_id === $current_user['id']) {
    jsonResponse(['error' => '不能给自己发送私信'], 400);
}

if (empty($content)) {
    jsonResponse(['error' => '消息内容不能为空'], 400);
}

if (mb_strlen($content) > 5000) {
    jsonResponse(['error' => '消息内容不能超过5000字'], 400);
}

$stmt = $conn->prepare("SELECT id, nickname FROM users WHERE id = ?");
$stmt->bind_param("i", $receiver_id);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    jsonResponse(['error' => '接收用户不存在'], 404);
}

$receiver = $result->fetch_assoc();

$user1_id = min($current_user['id'], $receiver_id);
$user2_id = max($current_user['id'], $receiver_id);
$user1_nickname = $user1_id === $current_user['id'] ? $current_user['nickname'] : $receiver['nickname'];
$user2_nickname = $user2_id === $current_user['id'] ? $current_user['nickname'] : $receiver['nickname'];

$conn->begin_transaction();

try {
    $stmt = $conn->prepare("SELECT id, user1_unread_count, user2_unread_count FROM private_conversations WHERE user1_id = ? AND user2_id = ?");
    $stmt->bind_param("ii", $user1_id, $user2_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $conversation = $result->fetch_assoc();

    if (!$conversation) {
        $stmt = $conn->prepare("INSERT INTO private_conversations (user1_id, user2_id, user1_nickname, user2_nickname) VALUES (?, ?, ?, ?)");
        $stmt->bind_param("iiss", $user1_id, $user2_id, $user1_nickname, $user2_nickname);
        $stmt->execute();
        $conversation_id = $conn->insert_id;
        $user1_unread_count = 0;
        $user2_unread_count = 0;
    } else {
        $conversation_id = $conversation['id'];
        $user1_unread_count = $conversation['user1_unread_count'];
        $user2_unread_count = $conversation['user2_unread_count'];
    }

    $stmt = $conn->prepare("INSERT INTO private_messages (conversation_id, sender_id, receiver_id, content) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("iiis", $conversation_id, $current_user['id'], $receiver_id, $content);
    $stmt->execute();
    $message_id = $conn->insert_id;

    $summary = mb_substr($content, 0, 100);
    if (mb_strlen($content) > 100) {
        $summary .= '...';
    }

    if ($current_user['id'] === $user1_id) {
        $user2_unread_count++;
    } else {
        $user1_unread_count++;
    }

    $now = date('Y-m-d H:i:s');
    $stmt = $conn->prepare("UPDATE private_conversations SET last_message_id = ?, last_message_content = ?, last_message_time = ?, last_sender_id = ?, user1_unread_count = ?, user2_unread_count = ?, updated_at = ? WHERE id = ?");
    $stmt->bind_param("isssiiii", $message_id, $summary, $now, $current_user['id'], $user1_unread_count, $user2_unread_count, $now, $conversation_id);
    $stmt->execute();

    $conn->commit();

    $stmt = $conn->prepare("SELECT id, conversation_id, sender_id, receiver_id, content, is_read, created_at FROM private_messages WHERE id = ?");
    $stmt->bind_param("i", $message_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $message = $result->fetch_assoc();

    jsonResponse([
        'message' => '发送成功',
        'data' => $message
    ]);

} catch (Exception $e) {
    $conn->rollback();
    jsonResponse(['error' => '发送失败：' . $e->getMessage()], 500);
}
?>
