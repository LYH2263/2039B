<?php
require_once '../db.php';

check_user_auth();

$conn = get_db_connection();
$current_user = get_current_user();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$keyword = trim($_GET['keyword'] ?? '');

if (empty($keyword)) {
    jsonResponse(['error' => '搜索关键词不能为空'], 400);
}

if (mb_strlen($keyword) < 1) {
    jsonResponse(['error' => '搜索关键词至少1个字符'], 400);
}

$search = "%$keyword%";
$stmt = $conn->prepare("SELECT id, username, nickname, created_at FROM users 
    WHERE (username LIKE ? OR nickname LIKE ?) AND id != ?
    ORDER BY nickname ASC 
    LIMIT 20");
$stmt->bind_param("ssi", $search, $search, $current_user['id']);
$stmt->execute();
$result = $stmt->get_result();

$users = [];
while ($row = $result->fetch_assoc()) {
    $users[] = [
        'id' => intval($row['id']),
        'username' => $row['username'],
        'nickname' => $row['nickname']
    ];
}

jsonResponse([
    'message' => '搜索成功',
    'data' => [
        'list' => $users
    ]
]);
?>
