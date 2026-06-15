<?php
require_once '../db.php';

$conn = get_db_connection();
$current_user = get_current_logged_user();

if (!isset($_GET['id']) || !is_numeric($_GET['id'])) {
    jsonResponse(['error' => '无效的故事ID'], 400);
}

$story_id = (int)$_GET['id'];

function release_expired_lock($conn, $story_id) {
    $stmt = $conn->prepare("UPDATE stories SET lock_user_id = NULL, lock_user_nickname = NULL, lock_expires_at = NULL WHERE id = ? AND lock_expires_at IS NOT NULL AND lock_expires_at < NOW()");
    $stmt->bind_param("i", $story_id);
    $stmt->execute();
}

release_expired_lock($conn, $story_id);

$stmt = $conn->prepare("SELECT * FROM stories WHERE id = ?");
$stmt->bind_param("i", $story_id);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows === 0) {
    jsonResponse(['error' => '故事不存在'], 404);
}

$story = $result->fetch_assoc();

$lock_info = null;
if ($story['lock_user_id'] !== null) {
    $lock_info = [
        'user_id' => $story['lock_user_id'],
        'nickname' => $story['lock_user_nickname'],
        'expires_at' => $story['lock_expires_at'],
        'remaining_seconds' => max(0, strtotime($story['lock_expires_at']) - time())
    ];
}

$stmt = $conn->prepare("SELECT * FROM story_paragraphs WHERE story_id = ? ORDER BY paragraph_order ASC");
$stmt->bind_param("i", $story_id);
$stmt->execute();
$paragraphs_result = $stmt->get_result();

$paragraphs = [];
while ($row = $paragraphs_result->fetch_assoc()) {
    $paragraphs[] = $row;
}

$next_order = empty($paragraphs) ? 0 : (end($paragraphs)['paragraph_order'] + 1);

$can_continue = false;
$is_author = $current_user && $current_user['id'] == $story['author_id'];
$is_locked_by_me = $current_user && $story['lock_user_id'] == $current_user['id'];

if ($story['status'] === 'active' && $current_user) {
    if ($story['lock_user_id'] === null) {
        $can_continue = true;
    } elseif ($is_locked_by_me) {
        $can_continue = true;
    }
}

jsonResponse([
    'story' => $story,
    'paragraphs' => $paragraphs,
    'lock' => $lock_info,
    'next_order' => $next_order,
    'permissions' => [
        'can_continue' => $can_continue,
        'is_author' => $is_author,
        'is_locked_by_me' => $is_locked_by_me,
        'is_logged_in' => $current_user !== null
    ]
]);
?>