<?php
/**
 * 积分服务 point_helper.php
 *
 * 用途：
 * 1. 管理积分规则读取（优先数据库，兜底配置文件）
 * 2. 管理等级徽章读取（优先数据库，兜底配置文件）
 * 3. 核心函数 add_points()：积分变更的原子性与幂等性保证
 * 4. 根据积分自动计算并更新等级
 * 5. 提供查询用户积分、积分流水的辅助函数
 *
 * 核心设计：
 * - 幂等性：通过 idempotency_key 唯一索引保证同一动作不会重复结算
 * - 原子性：使用数据库事务保证流水记录与积分余额更新同时成功或失败
 * - 每日限制：对有 daily_limit 的规则进行当日次数检查
 * - 自动升级：积分变更后自动计算并更新用户等级
 *
 * 异常处理：
 * - 重复结算：通过唯一索引捕获并静默返回已有记录
 * - 超出每日限制：返回 false 并记录说明
 * - 数据库错误：抛出异常由调用方处理回滚
 */

require_once __DIR__ . '/db.php';

/**
 * 获取积分规则（优先从数据库读取，兜底从配置文件）
 *
 * @param mysqli $conn 数据库连接
 * @param string $action_type 动作类型
 * @return array|null 规则数组，包含 points, daily_limit, is_enabled 等
 */
function get_point_rule($conn, $action_type) {
    $stmt = $conn->prepare("SELECT * FROM point_rules WHERE action_type = ? AND is_enabled = 1");
    $stmt->bind_param("s", $action_type);
    $stmt->execute();
    $result = $stmt->get_result();
    $rule = $result->fetch_assoc();

    if ($rule) {
        return $rule;
    }

    $config_rules = POINT_RULES;
    if (isset($config_rules[$action_type])) {
        return [
            'action_type' => $action_type,
            'action_name' => $config_rules[$action_type]['name'],
            'points' => $config_rules[$action_type]['points'],
            'daily_limit' => $config_rules[$action_type]['daily_limit'],
            'is_enabled' => 1,
            'description' => $config_rules[$action_type]['description']
        ];
    }

    return null;
}

/**
 * 获取所有等级徽章配置（优先从数据库读取，兜底从配置文件）
 *
 * @param mysqli $conn 数据库连接
 * @return array 等级数组，按level升序排列
 */
function get_all_level_badges($conn) {
    $result = $conn->query("SELECT * FROM level_badges ORDER BY level ASC");
    $badges = [];
    while ($row = $result->fetch_assoc()) {
        $badges[$row['level']] = $row;
    }

    if (!empty($badges)) {
        return $badges;
    }

    $config_badges = LEVEL_BADGES;
    $badges = [];
    foreach ($config_badges as $level => $config) {
        $badges[$level] = [
            'level' => $level,
            'level_name' => $config['name'],
            'min_points' => $config['min_points'],
            'badge_icon' => $config['icon'],
            'badge_color' => $config['color'],
            'description' => ''
        ];
    }
    return $badges;
}

/**
 * 根据积分计算对应的等级
 *
 * @param mysqli $conn 数据库连接
 * @param int $total_points 累计总积分
 * @return array 等级信息数组
 */
function calculate_level_by_points($conn, $total_points) {
    $badges = get_all_level_badges($conn);
    $current_level = 1;
    $current_badge = null;
    $next_badge = null;

    foreach ($badges as $level => $badge) {
        if ($total_points >= $badge['min_points']) {
            $current_level = $level;
            $current_badge = $badge;
        } else {
            if ($next_badge === null) {
                $next_badge = $badge;
            }
            break;
        }
    }

    return [
        'level' => $current_level,
        'level_info' => $current_badge,
        'next_level_info' => $next_badge
    ];
}

/**
 * 生成幂等键
 * 格式：{user_id}_{action_type}_{source_type}_{source_id}
 *
 * @param int $user_id 用户ID
 * @param string $action_type 动作类型
 * @param string|null $source_type 来源类型
 * @param int|null $source_id 来源ID
 * @return string 幂等键
 */
function generate_idempotency_key($user_id, $action_type, $source_type = null, $source_id = null) {
    $parts = [$user_id, $action_type];
    if ($source_type !== null) {
        $parts[] = $source_type;
    }
    if ($source_id !== null) {
        $parts[] = $source_id;
    }
    return implode('_', $parts);
}

/**
 * 检查用户今日该动作是否已达每日上限
 *
 * @param mysqli $conn 数据库连接
 * @param int $user_id 用户ID
 * @param string $action_type 动作类型
 * @param int $daily_limit 每日上限次数，0表示不限
 * @return bool 是否已达上限
 */
