<?php
/**
 * 配置文件 config.php
 * 
 * 用途：
 * 1. 定义数据库连接常量 (DB_HOST, DB_NAME, etc.)
 * 2. 定义管理员账号常量 (ADMIN_USER, ADMIN_PASS)
 * 3. 配置 CORS 跨域头，允许前端访问
 * 4. 开启 Session
 * 5. 提供通用辅助函数 jsonResponse 和 check_admin_auth
 * 
 * 核心逻辑：
 * - 检测 HTTP_ORIGIN 实现动态 CORS 允许
 * - session_start() 启动会话
 * 
 * 异常处理：
 * - 401 Unauthorized: check_admin_auth() 在未登录时返回
 */

// Database configuration
// 数据库连接配置
define('DB_HOST', 'db'); 
define('DB_NAME', 'www.17speed.vip');
define('DB_USER', 'www.17speed.vip');
define('DB_PASS', '19821230a');

// Admin credentials
// 管理员账号配置
define('ADMIN_USER', 'admin');
define('ADMIN_PASS', '123456');

// Points system configuration
// 积分系统配置（作为数据库规则的兜底默认值）
define('POINT_RULES', [
    'create_post' => [
        'name' => '发布帖子',
        'points' => 10,
        'daily_limit' => 10,
        'description' => '每发布一篇帖子获得积分'
    ],
    'receive_comment' => [
        'name' => '帖子被评论',
        'points' => 5,
        'daily_limit' => 0,
        'description' => '自己的帖子收到他人评论时获得积分'
    ],
    'create_comment' => [
        'name' => '评论他人',
        'points' => 2,
        'daily_limit' => 50,
        'description' => '每评论一篇他人帖子获得积分'
    ]
]);

// Level configuration (等级配置，兜底用)
define('LEVEL_BADGES', [
    1 => ['name' => 'Lv1 新手', 'min_points' => 0, 'icon' => '🌱', 'color' => '#9CA3AF'],
    2 => ['name' => 'Lv2 入门', 'min_points' => 50, 'icon' => '🌿', 'color' => '#10B981'],
    3 => ['name' => 'Lv3 进阶', 'min_points' => 200, 'icon' => '🌳', 'color' => '#3B82F6'],
    4 => ['name' => 'Lv4 高手', 'min_points' => 500, 'icon' => '🏆', 'color' => '#F59E0B'],
    5 => ['name' => 'Lv5 资深', 'min_points' => 1000, 'icon' => '👑', 'color' => '#EF4444']
]);

// CORS Headers
// 跨域资源共享配置
// 核心逻辑：允许来自前端 (localhost:3000) 的请求携带凭证 (Cookie)
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
    header("Access-Control-Max-Age: 86400");    // cache for 1 day
}

header("Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE, PUT");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Handle Preflight
// 处理 OPTIONS 预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

/**
 * 辅助函数：返回 JSON 响应并结束脚本
 * 
 * @param mixed $data 响应数据
 * @param int $status HTTP 状态码 (默认 200)
 */
function jsonResponse($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data);
    exit;
}

// Session for Admin
// 开启 Session 用于后台登录状态维持
session_start();

/**
 * 辅助函数：检查管理员权限
 * 
 * 逻辑：检查 $_SESSION['is_admin'] 是否为 true
 * 异常处理：若未登录，直接返回 401 Unauthorized JSON 响应
 */
function check_admin_auth() {
    if (!isset($_SESSION['is_admin']) || $_SESSION['is_admin'] !== true) {
        jsonResponse(['error' => 'Unauthorized'], 401);
    }
}

/**
 * 辅助函数：检查普通用户登录状态
 * 
 * 逻辑：检查 $_SESSION['user_id'] 是否存在
 * 异常处理：若未登录，直接返回 401 Unauthorized JSON 响应
 */
function check_user_auth() {
    if (!isset($_SESSION['user_id']) || empty($_SESSION['user_id'])) {
        jsonResponse(['error' => '请先登录'], 401);
    }
}

/**
 * 辅助函数：获取当前登录用户信息
 * 
 * @return array|null 用户信息数组，未登录返回 null
 */
function get_current_logged_user() {
    if (!isset($_SESSION['user_id']) || empty($_SESSION['user_id'])) {
        return null;
    }
    return [
        'id' => $_SESSION['user_id'],
        'username' => $_SESSION['username'] ?? '',
        'nickname' => $_SESSION['nickname'] ?? '',
        'email' => $_SESSION['email'] ?? ''
    ];
}
?>