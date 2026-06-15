<?php
/**
 * 后台帖子管理接口 api/admin/posts.php
 * 
 * 用途：
 * 管理员对帖子进行列表、删除、更新、立即发布、取消计划等操作。
 * 
 * 核心逻辑：
 * 1. 鉴权：调用 check_admin_auth() 确保管理员登录
 * 2. GET: 返回所有帖子列表（包括待发布和已发布）
 * 3. DELETE: 删除指定 ID 的帖子
 * 4. PUT: 更新指定 ID 的帖子标题和内容
 * 5. POST (action=publish_now): 立即发布指定的定时帖子
 * 6. POST (action=cancel_schedule): 取消指定帖子的发布计划
 * 
 * 异常处理：
 * - 401 Unauthorized: 未登录（由 check_admin_auth 处理）
 * - 400 Bad Request: ID 缺失或更新数据不完整
 * - 500 Internal Server Error: 数据库操作失败
 */

require_once '../../db.php';
check_admin_auth();

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // 惰性检查：发布到期的定时帖子，保证列表状态最新
    publish_due_scheduled_posts($conn);

    // 支持单条查询（供后台编辑用）
    if (isset($_GET['id']) && is_numeric($_GET['id'])) {
        $post_id = (int)$_GET['id'];
        $stmt = $conn->prepare("SELECT p.*, 
                                       (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
                                FROM posts p WHERE p.id = ?");
        $stmt->bind_param("i", $post_id);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows === 0) {
            $stmt->close();
            jsonResponse(['error' => '帖子不存在'], 404);
        }
        $post = $result->fetch_assoc();
        $stmt->close();
        jsonResponse(['post' => $post]);
    }

    // 返回所有帖子（按创建时间倒序），包含状态和评论数
    $sql = "SELECT p.*, 
                   (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
            FROM posts p 
            ORDER BY p.created_at DESC";
    $result = $conn->query($sql);

    $posts = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $posts[] = $row;
        }
        $result->free();
    }

    jsonResponse([
        'posts' => $posts
    ]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    // 异常处理：参数校验
    if (!isset($_GET['id'])) jsonResponse(['error' => 'Missing ID'], 400);
    $id = (int)$_GET['id'];
    
    // 核心逻辑：删除帖子
    $stmt = $conn->prepare("DELETE FROM posts WHERE id = ?");
    $stmt->bind_param("i", $id);
    if ($stmt->execute()) {
        jsonResponse(['message' => 'Post deleted']);
    } else {
        jsonResponse(['error' => 'Failed to delete'], 500);
    }

} elseif ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!isset($input['id'])) jsonResponse(['error' => 'Missing ID'], 400);
    
    $id = (int)$input['id'];
    $title = trim($input['title'] ?? '');
    $content = trim($input['content'] ?? '');
    
    // 异常处理：字段校验
    if (empty($title) || empty($content)) {
        jsonResponse(['error' => 'Title and Content required'], 400);
    }
    
    // 核心逻辑：更新帖子
    $stmt = $conn->prepare("UPDATE posts SET title = ?, content = ? WHERE id = ?");
    $stmt->bind_param("ssi", $title, $content, $id);
    if ($stmt->execute()) {
        jsonResponse(['message' => 'Post updated']);
    } else {
        jsonResponse(['error' => 'Failed to update'], 500);
    }

} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';
    $id = isset($input['id']) ? (int)$input['id'] : 0;

    if ($id <= 0) {
        jsonResponse(['error' => '缺少有效的帖子ID'], 400);
    }

    switch ($action) {
        case 'publish_now':
            $result = publish_scheduled_post_now($conn, $id);
            if ($result['success']) {
                jsonResponse([
                    'message' => $result['message'],
                    'already_published' => $result['already_published']
                ]);
            } else {
                jsonResponse(['error' => $result['message']], 400);
            }
            break;

        case 'cancel_schedule':
            $result = cancel_scheduled_post($conn, $id);
            if ($result['success']) {
                jsonResponse(['message' => $result['message']]);
            } else {
                jsonResponse(['error' => $result['message']], 400);
            }
            break;

        case 'reschedule':
            $new_scheduled_at = trim($input['scheduled_at'] ?? '');
            $validation = validate_scheduled_time($new_scheduled_at);
            if (!$validation['valid']) {
                jsonResponse(['error' => $validation['message']], 400);
            }

            $check_stmt = $conn->prepare("SELECT status FROM posts WHERE id = ?");
            $check_stmt->bind_param("i", $id);
            $check_stmt->execute();
            $check_result = $check_stmt->get_result();
            if ($check_result->num_rows === 0) {
                $check_stmt->close();
                jsonResponse(['error' => '帖子不存在'], 404);
            }
            $post = $check_result->fetch_assoc();
            $check_stmt->close();

            if ($post['status'] !== POST_STATUS_SCHEDULED) {
                jsonResponse(['error' => '只有待发布状态的帖子才能重设发布时间'], 400);
            }

            $formatted_time = $validation['formatted'];
            $status_scheduled = POST_STATUS_SCHEDULED;
            $update_stmt = $conn->prepare("UPDATE posts SET scheduled_at = ? WHERE id = ? AND status = ?");
            $update_stmt->bind_param("sis", $formatted_time, $id, $status_scheduled);
            $update_stmt->execute();

            if ($update_stmt->affected_rows > 0) {
                $update_stmt->close();
                jsonResponse([
                    'message' => '发布时间已更新',
                    'scheduled_at' => $formatted_time
                ]);
            } else {
                $update_stmt->close();
                jsonResponse(['error' => '更新失败，请稍后重试'], 500);
            }
            break;

        default:
            jsonResponse(['error' => '不支持的操作类型'], 400);
    }
}
?>