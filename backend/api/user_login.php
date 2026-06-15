<?php
require_once '../db.php';
require_once '../point_helper.php';

$conn = get_db_connection();

function get_user_with_level($conn, $user) {
    ensure_user_points_record($conn, $user['id'], $user['nickname']);
    
    $level_stmt = $conn->prepare("SELECT up.level, up.total_points, lb.badge_icon, lb.badge_color, lb.level_name
                                  FROM user_points up
                                  LEFT JOIN level_badges lb ON up.level = lb.level
                                  WHERE up.user_id = ?");
    $level_stmt->bind_param("i", $user['id']);
    $level_stmt->execute();
    $level_result = $level_stmt->get_result();
    $level_info = $level_result->fetch_assoc();

    return [
        'id' => $user['id'],
        'username' => $user['username'],
        'nickname' => $user['nickname'],
        'email' => $user['email'],
        'level' => $level_info ? (int)$level_info['level'] : 1,
        'level_name' => $level_info['level_name'] ?? 'Lv1 新手',
        'badge_icon' => $level_info['badge_icon'] ?? '🌱',
        'badge_color' => $level_info['badge_color'] ?? '#9CA3AF',
        'total_points' => $level_info ? (int)$level_info['total_points'] : 0
    ];
}

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
        'user' => get_user_with_level($conn, $user)
    ]);
} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $current_user = get_current_logged_user();
    if ($current_user) {
        $user_with_level = get_user_with_level($conn, [
            'id' => $current_user['id'],
            'username' => $current_user['username'],
            'nickname' => $current_user['nickname'],
            'email' => $current_user['email']
        ]);
        jsonResponse(['logged_in' => true, 'user' => $user_with_level]);
    } else {
        jsonResponse(['logged_in' => false]);
    }
}
?>