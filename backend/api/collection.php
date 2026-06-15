<?php
require_once '../db.php';

$conn = get_db_connection();

if (!isset($_GET['id']) || !is_numeric($_GET['id'])) {
    jsonResponse(['error' => '无效的合集ID'], 400);
}

$collection_id = (int)$_GET['id'];

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
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

    $posts_sql = "SELECT p.id, p.title, p.author_name, p.created_at, p.published_at, 
                         cp.sort_order,
                         (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comment_count
                  FROM collection_posts cp 
                  JOIN posts p ON cp.post_id = p.id 
                  WHERE cp.collection_id = ? AND p.status = 'published'
                  ORDER BY cp.sort_order ASC";
    $posts_stmt = $conn->prepare($posts_sql);
    $posts_stmt->bind_param("i", $collection_id);
    $posts_stmt->execute();
    $posts_result = $posts_stmt->get_result();

    $posts = [];
    while ($row = $posts_result->fetch_assoc()) {
        $row['sort_order'] = (int)$row['sort_order'];
        $row['comment_count'] = (int)$row['comment_count'];
        $posts[] = $row;
    }
    $posts_stmt->close();

    $ghost_sql = "SELECT cp.post_id, cp.sort_order 
                  FROM collection_posts cp 
                  LEFT JOIN posts p ON cp.post_id = p.id 
                  WHERE cp.collection_id = ? AND (p.id IS NULL OR p.status != 'published')";
    $ghost_stmt = $conn->prepare($ghost_sql);
    $ghost_stmt->bind_param("i", $collection_id);
    $ghost_stmt->execute();
    $ghost_result = $ghost_stmt->get_result();
    $ghost_count = $ghost_result->num_rows;
    $ghost_stmt->close();

    $current_user = get_current_logged_user();
    $is_owner = $current_user && (int)$current_user['id'] === (int)$collection['author_id'];

    if ($ghost_count > 0 && $is_owner) {
        $conn->begin_transaction();
        try {
            $del_ghost = $conn->prepare("DELETE cp FROM collection_posts cp 
                                         LEFT JOIN posts p ON cp.post_id = p.id 
                                         WHERE cp.collection_id = ? AND (p.id IS NULL OR p.status != 'published')");
            $del_ghost->bind_param("i", $collection_id);
            $del_ghost->execute();
            $del_ghost->close();

            $reorder_sql = "SELECT id FROM collection_posts WHERE collection_id = ? ORDER BY sort_order ASC, id ASC";
            $ro_stmt = $conn->prepare($reorder_sql);
            $ro_stmt->bind_param("i", $collection_id);
            $ro_stmt->execute();
            $ro_result = $ro_stmt->get_result();
            $ro_items = [];
            while ($ro_row = $ro_result->fetch_assoc()) {
                $ro_items[] = $ro_row;
            }
            $ro_stmt->close();

            $up_stmt = $conn->prepare("UPDATE collection_posts SET sort_order = ? WHERE id = ?");
            $order = 0;
            foreach ($ro_items as $item) {
                $up_stmt->bind_param("ii", $order, $item['id']);
                $up_stmt->execute();
                $order++;
            }
            $up_stmt->close();

            $real_count = count($posts);
            $cnt_stmt = $conn->prepare("UPDATE collections SET post_count = ? WHERE id = ?");
            $cnt_stmt->bind_param("ii", $real_count, $collection_id);
            $cnt_stmt->execute();
            $cnt_stmt->close();

            $conn->commit();
        } catch (Exception $e) {
            $conn->rollback();
        }
    }

    jsonResponse([
        'collection' => $collection,
        'posts' => $posts,
        'is_owner' => $is_owner
    ]);
}
