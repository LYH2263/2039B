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
 * 6. 配置时区和定时发布相关辅助函数
 * 
 * 核心逻辑：
 * - 检测 HTTP_ORIGIN 实现动态 CORS 允许
 * - session_start() 启动会话
 * 
 * 异常处理：
 * - 401 Unauthorized: check_admin_auth() 在未登录时返回
 */

// Timezone configuration
// 时区配置：统一使用北京时间（东八区）
date_default_timezone_set('Asia/Shanghai');

// Database configuration
// 数据库连接配置
define('DB_HOST', 'db'); 
define('DB_NAME', 'www.17speed.vip');
define('DB_USER', 'www.17speed.vip');
define('DB_PASS', '19821230a');

// Post status constants
// 帖子状态常量
define('POST_STATUS_SCHEDULED', 'scheduled');
define('POST_STATUS_PUBLISHED', 'published');

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

/**
 * 辅助函数：检查并发布到期的定时帖子（惰性检查机制）
 * 
 * 核心逻辑：
 * 1. 查询所有 status=scheduled 且 scheduled_at <= 当前时间 的帖子
 * 2. 使用事务 + 行锁保证并发安全
 * 3. 更新状态为 published 并设置 published_at
 * 4. 幂等保证：只更新 status=scheduled 的行
 * 
 * @param mysqli $conn 数据库连接
 * @return int 实际发布的帖子数量
 */
function publish_due_scheduled_posts($conn) {
    $now = date('Y-m-d H:i:s');
    $published_count = 0;

    $conn->begin_transaction();

    try {
        $select_sql = "SELECT id FROM posts 
                       WHERE status = ? AND scheduled_at IS NOT NULL AND scheduled_at <= ?
                       FOR UPDATE";
        $select_stmt = $conn->prepare($select_sql);
        $status_scheduled = POST_STATUS_SCHEDULED;
        $select_stmt->bind_param("ss", $status_scheduled, $now);
        $select_stmt->execute();
        $result = $select_stmt->get_result();

        $due_ids = [];
        while ($row = $result->fetch_assoc()) {
            $due_ids[] = (int)$row['id'];
        }
        $select_stmt->close();

        if (!empty($due_ids)) {
            $placeholders = implode(',', array_fill(0, count($due_ids), '?'));
            $update_sql = "UPDATE posts 
                           SET status = ?, published_at = ?, scheduled_at = NULL 
                           WHERE id IN ($placeholders) AND status = ?";
            $update_stmt = $conn->prepare($update_sql);

            $status_published = POST_STATUS_PUBLISHED;
            $status_scheduled_again = POST_STATUS_SCHEDULED;

            $types = "ss" . str_repeat("i", count($due_ids)) . "s";
            $params = [$status_published, $now];
            foreach ($due_ids as $id) {
                $params[] = $id;
            }
            $params[] = $status_scheduled_again;

            $update_stmt->bind_param($types, ...$params);
            $update_stmt->execute();
            $published_count = $update_stmt->affected_rows;
            $update_stmt->close();
        }

        $conn->commit();
    } catch (Exception $e) {
        $conn->rollback();
        error_log("publish_due_scheduled_posts error: " . $e->getMessage());
    }

    return $published_count;
}

/**
 * 辅助函数：立即发布指定的定时帖子（管理员手动发布）
 * 
 * 幂等保证：只有 status=scheduled 的帖子才会被更新
 * 
 * @param mysqli $conn 数据库连接
 * @param int $post_id 帖子ID
 * @return array ['success' => bool, 'message' => string, 'already_published' => bool]
 */
