<?php
require_once '../db.php';

$conn = get_db_connection();
$current_user = get_current_logged_user();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stories_per_page = 10;
    $page = isset($_GET['page']) && is_numeric($_GET['page']) ? (int)$_GET['page'] : 1;
    if ($page < 1) $page = 1;
    $offset = ($page - 1) * $stories_per_page;
    $status = isset($_GET['status']) ? trim($_GET['status']) : 'all';

    $where_sql = '';
    $params = [];
    $param_types = '';
    
    if ($status === 'active' || $status === 'closed') {
        $where_sql = "WHERE s.status = ?";
        $params[] = $status;
        $param_types .= 's';
    }

    $total_sql = "SELECT COUNT(*) as count FROM stories s $where_sql";
    $stmt = $conn->prepare($total_sql);
    if (!empty($params)) {
        $stmt->bind_param($param_types, ...$params);
    }
    $stmt->execute();
    $total_row = $stmt->get_result()->fetch_assoc();
    $total_stories = $total_row['count'];
    $total_pages = ceil($total_stories / $stories_per_page);

    $sql = "SELECT s.*, 
                   (SELECT COUNT(*) FROM story_paragraphs sp WHERE sp.story_id = s.id) as paragraph_count,
                   (SELECT MAX(sp.paragraph_order) FROM story_paragraphs sp WHERE sp.story_id = s.id) as max_order
            FROM stories s
            $where_sql
            ORDER BY s.created_at DESC
            LIMIT ?, ?";
    
    $params[] = $offset;
    $params[] = $stories_per_page;
    $param_types .= 'ii';
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($param_types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $stories = [];
    while ($row = $result->fetch_assoc()) {
        $stories[] = $row;
    }

    jsonResponse([
        'stories' => $stories,
        'pagination' => [
            'current_page' => $page,
            'total_pages' => $total_pages,
            'total_stories' => $total_stories
        ]
    ]);
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    check_user_auth();
    
    $input = json_decode(file_get_contents('php://input'), true);
    $title = trim($input['title'] ?? '');
    $opening_paragraph = trim($input['opening_paragraph'] ?? '');
    $max_words_per_paragraph = isset($input['max_words_per_paragraph']) ? (int)$input['max_words_per_paragraph'] : 100;

    if (empty($title) || empty($opening_paragraph)) {
        jsonResponse(['error' => '标题和开头段落都不能为空'], 400);
    }

    if ($max_words_per_paragraph < 10 || $max_words_per_paragraph > 2000) {
        jsonResponse(['error' => '每段字数上限必须在10-2000之间'], 400);
    }

    $opening_word_count = mb_strlen($opening_paragraph);
    if ($opening_word_count > $max_words_per_paragraph) {
        jsonResponse(['error' => "开头段落字数($opening_word_count)超过上限($max_words_per_paragraph)"], 400);
    }

    $conn->begin_transaction();
    
    try {
        $stmt = $conn->prepare("INSERT INTO stories (title, opening_paragraph, max_words_per_paragraph, author_id, author_nickname) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param("sssis", $title, $opening_paragraph, $max_words_per_paragraph, $current_user['id'], $current_user['nickname']);
        $stmt->execute();
        $story_id = $conn->insert_id;

        $stmt = $conn->prepare("INSERT INTO story_paragraphs (story_id, paragraph_order, content, author_id, author_nickname, word_count) VALUES (?, 0, ?, ?, ?, ?)");
        $stmt->bind_param("isssi", $story_id, $opening_paragraph, $current_user['id'], $current_user['nickname'], $opening_word_count);
        $stmt->execute();

        $conn->commit();
        jsonResponse(['message' => '接龙故事创建成功', 'story_id' => $story_id], 201);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => '创建失败：' . $e->getMessage()], 500);
    }
}
?>