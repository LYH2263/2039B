<?php
require_once '../db.php';

$conn = get_db_connection();
check_user_auth();
$current_user = get_current_user();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $story_id = isset($input['story_id']) ? (int)$input['story_id'] : 0;
    $action = trim($input['action'] ?? '');

    if ($story_id <= 0) {
        jsonResponse(['error' => '无效的故事ID'], 400);
    }

    if (!in_array($action, ['acquire', 'release'])) {
        jsonResponse(['error' => '无效的操作'], 400);
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

        if ($action === 'acquire') {
            if ($story['lock_user_id'] !== null && $story['lock_user_id'] != $current_user['id']) {
                $remaining = max(0, strtotime($story['lock_expires_at']) - time());
                $conn->rollback();
                jsonResponse([
                    'error' => $story['lock_user_nickname'] . ' 正在续写，剩余 ' . formatTime($remaining)
                ], 409);
            }

            $lock_duration = 120;
            $expires_at = date('Y-m-d H:i:s', time() + $lock_duration);
            
            $stmt = $conn->prepare("UPDATE stories SET lock_user_id = ?, lock_user_nickname = ?, lock_expires_at = ? WHERE id = ?");
            $stmt->bind_param("issi", $current_user['id'], $current_user['nickname'], $expires_at, $story_id);
            $stmt->execute();

            $conn->commit();
            jsonResponse([
                'message' => '获取锁成功',
                'lock' => [
                    'user_id' => $current_user['id'],
                    'nickname' => $current_user['nickname'],
                    'expires_at' => $expires_at,
                    'duration_seconds' => $lock_duration,
                    'remaining_seconds' => $lock_duration
                ]
            ]);
        } elseif ($action === 'release') {
            if ($story['lock_user_id'] !== null && $story['lock_user_id'] != $current_user['id']) {
                $conn->rollback();
                jsonResponse(['error' => '你没有持有该锁'], 403);
            }

            $stmt = $conn->prepare("UPDATE stories SET lock_user_id = NULL, lock_user_nickname = NULL, lock_expires_at = NULL WHERE id = ?");
            $stmt->bind_param("i", $story_id);
            $stmt->execute();

            $conn->commit();
            jsonResponse(['message' => '锁已释放']);
        }
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => '操作失败：' . $e->getMessage()], 500);
    }
}

function formatTime($seconds) {
    $minutes = floor($seconds / 60);
    $secs = $seconds % 60;
    return sprintf('%02d:%02d', $minutes, $secs);
}
?>