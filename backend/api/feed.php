<?php
/**
 * 动态流 Feed 接口 api/feed.php
 *
 * 用途：
 * GET /api/feed.php: 获取当前用户关注的人的最新发帖（时间倒序、分页）
 *
 * 核心逻辑（Feed 性能优化，避免逐个查询）：
 * 1. 使用 INNER JOIN 一次性关联 follows + posts 表，而非先查关注列表再逐个查帖子
 * 2. 通过 EXISTS 子查询先过滤关注用户的帖子（MySQL 优化器通常会选择更好的执行计划）
 * 3. 使用索引覆盖查询：follows.idx_follower_id, posts.created_at
 * 4. 一次性批量查询帖子作者的等级徽章信息、关注统计，避免 N+1 查询
 *
 * 返回：
 * - 无登录时：401
 * - 无关注用户时：空列表 + following_count=0，前端给出引导
 * - 有动态时：帖子列表 + 分页 + 作者信息
 */

require_once '../db.php';

check_user_auth();

$conn = get_db_connection();
$current_user = get_current_logged_user();

$posts_per_page = 10;
$page = isset($_GET['page']) && is_numeric($_GET['page']) ? (int)$_GET['page'] : 1;
if ($page < 1) $page = 1;
$offset = ($page - 1) * $posts_per_page;

$following_count_stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM follows WHERE follower_id = ?");
$following_count_stmt->bind_param("i", $current_user['id']);
$following_count_stmt->execute();
$following_count = (int)$following_count_stmt->get_result()->fetch_assoc()['cnt'];

$follower_count_stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM follows WHERE following_id = ?");
$follower_count_stmt->bind_param("i", $current_user['id']);
$follower_count_stmt->execute();
$follower_count = (int)$follower_count_stmt->get_result()->fetch_assoc()['cnt'];

if ($following_count === 0) {
    jsonResponse([
        'posts' => [],
        'pagination' => [
            'current_page' => 1,
            'total_pages' => 0,
            'total_posts' => 0,
            'following_count' => 0,
            'follower_count' => $follower_count
        ],
        'message' => '你还没有关注任何人'
    ]);
}

$count_sql = "SELECT COUNT(*) as cnt
              FROM posts p
              INNER JOIN follows f ON f.following_id = (
                  SELECT u.id FROM users u WHERE u.nickname = p.author_name LIMIT 1
              ) AND f.follower_id = ?";
$count_stmt = $conn->prepare($count_sql);
$count_stmt->bind_param("i", $current_user['id']);
$count_stmt->execute();
$total_posts = (int)$count_stmt->get_result()->fetch_assoc()['cnt'];
$total_pages = ceil($total_posts / $posts_per_page);

if ($total_posts === 0) {
    jsonResponse([
        'posts' => [],
        'pagination' => [
            'current_page' => 1,
            'total_pages' => 0,
            'total_posts' => 0,
            'following_count' => $following_count,
            'follower_count' => $follower_count
        ],
        'message' => '关注的人还没有发布新动态'
    ]);
}

