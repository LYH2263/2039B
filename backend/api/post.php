<?php
/**
 * 帖子详情接口 api/post.php
 * 
 * 用途：
 * 获取单个帖子的详细内容及其下属评论列表。
 * 
 * 核心逻辑：
 * 1. 验证 ID 参数合法性
 * 2. 查询 posts 表获取帖子详情
 * 3. 查询 comments 表获取该帖子的所有评论
 * 4. 渲染 @提及 为高亮链接
 * 5. 查询作者和评论者的等级徽章信息
 * 
 * 异常处理：
 * - 400 Bad Request: ID 参数缺失或非数字
 * - 404 Not Found: 帖子不存在
 */

require_once '../db.php';
require_once '../mention_helper.php';

$conn = get_db_connection();

if (!isset($_GET['id']) || !is_numeric($_GET['id'])) {
    jsonResponse(['error' => 'Invalid ID'], 400);
}

$post_id = (int)$_GET['id'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $conn->prepare("SELECT * FROM posts WHERE id = ?");
    $stmt->bind_param("i", $post_id);
    $stmt->execute();
    $post_result = $stmt->get_result();

    if ($post_result->num_rows === 0) {
        jsonResponse(['error' => 'Post not found'], 404);
    }
    $post = $post_result->fetch_assoc();

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
        $level_sql = "SELECT u.nickname, up.level, up.total_points, lb.badge_icon, lb.badge_color, lb.level_name
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
                'level' => (int)$lr['level'],
                'level_name' => $lr['level_name'],
                'badge_icon' => $lr['badge_icon'],
                'badge_color' => $lr['badge_color'],
                'total_points' => (int)$lr['total_points']
            ];
        }
    }

    $post['author_level'] = $user_levels[$post['author_name']] ?? null;
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