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
require_once '../point_helper.php';

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

        $post_stmt = $conn->prepare("SELECT title, author_name FROM posts WHERE id = ?");
        $post_stmt->bind_param("i", $post_id);
        $post_stmt->execute();
        $post_result = $post_stmt->get_result();
        $post_row = $post_result->fetch_assoc();
        $post_title = $post_row ? $post_row['title'] : '';
        $post_author_name = $post_row ? $post_row['author_name'] : '';

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

        $commenter_points = null;
        $post_author_points = null;

        if ($current_user) {
            $commenter_points = add_points(
                $conn,
                $current_user['id'],
                $current_user['nickname'],
                'create_comment',
                'comment',
                $comment_id,
                null,
                $post_author_name,
                '评论帖子《' . mb_substr($post_title, 0, 20) . (mb_strlen($post_title) > 20 ? '...' : '') . '》'
            );

            $post_author_stmt = $conn->prepare("SELECT id, nickname FROM users WHERE nickname = ?");
            $post_author_stmt->bind_param("s", $post_author_name);
            $post_author_stmt->execute();
            $post_author_result = $post_author_stmt->get_result();
            $post_author_row = $post_author_result->fetch_assoc();

            if ($post_author_row && $post_author_row['id'] != $current_user['id']) {
                $post_author_points = add_points(
                    $conn,
                    $post_author_row['id'],
                    $post_author_row['nickname'],
                    'receive_comment',
                    'comment',
                    $comment_id,
                    $current_user['id'],
                    $current_user['nickname'],
                    '帖子《' . mb_substr($post_title, 0, 20) . (mb_strlen($post_title) > 20 ? '...' : '') . '》被 ' . $current_user['nickname'] . ' 评论'
                );
            }
        }

        $conn->commit();

        jsonResponse([
            'message' => 'Comment created',
            'id' => $comment_id,
            'mentioned_users' => $mentioned_users,
            'commenter_points' => $commenter_points,
            'post_author_points' => $post_author_points
        ], 201);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => $e->getMessage()], 500);
    }
}
?>