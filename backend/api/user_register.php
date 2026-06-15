<?php
require_once '../db.php';

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $username = trim($input['username'] ?? '');
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';
    $nickname = trim($input['nickname'] ?? '');

    if (empty($username) || empty($email) || empty($password) || empty($nickname)) {
        jsonResponse(['error' => '所有字段都不能为空'], 400);
    }

    if (strlen($username) < 3 || strlen($username) > 20) {
        jsonResponse(['error' => '用户名长度必须在3-20个字符之间'], 400);
    }

    if (strlen($password) < 6) {
        jsonResponse(['error' => '密码长度不能少于6个字符'], 400);
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['error' => '邮箱格式不正确'], 400);
    }

    $stmt = $conn->prepare("SELECT id FROM users WHERE username = ?");
    $stmt->bind_param("s", $username);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        jsonResponse(['error' => '用户名已被使用'], 400);
    }

    $stmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        jsonResponse(['error' => '邮箱已被注册'], 400);
    }

    $password_hash = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $conn->prepare("INSERT INTO users (username, email, password_hash, nickname) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("ssss", $username, $email, $password_hash, $nickname);
    
    if ($stmt->execute()) {
        jsonResponse(['message' => '注册成功', 'user_id' => $conn->insert_id], 201);
    } else {
        jsonResponse(['error' => '注册失败，请重试'], 500);
    }
}
?>