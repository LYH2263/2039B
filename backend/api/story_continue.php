<?php
require_once '../db.php';

$conn = get_db_connection();
check_user_auth();
$current_user = get_current_user();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $story_id = isset($input['story_id']) ? (int)$input['story_id'] : 0;
    $content = trim($input['content'] ?? '');

    if ($story_id <= 0) {
        jsonResponse(['error' => '无效的故事ID'], 400);
    }

    if (empty($content)) {
        jsonResponse(['error' => '续写内容不能为空'], 400);
    }

    $word_count = mb_strlen($content);
    
    if ($word_count === 0) {
        jsonResponse(['error' => '续写内容不能为空'], 400);
    }

    $conn->begin_transaction();
    
    try {
        $stmt = $conn->prepare("SELECT * FROM stories WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $story_id);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($result->num_rows === 0) {
            $conn->rollback();
            jsonResponse(['error' => '故事不存在'], 404);
        }
        
        $story = $result->fetch_assoc();

        if ($story['status'] !== 'active') {
            $conn->rollback();
            jsonResponse(['error' => '该接龙已结束，无法续写'], 400);
        }

        if ($story['lock_expires_at'] !== null && strtotime($story['lock_expires_at']) < time()) {
            $stmt = $conn->prepare("UPDATE stories SET lock_user_id = NULL, lock_user_nickname = NULL, lock_expires_at = NULL WHERE id = ?");
            $stmt->bind_param("i", $story_id);
            $stmt->execute();
            $story['lock_user_id'] = null;
            $story['lock_user_nickname'] = null;
            $story['lock_expires_at'] = null;
        }

        if ($story['lock_user_id'] === null) {
            $conn->rollback();
            jsonResponse(['error' => '请先点击「我要续写」获取编辑权'], 400);
        }

        if ($story['lock_user_id'] != $current_user['id']) {
            $remaining = max(0, strtotime($story['lock_expires_at']) - time());
            $conn->rollback();
            jsonResponse(['error' => $story['lock_user_nickname'] . ' 正在续写，请等待'], 409);
        }

        if ($word_count > $story['max_words_per_paragraph']) {
            $conn->rollback();
            jsonResponse(['error' => "字数超过上限，当前 {$word_count} 字，上限 {$story['max_words_per_paragraph']} 字"], 400);
        }

        $stmt = $conn->prepare("SELECT MAX(paragraph_order) as max_order FROM story_paragraphs WHERE story_id = ?");
        $stmt->bind_param("i", $story_id);
        $stmt->execute();
        $order_result = $stmt->get_result()->fetch_assoc();
        $next_order = ($order_result['max_order'] === null) ? 0 : ($order_result['max_order'] + 1);

        $stmt = $conn->prepare("INSERT INTO story_paragraphs (story_id, paragraph_order, content, author_id, author_nickname, word_count) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("iisssi", $story_id, $next_order, $content, $current_user['id'], $current_user['nickname'], $word_count);
        $stmt->execute();

        $stmt = $conn->prepare("UPDATE stories SET lock_user_id = NULL, lock_user_nickname = NULL, lock_expires_at = NULL WHERE id = ?");
        $stmt->bind_param("i", $story_id);
        $stmt->execute();

        $conn->commit();
        
        jsonResponse([
            'message' => '续写成功',
            'paragraph' => [
                'id' => $conn->insert_id,
                'paragraph_order' => $next_order,
                'content' => $content,
                'author_nickname' => $current_user['nickname'],
                'word_count' => $word_count,
                'created_at' => date('Y-m-d H:i:s')
            ]
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => '提交失败：' . $e->getMessage()], 500);
    }
}
?>