function check_daily_limit($conn, $user_id, $action_type, $daily_limit) {
    if ($daily_limit <= 0) {
        return false;
    }

    $today = date('Y-m-d 00:00:00');
    $tomorrow = date('Y-m-d 00:00:00', strtotime('+1 day'));

    $stmt = $conn->prepare("SELECT COUNT(*) as count FROM point_transactions 
                            WHERE user_id = ? AND action_type = ? 
                            AND created_at >= ? AND created_at < ?");
    $stmt->bind_param("isss", $user_id, $action_type, $today, $tomorrow);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();

    return $row['count'] >= $daily_limit;
}

/**
 * 确保用户积分记录存在，不存在则创建
 *
 * @param mysqli $conn 数据库连接
 * @param int $user_id 用户ID
 * @param string $nickname 用户昵称
 * @return int 用户积分记录ID
 */
function ensure_user_points_record($conn, $user_id, $nickname) {
    $stmt = $conn->prepare("SELECT id FROM user_points WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();

    if ($row) {
        return $row['id'];
    }

    $stmt = $conn->prepare("INSERT INTO user_points (user_id, nickname, total_points, current_points, level) 
                            VALUES (?, ?, 0, 0, 1)");
    $stmt->bind_param("is", $user_id, $nickname);
    $stmt->execute();

    return $conn->insert_id;
}

/**
 * 增加用户积分（核心函数）
 *
 * 保证原子性：使用事务，流水记录与余额更新同时成功或失败
 * 保证幂等性：通过唯一索引 idempotency_key 防止重复结算
 * 自动升级：积分变更后自动计算并更新等级
 *
 * @param mysqli $conn 数据库连接（必须已开启事务）
 * @param int $user_id 用户ID
 * @param string $nickname 用户昵称
 * @param string $action_type 动作类型（create_post/receive_comment/create_comment）
 * @param string|null $source_type 来源类型（post/comment）
 * @param int|null $source_id 来源ID
 * @param int|null $related_user_id 关联用户ID
 * @param string|null $related_user_nickname 关联用户昵称
 * @param string|null $description 自定义说明
 * @return array|null 成功返回流水记录，失败返回null（如每日上限、重复结算）
 * @throws Exception 数据库操作异常
 */
function add_points($conn, $user_id, $nickname, $action_type, 
                    $source_type = null, $source_id = null,
                    $related_user_id = null, $related_user_nickname = null,
                    $description = null) {
    $rule = get_point_rule($conn, $action_type);
    if (!$rule || $rule['is_enabled'] != 1) {
        return null;
    }

    $idempotency_key = generate_idempotency_key($user_id, $action_type, $source_type, $source_id);

    $check_stmt = $conn->prepare("SELECT * FROM point_transactions WHERE idempotency_key = ? FOR UPDATE");
    $check_stmt->bind_param("s", $idempotency_key);
    $check_stmt->execute();
    $existing = $check_stmt->get_result()->fetch_assoc();
    if ($existing) {
        return $existing;
    }

    if (check_daily_limit($conn, $user_id, $action_type, $rule['daily_limit'])) {
        return null;
    }

    ensure_user_points_record($conn, $user_id, $nickname);

    $update_stmt = $conn->prepare("UPDATE user_points 
                                   SET total_points = total_points + ?, 
                                       current_points = current_points + ?,
                                       nickname = ?
                                   WHERE user_id = ?");
    $points = (int)$rule['points'];
    $update_stmt->bind_param("iisi", $points, $points, $nickname, $user_id);
    $update_stmt->execute();

    $balance_stmt = $conn->prepare("SELECT total_points FROM user_points WHERE user_id = ? FOR UPDATE");
    $balance_stmt->bind_param("i", $user_id);
    $balance_stmt->execute();
    $balance_row = $balance_stmt->get_result()->fetch_assoc();
    $balance_after = (int)$balance_row['total_points'];

    $level_result = calculate_level_by_points($conn, $balance_after);
    $new_level = $level_result['level'];

    $level_stmt = $conn->prepare("UPDATE user_points SET level = ? WHERE user_id = ?");
    $level_stmt->bind_param("ii", $new_level, $user_id);
    $level_stmt->execute();

    if ($description === null) {
        $description = $rule['action_name'] . ' +' . $points . '分';
    }

    $insert_stmt = $conn->prepare("INSERT INTO point_transactions 
        (user_id, action_type, points_change, balance_after, source_type, source_id, 
         related_user_id, related_user_nickname, description, idempotency_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $points_change = $points;
    $insert_stmt->bind_param("isiississs", 
        $user_id, $action_type, $points_change, $balance_after,
        $source_type, $source_id, $related_user_id, $related_user_nickname,
        $description, $idempotency_key
    );

    try {
        $insert_stmt->execute();
    } catch (mysqli_sql_exception $e) {
        if ($e->getCode() == 1062) {
            $check_stmt2 = $conn->prepare("SELECT * FROM point_transactions WHERE idempotency_key = ?");
            $check_stmt2->bind_param("s", $idempotency_key);
            $check_stmt2->execute();
            return $check_stmt2->get_result()->fetch_assoc();
        }
        throw $e;
    }

    $transaction_id = $conn->insert_id;
    $select_stmt = $conn->prepare("SELECT * FROM point_transactions WHERE id = ?");
    $select_stmt->bind_param("i", $transaction_id);
    $select_stmt->execute();
    return $select_stmt->get_result()->fetch_assoc();
}

/**
 * 获取用户积分概览信息
 *
 * @param mysqli $conn 数据库连接
 * @param int $user_id 用户ID
 * @param string $nickname 用户昵称（用于创建记录）
 * @return array 包含当前积分、等级、下一等级信息、距离下一级所需积分
 */
function get_user_points_overview($conn, $user_id, $nickname = '') {
    ensure_user_points_record($conn, $user_id, $nickname);

    $stmt = $conn->prepare("SELECT * FROM user_points WHERE user_id = ?");
    $stmt->bind_param("i", $user_id);
    $stmt->execute();
    $user_points = $stmt->get_result()->fetch_assoc();

    $level_result = calculate_level_by_points($conn, $user_points['total_points']);
    $badges = get_all_level_badges($conn);

    $points_to_next = 0;
    if ($level_result['next_level_info']) {
        $points_to_next = $level_result['next_level_info']['min_points'] - $user_points['total_points'];
    }

    $total_levels = count($badges);
    $is_max_level = $user_points['level'] >= $total_levels;

    return [
        'user_id' => $user_id,
        'nickname' => $user_points['nickname'],
        'total_points' => (int)$user_points['total_points'],
        'current_points' => (int)$user_points['current_points'],
        'level' => (int)$user_points['level'],
        'level_info' => $level_result['level_info'],
        'next_level_info' => $level_result['next_level_info'],
        'points_to_next_level' => $points_to_next,
        'is_max_level' => $is_max_level,
        'all_badges' => array_values($badges),
        'updated_at' => $user_points['updated_at']
    ];
}

/**
 * 获取用户积分流水列表（分页）
 *
 * @param mysqli $conn 数据库连接
 * @param int $user_id 用户ID
 * @param int $page 页码
 * @param int $per_page 每页条数
 * @return array 包含流水列表和分页信息
 */
function get_user_point_transactions($conn, $user_id, $page = 1, $per_page = 20) {
    if ($page < 1) $page = 1;
    $offset = ($page - 1) * $per_page;

    $count_stmt = $conn->prepare("SELECT COUNT(*) as count FROM point_transactions WHERE user_id = ?");
    $count_stmt->bind_param("i", $user_id);
    $count_stmt->execute();
    $count_row = $count_stmt->get_result()->fetch_assoc();
    $total = (int)$count_row['count'];
    $total_pages = ceil($total / $per_page);

    $stmt = $conn->prepare("SELECT * FROM point_transactions 
                            WHERE user_id = ? 
                            ORDER BY created_at DESC, id DESC 
                            LIMIT ?, ?");
    $stmt->bind_param("iii", $user_id, $offset, $per_page);
    $stmt->execute();
    $result = $stmt->get_result();

    $transactions = [];
    while ($row = $result->fetch_assoc()) {
        $transactions[] = [
            'id' => (int)$row['id'],
            'action_type' => $row['action_type'],
            'points_change' => (int)$row['points_change'],
            'balance_after' => (int)$row['balance_after'],
            'source_type' => $row['source_type'],
            'source_id' => $row['source_id'] ? (int)$row['source_id'] : null,
            'related_user_nickname' => $row['related_user_nickname'],
            'description' => $row['description'],
            'created_at' => $row['created_at']
        ];
    }

    return [
        'transactions' => $transactions,
        'pagination' => [
            'current_page' => $page,
            'per_page' => $per_page,
            'total' => $total,
            'total_pages' => $total_pages
        ]
    ];
}

/**
 * 批量获取多个用户的等级徽章信息
 *
 * @param mysqli $conn 数据库连接
 * @param array $user_ids 用户ID数组
 * @return array 以user_id为key的等级信息数组
 */
function get_users_level_badges($conn, $user_ids) {
    if (empty($user_ids)) {
        return [];
    }

    $user_ids = array_unique(array_map('intval', $user_ids));
    $placeholders = implode(',', array_fill(0, count($user_ids), '?'));

    $badges = get_all_level_badges($conn);

    $stmt = $conn->prepare("SELECT user_id, level, total_points, nickname 
                            FROM user_points WHERE user_id IN ($placeholders)");
    $stmt->bind_param(str_repeat('i', count($user_ids)), ...$user_ids);
    $stmt->execute();
    $result = $stmt->get_result();

    $user_levels = [];
    while ($row = $result->fetch_assoc()) {
        $level = (int)$row['level'];
        $user_levels[$row['user_id']] = [
            'user_id' => (int)$row['user_id'],
            'nickname' => $row['nickname'],
            'total_points' => (int)$row['total_points'],
            'level' => $level,
            'level_info' => $badges[$level] ?? null
        ];
    }

    return $user_levels;
}
?>