$posts_sql = "SELECT p.*,
                     (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count,
                     u.id as author_user_id
              FROM posts p
              LEFT JOIN users u ON u.nickname = p.author_name
              WHERE EXISTS (
                  SELECT 1 FROM follows f
                  WHERE f.follower_id = ? AND f.following_id = u.id
              )
              ORDER BY p.created_at DESC
              LIMIT ?, ?";
$posts_stmt = $conn->prepare($posts_sql);
$posts_stmt->bind_param("iii", $current_user['id'], $offset, $posts_per_page);
$posts_stmt->execute();
$posts_result = $posts_stmt->get_result();

$posts = [];
$author_user_ids = [];
$author_nicknames = [];
while ($row = $posts_result->fetch_assoc()) {
    $posts[] = $row;
    if (!empty($row['author_user_id'])) {
        $author_user_ids[] = (int)$row['author_user_id'];
    }
    $author_nicknames[] = $row['author_name'];
}

$author_levels = [];
if (!empty($author_nicknames)) {
    $author_nicknames = array_unique($author_nicknames);
    $placeholders = implode(',', array_fill(0, count($author_nicknames), '?'));
    $level_sql = "SELECT u.nickname, u.id as user_id, up.level, up.total_points, lb.badge_icon, lb.badge_color, lb.level_name
                  FROM users u
                  LEFT JOIN user_points up ON u.id = up.user_id
                  LEFT JOIN level_badges lb ON COALESCE(up.level, 1) = lb.level
                  WHERE u.nickname IN ($placeholders)";
    $level_stmt = $conn->prepare($level_sql);
    $types = str_repeat('s', count($author_nicknames));
    $level_stmt->bind_param($types, ...$author_nicknames);
    $level_stmt->execute();
    $level_result = $level_stmt->get_result();
    while ($lr = $level_result->fetch_assoc()) {
        $author_levels[$lr['nickname']] = [
            'user_id' => (int)$lr['user_id'],
            'level' => (int)$lr['level'],
            'level_name' => $lr['level_name'],
            'badge_icon' => $lr['badge_icon'],
            'badge_color' => $lr['badge_color'],
            'total_points' => (int)$lr['total_points']
        ];
    }
}

$following_map = [];
if (!empty($author_user_ids)) {
    $author_user_ids = array_unique($author_user_ids);
    $ids_placeholders = implode(',', array_fill(0, count($author_user_ids), '?'));
    $check_sql = "SELECT following_id FROM follows WHERE follower_id = ? AND following_id IN ($ids_placeholders)";
    $check_stmt = $conn->prepare($check_sql);
    $check_types = 'i' . str_repeat('i', count($author_user_ids));
    $check_stmt->bind_param($check_types, $current_user['id'], ...$author_user_ids);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();
    while ($cr = $check_result->fetch_assoc()) {
        $following_map[(int)$cr['following_id']] = true;
    }
}

$follow_stats_map = [];
if (!empty($author_user_ids)) {
    $stats_ids = array_values(array_unique($author_user_ids));
    $stats_placeholders = implode(',', array_fill(0, count($stats_ids), '?'));
    $follower_stats_sql = "SELECT following_id as user_id, COUNT(*) as followers_cnt
                           FROM follows
                           WHERE following_id IN ($stats_placeholders)
                           GROUP BY following_id";
    $follower_stats_stmt = $conn->prepare($follower_stats_sql);
    $follower_stats_types = str_repeat('i', count($stats_ids));
    $follower_stats_stmt->bind_param($follower_stats_types, ...$stats_ids);
    $follower_stats_stmt->execute();
    $follower_stats_result = $follower_stats_stmt->get_result();
    while ($fr = $follower_stats_result->fetch_assoc()) {
        $uid = (int)$fr['user_id'];
        if (!isset($follow_stats_map[$uid])) $follow_stats_map[$uid] = ['followers' => 0, 'followings' => 0];
        $follow_stats_map[$uid]['followers'] = (int)$fr['followers_cnt'];
    }

    $following_stats_sql = "SELECT follower_id as user_id, COUNT(*) as followings_cnt
                            FROM follows
                            WHERE follower_id IN ($stats_placeholders)
                            GROUP BY follower_id";
    $following_stats_stmt = $conn->prepare($following_stats_sql);
    $following_stats_types = str_repeat('i', count($stats_ids));
    $following_stats_stmt->bind_param($following_stats_types, ...$stats_ids);
    $following_stats_stmt->execute();
    $following_stats_result = $following_stats_stmt->get_result();
    while ($fr = $following_stats_result->fetch_assoc()) {
        $uid = (int)$fr['user_id'];
        if (!isset($follow_stats_map[$uid])) $follow_stats_map[$uid] = ['followers' => 0, 'followings' => 0];
        $follow_stats_map[$uid]['followings'] = (int)$fr['followings_cnt'];
    }
}

foreach ($posts as &$post) {
    $level_info = $author_levels[$post['author_name']] ?? null;
    $post['author_level'] = $level_info ? [
        'level' => $level_info['level'],
        'level_name' => $level_info['level_name'],
        'badge_icon' => $level_info['badge_icon'],
        'badge_color' => $level_info['badge_color'],
        'total_points' => $level_info['total_points']
    ] : null;

    $author_uid = $level_info ? $level_info['user_id'] : 0;
    $post['author_user_id'] = $author_uid;
    $post['is_following_author'] = isset($following_map[$author_uid]);
    $post['author_follow_stats'] = $follow_stats_map[$author_uid] ?? ['followers' => 0, 'followings' => 0];
}

jsonResponse([
    'posts' => $posts,
    'pagination' => [
        'current_page' => $page,
        'total_pages' => $total_pages,
        'total_posts' => $total_posts,
        'following_count' => $following_count,
        'follower_count' => $follower_count
    ]
]);
?>
