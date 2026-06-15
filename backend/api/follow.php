<?php
/**
 * 关注关系接口 api/follow.php
 *
 * 用途：
 * 1. POST /api/follow.php?action=follow: 关注用户
 * 2. POST /api/follow.php?action=unfollow: 取消关注
 * 3. GET  /api/follow.php?action=status&user_id=xxx: 查询关注状态
 * 4. GET  /api/follow.php?action=stats&user_id=xxx: 获取用户粉丝/关注数
 * 5. GET  /api/follow.php?action=followers&user_id=xxx: 获取粉丝列表
 * 6. GET  /api/follow.php?action=followings&user_id=xxx: 获取关注列表
 *
 * 核心逻辑：
 * - 校验不能关注自己
 * - 使用 UNIQUE 索引保证幂等（INSERT IGNORE / DELETE）
 * - 统计查询使用 COUNT 聚合而非逐个遍历
 */

require_once '../db.php';

$conn = get_db_connection();
$current_user = get_current_logged_user();

$action = $_GET['action'] ?? ($_POST['action'] ?? '');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_user_auth();

    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? $action;
    $target_user_id = isset($input['user_id']) ? (int)$input['user_id'] : 0;

    if (empty($action)) {
        jsonResponse(['error' => '缺少 action 参数'], 400);
    }

    if ($target_user_id <= 0) {
        jsonResponse(['error' => '无效的用户ID'], 400);
    }

    if ($target_user_id === (int)$current_user['id']) {
        jsonResponse(['error' => '不能关注自己'], 400);
    }

    $target_stmt = $conn->prepare("SELECT id, nickname FROM users WHERE id = ?");
    $target_stmt->bind_param("i", $target_user_id);
    $target_stmt->execute();
    $target_result = $target_stmt->get_result();
    if ($target_result->num_rows === 0) {
        jsonResponse(['error' => '目标用户不存在'], 404);
    }
    $target_user = $target_result->fetch_assoc();

    if ($action === 'follow') {
        $stmt = $conn->prepare("INSERT IGNORE INTO follows (follower_id, following_id, follower_nickname, following_nickname) VALUES (?, ?, ?, ?)");
        $stmt->bind_param("iiss",
            $current_user['id'],
            $target_user_id,
            $current_user['nickname'],
            $target_user['nickname']
        );
        $stmt->execute();

        $stats = getUserFollowStats($conn, $target_user_id);

        if ($stmt->affected_rows > 0) {
            jsonResponse([
                'message' => '关注成功',
                'is_following' => true,
                'stats' => $stats
            ]);
        } else {
            jsonResponse([
                'message' => '已经关注过该用户',
                'is_following' => true,
                'stats' => $stats
            ]);
        }
    } elseif ($action === 'unfollow') {
        $stmt = $conn->prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?");
        $stmt->bind_param("ii", $current_user['id'], $target_user_id);
        $stmt->execute();

        $stats = getUserFollowStats($conn, $target_user_id);

        if ($stmt->affected_rows > 0) {
            jsonResponse([
                'message' => '已取消关注',
                'is_following' => false,
                'stats' => $stats
            ]);
        } else {
            jsonResponse([
                'message' => '未关注该用户',
                'is_following' => false,
                'stats' => $stats
            ]);
        }
    } else {
        jsonResponse(['error' => '无效的 action'], 400);
    }

} elseif ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($action === 'status') {
        $target_user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
        if ($target_user_id <= 0) {
            jsonResponse(['error' => '无效的用户ID'], 400);
        }

        $is_following = false;
        if ($current_user) {
            $stmt = $conn->prepare("SELECT id FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1");
            $stmt->bind_param("ii", $current_user['id'], $target_user_id);
            $stmt->execute();
            $result = $stmt->get_result();
            $is_following = $result->num_rows > 0;
        }

        $stats = getUserFollowStats($conn, $target_user_id);

        jsonResponse([
            'is_following' => $is_following,
            'is_self' => $current_user && ((int)$current_user['id'] === $target_user_id),
            'stats' => $stats
        ]);

    } elseif ($action === 'stats') {
        $target_user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
        if ($target_user_id <= 0) {
            jsonResponse(['error' => '无效的用户ID'], 400);
        }
        jsonResponse([
            'stats' => getUserFollowStats($conn, $target_user_id)
        ]);

    } elseif ($action === 'followers') {
        $target_user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
        if ($target_user_id <= 0) {
            jsonResponse(['error' => '无效的用户ID'], 400);
        }
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $per_page = 20;
        $offset = ($page - 1) * $per_page;

        $count_stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM follows WHERE following_id = ?");
        $count_stmt->bind_param("i", $target_user_id);
        $count_stmt->execute();
        $total = (int)$count_stmt->get_result()->fetch_assoc()['cnt'];

        $list = getFollowerOrFollowingList($conn, 'followers', $target_user_id, $offset, $per_page, $current_user);

        jsonResponse([
            'list' => $list,
            'pagination' => [
                'page' => $page,
                'per_page' => $per_page,
                'total' => $total,
                'total_pages' => ceil($total / $per_page)
            ]
        ]);

    } elseif ($action === 'followings') {
        $target_user_id = isset($_GET['user_id']) ? (int)$_GET['user_id'] : 0;
        if ($target_user_id <= 0) {
            jsonResponse(['error' => '无效的用户ID'], 400);
        }
        $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
        $per_page = 20;
        $offset = ($page - 1) * $per_page;

        $count_stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM follows WHERE follower_id = ?");
        $count_stmt->bind_param("i", $target_user_id);
        $count_stmt->execute();
        $total = (int)$count_stmt->get_result()->fetch_assoc()['cnt'];

        $list = getFollowerOrFollowingList($conn, 'followings', $target_user_id, $offset, $per_page, $current_user);

        jsonResponse([
            'list' => $list,
            'pagination' => [
                'page' => $page,
                'per_page' => $per_page,
                'total' => $total,
                'total_pages' => ceil($total / $per_page)
            ]
        ]);

    } else {
        jsonResponse(['error' => '无效的 action'], 400);
    }
} else {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

function getUserFollowStats($conn, $user_id) {
    $follower_stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM follows WHERE following_id = ?");
    $follower_stmt->bind_param("i", $user_id);
    $follower_stmt->execute();
    $follower_count = (int)$follower_stmt->get_result()->fetch_assoc()['cnt'];

    $following_stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM follows WHERE follower_id = ?");
    $following_stmt->bind_param("i", $user_id);
    $following_stmt->execute();
    $following_count = (int)$following_stmt->get_result()->fetch_assoc()['cnt'];

    return [
        'followers' => $follower_count,
        'followings' => $following_count
    ];
}

function getFollowerOrFollowingList($conn, $type, $target_user_id, $offset, $per_page, $current_user) {
    global $conn;

    if ($type === 'followers') {
        $sql = "SELECT f.follower_id as user_id, f.follower_nickname as nickname, f.created_at,
                       u.username, up.level, up.total_points, lb.badge_icon, lb.badge_color, lb.level_name
                FROM follows f
                LEFT JOIN users u ON f.follower_id = u.id
                LEFT JOIN user_points up ON u.id = up.user_id
                LEFT JOIN level_badges lb ON COALESCE(up.level, 1) = lb.level
                WHERE f.following_id = ?
                ORDER BY f.created_at DESC
                LIMIT ?, ?";
    } else {
        $sql = "SELECT f.following_id as user_id, f.following_nickname as nickname, f.created_at,
                       u.username, up.level, up.total_points, lb.badge_icon, lb.badge_color, lb.level_name
                FROM follows f
                LEFT JOIN users u ON f.following_id = u.id
                LEFT JOIN user_points up ON u.id = up.user_id
                LEFT JOIN level_badges lb ON COALESCE(up.level, 1) = lb.level
                WHERE f.follower_id = ?
                ORDER BY f.created_at DESC
                LIMIT ?, ?";
    }

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("iii", $target_user_id, $offset, $per_page);
    $stmt->execute();
    $result = $stmt->get_result();

    $user_ids = [];
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $user_ids[] = (int)$row['user_id'];
        $rows[] = $row;
    }

    $following_map = [];
    if ($current_user && !empty($user_ids)) {
        $placeholders = implode(',', array_fill(0, count($user_ids), '?'));
        $check_sql = "SELECT following_id FROM follows WHERE follower_id = ? AND following_id IN ($placeholders)";
        $check_stmt = $conn->prepare($check_sql);
        $types = 'i' . str_repeat('i', count($user_ids));
        $check_stmt->bind_param($types, $current_user['id'], ...$user_ids);
        $check_stmt->execute();
        $check_result = $check_stmt->get_result();
        while ($cr = $check_result->fetch_assoc()) {
            $following_map[(int)$cr['following_id']] = true;
        }
    }

    $list = [];
    foreach ($rows as $row) {
        $uid = (int)$row['user_id'];
        $list[] = [
            'user_id' => $uid,
            'username' => $row['username'],
            'nickname' => $row['nickname'],
            'followed_at' => $row['created_at'],
            'level' => (int)$row['level'],
            'level_name' => $row['level_name'] ?? 'Lv1 新手',
            'badge_icon' => $row['badge_icon'] ?? '🌱',
            'badge_color' => $row['badge_color'] ?? '#9CA3AF',
            'total_points' => (int)$row['total_points'],
            'is_following' => isset($following_map[$uid]),
            'is_self' => $current_user && ((int)$current_user['id'] === $uid)
        ];
    }

    return $list;
}
?>
