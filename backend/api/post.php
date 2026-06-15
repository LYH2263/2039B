<?php
/**
 * 帖子详情接口 api/post.php
 * 
 * 用途：
 * 获取单个帖子的详细内容及其下属评论列表。
 * 
 * 核心逻辑：
 * 1. 验证 ID 参数合法性
 * 2. 执行惰性检查：先发布到期的定时帖子
 * 3. 查询 posts 表获取帖子详情（仅允许 status=published 的帖子对外可见）
 * 4. 查询 comments 表获取该帖子的所有评论
 * 5. 渲染 @提及 为高亮链接
 * 6. 查询作者和评论者的等级徽章信息
 * 
 * 异常处理：
 * - 400 Bad Request: ID 参数缺失或非数字
 * - 404 Not Found: 帖子不存在或未发布
 */

require_once '../db.php';
require_once '../mention_helper.php';

$conn = get_db_connection();

if (!isset($_GET['id']) || !is_numeric($_GET['id'])) {
    jsonResponse(['error' => 'Invalid ID'], 400);
}

$post_id = (int)$_GET['id'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // 惰性检查：发布到期的定时帖子
    publish_due_scheduled_posts($conn);

    // 只允许访问已发布的帖子，未发布的对外返回 404
    $status_published = POST_STATUS_PUBLISHED;
    $stmt = $conn->prepare("SELECT * FROM posts WHERE id = ? AND status = ?");
    $stmt->bind_param("is", $post_id, $status_published);
    $stmt->execute();
    $post_result = $stmt->get_result();

    if ($post_result->num_rows === 0) {
        // 再查一次确认帖子是否存在（用于区分真不存在和未发布的情况，对外统一 404 即可）
        $stmt->close();
        $check_stmt = $conn->prepare("SELECT id FROM posts WHERE id = ?");
        $check_stmt->bind_param("i", $post_id);
        $check_stmt->execute();
        $check_result = $check_stmt->get_result();
        $exists = $check_result->num_rows > 0;
        $check_stmt->close();
        
        if ($exists) {
            jsonResponse(['error' => '帖子暂未发布'], 404);
        } else {
            jsonResponse(['error' => 'Post not found'], 404);
        }
    }
    $post = $post_result->fetch_assoc();
    $stmt->close();

    $stmt = $conn->prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC");
    $stmt->bind_param("i", $post_id);
    $stmt->execute();
    $comments_result = $stmt->get_result();
    
    $comments = [];
    $all_nicknames = [$post['author_name']];
    while($row = $comments_result->fetch_assoc()) {
        $comments[] = $row;
        $all_nicknames[] = $row['author_name'];
    }

    $user_levels = [];
    $all_nicknames = array_unique($all_nicknames);
    if (!empty($all_nicknames)) {
        $placeholders = implode(',', array_fill(0, count($all_nicknames), '?'));
        $level_sql = "SELECT u.id as user_id, u.nickname, up.level, up.total_points, lb.badge_icon, lb.badge_color, lb.level_name
                      FROM users u
                      LEFT JOIN user_points up ON u.id = up.user_id
                      LEFT JOIN level_badges lb ON COALESCE(up.level, 1) = lb.level
                      WHERE u.nickname IN ($placeholders)";
        $level_stmt = $conn->prepare($level_sql);
        $types = str_repeat('s', count($all_nicknames));
        $level_stmt->bind_param($types, ...$all_nicknames);
        $level_stmt->execute();
        $level_result = $level_stmt->get_result();
        while ($lr = $level_result->fetch_assoc()) {
            $user_levels[$lr['nickname']] = [
                'user_id' => (int)$lr['user_id'],
                'level' => (int)$lr['level'],
                'level_name' => $lr['level_name'],
                'badge_icon' => $lr['badge_icon'],
                'badge_color' => $lr['badge_color'],
                'total_points' => (int)$lr['total_points']
            ];
        }
    }

    if ($post['author_level'] && isset($post['author_level']['user_id'])) {
        $post['author_user_id'] = $post['author_level']['user_id'];
    }
    $post['content_rendered'] = render_mentions_text($post['content'], $conn);
    
    foreach ($comments as &$comment) {
        $comment['author_level'] = $user_levels[$comment['author_name']] ?? null;
        $comment['content_rendered'] = render_mentions_text($comment['content'], $conn);
    }

    jsonResponse([
        'post' => $post,
        'comments' => $comments
    ]);
}
?>