function publish_scheduled_post_now($conn, $post_id) {
    $post_id = (int)$post_id;

    $check_stmt = $conn->prepare("SELECT status, title FROM posts WHERE id = ?");
    $check_stmt->bind_param("i", $post_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows === 0) {
        $check_stmt->close();
        return ['success' => false, 'message' => '帖子不存在', 'already_published' => false];
    }

    $post = $check_result->fetch_assoc();
    $check_stmt->close();

    if ($post['status'] === POST_STATUS_PUBLISHED) {
        return ['success' => true, 'message' => '帖子已经发布', 'already_published' => true];
    }

    if ($post['status'] !== POST_STATUS_SCHEDULED) {
        return ['success' => false, 'message' => '帖子状态不支持此操作', 'already_published' => false];
    }

    $now = date('Y-m-d H:i:s');
    $update_stmt = $conn->prepare("UPDATE posts 
                                   SET status = ?, published_at = ?, scheduled_at = NULL 
                                   WHERE id = ? AND status = ?");
    $status_published = POST_STATUS_PUBLISHED;
    $status_scheduled = POST_STATUS_SCHEDULED;
    $update_stmt->bind_param("ssis", $status_published, $now, $post_id, $status_scheduled);
    $update_stmt->execute();

    $success = $update_stmt->affected_rows > 0;
    $update_stmt->close();

    return [
        'success' => $success,
        'message' => $success ? '发布成功' : '发布失败，请重试',
        'already_published' => false
    ];
}

/**
 * 辅助函数：取消定时发布（将 scheduled 状态的帖子取消计划，改为草稿或删除由调用者决定）
 * 这里的实现是：清除 scheduled_at，将状态改为 published 不合适，改为保留 scheduled 但无计划时间，
 * 更合理的是保留原内容但清除计划，让用户可以重新设置。
 * 实际：清除 scheduled_at，保持 status=scheduled 表示待处理草稿，还是恢复 published？
 * 设计为：取消计划 = 删除定时信息，保留内容，状态保持 scheduled（表示"草稿/待发布"，用户可以重新设置时间或手动发布）。
 * 另：如果用户想删除，就用删除接口。
 * 
 * @param mysqli $conn 数据库连接
 * @param int $post_id 帖子ID
 * @return array ['success' => bool, 'message' => string]
 */
function cancel_scheduled_post($conn, $post_id) {
    $post_id = (int)$post_id;

    $check_stmt = $conn->prepare("SELECT status FROM posts WHERE id = ?");
    $check_stmt->bind_param("i", $post_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows === 0) {
        $check_stmt->close();
        return ['success' => false, 'message' => '帖子不存在'];
    }

    $post = $check_result->fetch_assoc();
    $check_stmt->close();

    if ($post['status'] !== POST_STATUS_SCHEDULED) {
        return ['success' => false, 'message' => '只有待发布状态的帖子才能取消计划'];
    }

    $update_stmt = $conn->prepare("UPDATE posts SET scheduled_at = NULL WHERE id = ? AND status = ?");
    $status_scheduled = POST_STATUS_SCHEDULED;
    $update_stmt->bind_param("is", $post_id, $status_scheduled);
    $update_stmt->execute();

    $success = $update_stmt->affected_rows > 0;
    $update_stmt->close();

    return ['success' => $success, 'message' => $success ? '已取消发布计划' : '操作失败，请重试'];
}

/**
 * 辅助函数：校验计划发布时间是否合法（必须是未来时间）
 * 
 * @param string $scheduled_at 待校验的时间字符串（Y-m-d H:i:s 格式）
 * @return array ['valid' => bool, 'message' => string, 'formatted' => string]
 */
function validate_scheduled_time($scheduled_at) {
    if (empty($scheduled_at)) {
        return ['valid' => true, 'message' => '', 'formatted' => null];
    }

    $timestamp = strtotime($scheduled_at);
    if ($timestamp === false) {
        return ['valid' => false, 'message' => '计划发布时间格式不正确', 'formatted' => null];
    }

    $now = time();
    if ($timestamp <= $now) {
        return ['valid' => false, 'message' => '计划发布时间必须是未来时间', 'formatted' => null];
    }

    $formatted = date('Y-m-d H:i:s', $timestamp);
    return ['valid' => true, 'message' => '', 'formatted' => $formatted];
}
?>