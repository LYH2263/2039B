<?php
/**
 * 评论发布接口 api/comments.php
 * 
 * 用途：
 * 处理用户提交的新评论。
 * 
 * 核心逻辑：
 * 接收 JSON 数据，验证后插入 comments 表，解析并保存 @提及。
 * 
 * 异常处理：
 * - 400 Bad Request: 必填字段缺失或 post_id 无效
 * - 500 Internal Server Error: 数据库插入失败
 */

require_once '../db.php';
require_once '../mention_helper.php';

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $post_id = isset($input['post_id']) ? (int)$input['post_id'] : 0;
    $nickname = trim($input['nickname'] ?? '');
    $content = trim($input['content'] ?? '');

    if ($post_id <= 0 || empty($nickname) || empty($content)) {
        jsonResponse(['error' => 'Invalid input'], 400);
    }

    $current_user = get_current_logged_user();
    $mentioner_user_id = $current_user ? $current_user['id'] : null;
    $mentioner_nickname = $current_user ? $current_user['nickname'] : $nickname;

    $conn->begin_transaction();

    try {
        $stmt = $conn->prepare("INSERT INTO comments (post_id, author_name, content) VALUES (?, ?, ?)");
        $stmt->bind_param("iss", $post_id, $mentioner_nickname, $content);
        
        if (!$stmt->execute()) {
            throw new Exception('Failed to create comment');
        }

        $comment_id = $conn->insert_id;

        $post_stmt = $conn->prepare("SELECT title FROM posts WHERE id = ?");
        $post_stmt->bind_param("i", $post_id);
        $post_stmt->execute();
        $post_result = $post_stmt->get_result();
        $post_row = $post_result->fetch_assoc();
        $post_title = $post_row ? $post_row['title'] : '';

        $mentioned_users = save_mentions(
            $conn,
            'comment',
            $comment_id,
            $post_id,
            $content,
            $mentioner_nickname,
            $mentioner_user_id,
            $post_title
        );

        $conn->commit();

        jsonResponse([
            'message' => 'Comment created',
            'id' => $comment_id,
            'mentioned_users' => $mentioned_users
        ], 201);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => $e->getMessage()], 500);
    }
}
?>