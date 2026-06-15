<?php
/**
 * 帖子列表与发布接口 api/posts.php
 * 
 * 用途：
 * 1. GET: 获取帖子列表（支持分页）
 * 2. POST: 发布新帖子（支持立即发布或定时发布）
 * 
 * 核心逻辑：
 * - GET: 
 *   1. 执行惰性检查：先发布所有到期的定时帖子
 *   2. 计算分页偏移量，仅查询 status=published 的帖子
 *   3. 关联 comments 统计评论数，返回帖子数组和分页信息。
 * - POST: 
 *   1. 接收 JSON 数据（含可选的 publish_mode 和 scheduled_at）
 *   2. 校验计划发布时间（必须是未来时间）
 *   3. 根据模式设置 status 和 scheduled_at 字段
 *   4. 插入新记录到 posts 表，解析并保存 @提及。
 * 
 * 异常处理：
 * - 400 Bad Request: 必填字段缺失 / 计划发布时间无效。
 * - 500 Internal Server Error: 数据库查询或插入失败。
 */

require_once '../db.php';
require_once '../mention_helper.php';
require_once '../point_helper.php';

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // 惰性检查：发布到期的定时帖子
    publish_due_scheduled_posts($conn);

    // 核心逻辑：处理分页参数
    $posts_per_page = 10;
    $page = isset($_GET['page']) && is_numeric($_GET['page']) ? (int)$_GET['page'] : 1;
    if ($page < 1) $page = 1;
    $offset = ($page - 1) * $posts_per_page;

    $status_published = POST_STATUS_PUBLISHED;

    // 核心逻辑：获取已发布帖子总数用于计算分页
    $total_stmt = $conn->prepare("SELECT COUNT(*) as count FROM posts WHERE status = ?");
    $total_stmt->bind_param("s", $status_published);
    $total_stmt->execute();
    $total_result = $total_stmt->get_result();
    $total_row = $total_result->fetch_assoc();
    $total_posts = (int)$total_row['count'];
    $total_pages = $total_posts > 0 ? ceil($total_posts / $posts_per_page) : 0;
    $total_stmt->close();

    // 使用 COALESCE 优先用 published_at 排序，没有则用 created_at
    $sql = "SELECT p.*, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count 
            FROM posts p 
            WHERE p.status = ?
            ORDER BY COALESCE(p.published_at, p.created_at) DESC 
            LIMIT ?, ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("sii", $status_published, $offset, $posts_per_page);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $posts = [];
    $author_nicknames = [];
    while($row = $result->fetch_assoc()) {
        $posts[] = $row;
        $author_nicknames[] = $row['author_name'];
    }
    $stmt->close();

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
        $level_stmt->close();
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
    // 核心逻辑：发布帖子（支持立即/定时）
    $input = json_decode(file_get_contents('php://input'), true);
    $title = trim($input['title'] ?? '');
    $author = trim($input['author'] ?? '');
    $content = trim($input['content'] ?? '');
    $publish_mode = $input['publish_mode'] ?? 'immediate'; // 'immediate' 或 'scheduled'
    $scheduled_at_raw = trim($input['scheduled_at'] ?? '');

    if (empty($title) || empty($author) || empty($content)) {
        jsonResponse(['error' => '标题、作者、内容均为必填项'], 400);
    }

    // 校验并格式化计划发布时间
    $scheduled_at = null;
    $post_status = POST_STATUS_PUBLISHED;
    $published_at = date('Y-m-d H:i:s');

    if ($publish_mode === 'scheduled') {
        $validation = validate_scheduled_time($scheduled_at_raw);
        if (!$validation['valid']) {
            jsonResponse(['error' => $validation['message']], 400);
        }
        $scheduled_at = $validation['formatted'];
        $post_status = POST_STATUS_SCHEDULED;
        $published_at = null;
    }

    $current_user = get_current_logged_user();
    $mentioner_user_id = $current_user ? $current_user['id'] : null;
    $mentioner_nickname = $current_user ? $current_user['nickname'] : $author;

    $conn->begin_transaction();

    try {
        $stmt = $conn->prepare("INSERT INTO posts (title, author_name, content, status, scheduled_at, published_at) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("ssssss", $title, $mentioner_nickname, $content, $post_status, $scheduled_at, $published_at);
        
        if (!$stmt->execute()) {
            throw new Exception('发布失败，请稍后重试');
        }

        $post_id = $conn->insert_id;
        $stmt->close();

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

        // 只有立即发布的帖子才立即积分结算，定时发布的在到期发布时结算（或者这里就结算？设计为创建即结算更简单）
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

        $response_data = [
            'message' => $post_status === POST_STATUS_SCHEDULED ? '已设置定时发布' : '发布成功',
            'id' => $post_id,
            'status' => $post_status,
            'scheduled_at' => $scheduled_at,
            'mentioned_users' => $mentioned_users,
            'points_transaction' => $points_transaction
        ];

        jsonResponse($response_data, 201);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => $e->getMessage()], 500);
    }
}
?>