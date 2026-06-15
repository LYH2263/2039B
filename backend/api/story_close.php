<?php
require_once '../db.php';

$conn = get_db_connection();
check_user_auth();
$current_user = get_current_user();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $story_id = isset($input['story_id']) ? (int)$input['story_id'] : 0;

    if ($story_id <= 0) {
        jsonResponse(['error' => '无效的故事ID'], 400);
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

        if ($story['author_id'] != $current_user['id']) {
            $conn->rollback();
            jsonResponse(['error' => '只有作者可以封笔'], 403);
        }

        if ($story['status'] === 'closed') {
            $conn->rollback();
            jsonResponse(['error' => '该接龙已封笔'], 400);
        }

        $stmt = $conn->prepare("UPDATE stories SET status = 'closed', lock_user_id = NULL, lock_user_nickname = NULL, lock_expires_at = NULL WHERE id = ?");
        $stmt->bind_param("i", $story_id);
        $stmt->execute();

        $conn->commit();
        jsonResponse(['message' => '封笔成功，接龙已结束']);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => '操作失败：' . $e->getMessage()], 500);
    }
}
?>