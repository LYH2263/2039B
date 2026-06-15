<?php
require_once '../db.php';

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $username = trim($input['username'] ?? '');
    $password = $input['password'] ?? '';

    if (empty($username) || empty($password)) {
        jsonResponse(['error' => '用户名和密码都不能为空'], 400);
    }

    $stmt = $conn->prepare("SELECT id, username, email, nickname, password_hash FROM users WHERE username = ? OR email = ?");
    $stmt->bind_param("ss", $username, $username);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 0) {
        jsonResponse(['error' => '用户名或密码错误'], 401);
    }

    $user = $result->fetch_assoc();
    
    if (!password_verify($password, $user['password_hash'])) {
        jsonResponse(['error' => '用户名或密码错误'], 401);
    }

    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['nickname'] = $user['nickname'];
    $_SESSION['email'] = $user['email'];

    jsonResponse([
        'message' => '登录成功',
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'nickname' => $user['nickname'],
            'email' => $user['email']
        ]
    ]);
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $current_user = get_current_user();
    if ($current_user) {
        jsonResponse(['logged_in' => true, 'user' => $current_user]);
    } else {
        jsonResponse(['logged_in' => false]);
    }
}
?>