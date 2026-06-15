<?php
/**
 * 积分系统接口 api/points.php
 *
 * 用途：
 * 1. GET ?action=overview: 获取当前登录用户的积分概览（积分、等级、下一等级进度）
 * 2. GET ?action=transactions&page=1: 获取当前用户的积分流水（分页）
 * 3. GET ?action=levels: 获取所有等级徽章配置
 * 4. GET ?action=badges&user_ids=1,2,3: 批量获取多个用户的等级徽章
 *
 * 核心逻辑：
 * - 需要用户登录（check_user_auth）
 * - 所有查询通过 point_helper.php 中的函数完成
 *
 * 异常处理：
 * - 401 Unauthorized: 未登录
 * - 400 Bad Request: 参数错误
 */

require_once '../db.php';
require_once '../point_helper.php';

$conn = get_db_connection();
$current_user = get_current_logged_user();

$action = $_GET['action'] ?? 'overview';

if ($action === 'overview' || $action === 'transactions') {
    check_user_auth();
}

if ($action === 'overview') {
    $overview = get_user_points_overview($conn, $current_user['id'], $current_user['nickname']);
    jsonResponse($overview);

} elseif ($action === 'transactions') {
    $page = isset($_GET['page']) && is_numeric($_GET['page']) ? (int)$_GET['page'] : 1;
    $per_page = isset($_GET['per_page']) && is_numeric($_GET['per_page']) ? (int)$_GET['per_page'] : 20;

    $result = get_user_point_transactions($conn, $current_user['id'], $page, $per_page);
    jsonResponse($result);

} elseif ($action === 'levels') {
    $badges = get_all_level_badges($conn);
    jsonResponse(['levels' => array_values($badges)]);

} elseif ($action === 'rules') {
    $result = $conn->query("SELECT * FROM point_rules WHERE is_enabled = 1 ORDER BY id ASC");
    $rules = [];
    while ($row = $result->fetch_assoc()) {
        $rules[] = [
            'action_type' => $row['action_type'],
            'action_name' => $row['action_name'],
            'points' => (int)$row['points'],
            'daily_limit' => (int)$row['daily_limit'],
            'description' => $row['description']
        ];
    }

    if (empty($rules)) {
        $config_rules = POINT_RULES;
        foreach ($config_rules as $action_type => $config) {
            $rules[] = [
                'action_type' => $action_type,
                'action_name' => $config['name'],
                'points' => (int)$config['points'],
                'daily_limit' => (int)$config['daily_limit'],
                'description' => $config['description']
            ];
        }
    }

    jsonResponse(['rules' => $rules]);

} elseif ($action === 'badges') {
    $user_ids_param = $_GET['user_ids'] ?? '';
    if (empty($user_ids_param)) {
        jsonResponse(['badges' => []]);
    }

    $user_ids = array_filter(array_map('intval', explode(',', $user_ids_param)));
    $badges = get_users_level_badges($conn, $user_ids);
    jsonResponse(['badges' => $badges]);

} else {
    jsonResponse(['error' => 'Invalid action'], 400);
}
?>
