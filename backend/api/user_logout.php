<?php
require_once '../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $_SESSION['user_id'] = null;
    $_SESSION['username'] = null;
    $_SESSION['nickname'] = null;
    $_SESSION['email'] = null;
    
    session_unset();
    
    jsonResponse(['message' => '登出成功']);
}
?>