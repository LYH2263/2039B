<?php
/**
 * 帖子列表与发布接口 api/posts.php
 * 
 * 用途：
 * 1. GET: 获取帖子列表（支持分页）
 * 2. POST: 发布新帖子
 * 
 * 核心逻辑：
 * - GET: 计算分页偏移量，查询 posts 表（关联 comments 统计评论数），返回帖子数组和分页信息。
 * - POST: 接收 JSON 数据，插入新记录到 posts 表，解析并保存 @提及。
 * 
 * 异常处理：
 * - 400 Bad Request: 发帖时必填字段缺失。
 * - 500 Internal Server Error: 数据库查询或插入失败。
 */

require_once '../db.php';
require_once '../mention_helper.php';
require_once '../point_helper.php';

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // 核心逻辑：处理分页参数
    $posts_per_page = 10;
    $page = isset($_GET['page']) && is_numeric($_GET['page']) ? (int)$_GET['page'] : 1;
    if ($page < 1) $page = 1;
    $offset = ($page - 1) * $posts_per_page;

    // 核心逻辑：获取总记录数用于计算分页
    $total_result = $conn->query("SELECT COUNT(*) as count FROM posts");
    $total_row = $total_result->fetch_assoc();
    $total_posts = $total_row['count'];
    $total_pages = ceil($total_posts / $posts_per_page);

    $sql = "SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count 
            FROM posts p 
            ORDER BY p.created_at DESC 
            LIMIT ?, ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("ii", $offset, $posts_per_page);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $posts = [];
    $author_nicknames = [];
    while($row = $result->fetch_assoc()) {
        $posts[] = $row;
        $author_nicknames[] = $row['author_name'];
    }

    $author_levels = [];
    if (!empty($author_nicknames)) {
        $author_nicknames = array_unique($author_nicknames);
        $placeholders = implode(',', array_fill(0, count($author_nicknames), '?'));
        $level_sql = "SELECT u.id as user_id, u.nickname, up.level, up.total_points, lb.badge_icon, lb.badge_color, lb.level_name
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

    foreach ($posts as &$post) {
        $post['author_level'] = $author_levels[$post['author_name']] ?? null;
        if ($post['author_level'] && isset($post['author_level']['user_id'])) {
            $post['author_user_id'] = $post['author_level']['user_id'];
        }
    }

    jsonResponse([
        'posts' => $posts,
        'pagination' => [
            'current_page' => $page,
            'total_pages' => $total_pages,
            'total_posts' => $total_posts
        ]
    ]);
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Create Post
    // 核心逻辑：发布帖子
    $input = json_decode(file_get_contents('php://input'), true);
    $title = trim($input['title'] ?? '');
    $author = trim($input['author'] ?? '');
    $content = trim($input['content'] ?? '');

    if (empty($title) || empty($author) || empty($content)) {
        jsonResponse(['error' => 'All fields are required'], 400);
    }

    $current_user = get_current_logged_user();
    $mentioner_user_id = $current_user ? $current_user['id'] : null;
    $mentioner_nickname = $current_user ? $current_user['nickname'] : $author;

    $conn->begin_transaction();

    try {
        $stmt = $conn->prepare("INSERT INTO posts (title, author_name, content) VALUES (?, ?, ?)");
        $stmt->bind_param("sss", $title, $mentioner_nickname, $content);
        
        if (!$stmt->execute()) {
            throw new Exception('Failed to create post');
        }

        $post_id = $conn->insert_id;

        $mentioned_users = save_mentions(
            $conn,
            'post',
            $post_id,
            $post_id,
            $content,
            $mentioner_nickname,
            $mentioner_user_id,
            $title
        );

        $points_transaction = null;
        if ($current_user) {
            $points_transaction = add_points(
                $conn,
                $current_user['id'],
                $current_user['nickname'],
                'create_post',
                'post',
                $post_id,
                null,
                null,
                '发布帖子《' . mb_substr($title, 0, 20) . (mb_strlen($title) > 20 ? '...' : '') . '》'
            );
        }

        $conn->commit();

        jsonResponse([
            'message' => 'Post created',
            'id' => $post_id,
            'mentioned_users' => $mentioned_users,
            'points_transaction' => $points_transaction
        ], 201);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => $e->getMessage()], 500);
    }
}
?>