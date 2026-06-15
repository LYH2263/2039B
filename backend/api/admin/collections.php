<?php
require_once '../../db.php';
check_admin_auth();

$conn = get_db_connection();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['id']) && is_numeric($_GET['id'])) {
        $collection_id = (int)$_GET['id'];
        $stmt = $conn->prepare("SELECT c.*, u.nickname as author_nickname 
                                FROM collections c 
                                LEFT JOIN users u ON c.author_id = u.id 
                                WHERE c.id = ?");
        $stmt->bind_param("i", $collection_id);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result->num_rows === 0) {
            $stmt->close();
            jsonResponse(['error' => '合集不存在'], 404);
        }
        $collection = $result->fetch_assoc();
        $stmt->close();

        $posts_sql = "SELECT p.id, p.title, p.author_name, p.status, cp.sort_order 
                      FROM collection_posts cp 
                      JOIN posts p ON cp.post_id = p.id 
                      WHERE cp.collection_id = ? 
                      ORDER BY cp.sort_order ASC";
        $posts_stmt = $conn->prepare($posts_sql);
        $posts_stmt->bind_param("i", $collection_id);
        $posts_stmt->execute();
        $posts_result = $posts_stmt->get_result();
        $posts = [];
        while ($row = $posts_result->fetch_assoc()) {
            $posts[] = $row;
        }
        $posts_stmt->close();

        jsonResponse(['collection' => $collection, 'posts' => $posts]);
    }

    $sql = "SELECT c.*, u.nickname as author_nickname 
            FROM collections c 
            LEFT JOIN users u ON c.author_id = u.id 
            ORDER BY c.created_at DESC";
    $result = $conn->query($sql);

    $collections = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $collections[] = $row;
        }
        $result->free();
    }

    jsonResponse(['collections' => $collections]);

} elseif ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if (!isset($_GET['id'])) jsonResponse(['error' => 'Missing ID'], 400);
    $id = (int)$_GET['id'];

    $stmt = $conn->prepare("DELETE FROM collections WHERE id = ?");
    $stmt->bind_param("i", $id);
    if ($stmt->execute()) {
        jsonResponse(['message' => '合集已删除']);
    } else {
        jsonResponse(['error' => '删除失败'], 500);
    }

} elseif ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!isset($input['id'])) jsonResponse(['error' => 'Missing ID'], 400);

    $id = (int)$input['id'];
    $title = trim($input['title'] ?? '');
    $description = trim($input['description'] ?? '');
    $cover_image = trim($input['cover_image'] ?? '');

    if (empty($title)) {
        jsonResponse(['error' => '标题不能为空'], 400);
    }

    $stmt = $conn->prepare("UPDATE collections SET title = ?, description = ?, cover_image = ? WHERE id = ?");
    $stmt->bind_param("sssi", $title, $description, $cover_image, $id);
    if ($stmt->execute()) {
        jsonResponse(['message' => '更新成功']);
    } else {
        jsonResponse(['error' => '更新失败'], 500);
    }
}
