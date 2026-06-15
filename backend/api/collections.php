<?php
require_once '../db.php';

$conn = get_db_connection();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($method === 'GET') {
    if ($action === 'list') {
        handleListCollections($conn);
    } elseif ($action === 'my') {
        handleMyCollections($conn);
    } elseif ($action === 'post_collections') {
        handlePostCollections($conn);
    } else {
        handleListCollections($conn);
    }
} elseif ($method === 'POST') {
    if ($action === 'create') {
        handleCreateCollection($conn);
    } elseif ($action === 'update') {
        handleUpdateCollection($conn);
    } elseif ($action === 'delete') {
        handleDeleteCollection($conn);
    } elseif ($action === 'add_post') {
        handleAddPost($conn);
    } elseif ($action === 'remove_post') {
        handleRemovePost($conn);
    } elseif ($action === 'reorder_posts') {
        handleReorderPosts($conn);
    } elseif ($action === 'batch_add_posts') {
        handleBatchAddPosts($conn);
    } else {
        jsonResponse(['error' => '未知操作'], 400);
    }
} else {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

function handleListCollections($conn) {
    $page = isset($_GET['page']) && is_numeric($_GET['page']) ? (int)$_GET['page'] : 1;
    if ($page < 1) $page = 1;
    $per_page = 12;
    $offset = ($page - 1) * $per_page;

    $author_id = isset($_GET['author_id']) && is_numeric($_GET['author_id']) ? (int)$_GET['author_id'] : null;

    if ($author_id) {
        $total_stmt = $conn->prepare("SELECT COUNT(*) as count FROM collections WHERE author_id = ?");
        $total_stmt->bind_param("i", $author_id);
    } else {
        $total_stmt = $conn->prepare("SELECT COUNT(*) as count FROM collections");
    }
    $total_stmt->execute();
    $total_row = $total_stmt->get_result()->fetch_assoc();
    $total = (int)$total_row['count'];
    $total_pages = $total > 0 ? ceil($total / $per_page) : 0;
    $total_stmt->close();

    if ($author_id) {
        $sql = "SELECT c.*, u.nickname as author_nickname 
                FROM collections c 
                LEFT JOIN users u ON c.author_id = u.id 
                WHERE c.author_id = ?
                ORDER BY c.updated_at DESC 
                LIMIT ?, ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("iii", $author_id, $offset, $per_page);
    } else {
        $sql = "SELECT c.*, u.nickname as author_nickname 
                FROM collections c 
                LEFT JOIN users u ON c.author_id = u.id 
                ORDER BY c.updated_at DESC 
                LIMIT ?, ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param("ii", $offset, $per_page);
    }
    $stmt->execute();
    $result = $stmt->get_result();

    $collections = [];
    while ($row = $result->fetch_assoc()) {
        $row['post_count'] = (int)$row['post_count'];
        $collections[] = $row;
    }
    $stmt->close();

    jsonResponse([
        'collections' => $collections,
        'pagination' => [
            'current_page' => $page,
            'total_pages' => $total_pages,
            'total' => $total
        ]
    ]);
}

function handleMyCollections($conn) {
    check_user_auth();
    $current_user = get_current_logged_user();

    $stmt = $conn->prepare("SELECT * FROM collections WHERE author_id = ? ORDER BY updated_at DESC");
    $stmt->bind_param("i", $current_user['id']);
    $stmt->execute();
    $result = $stmt->get_result();

    $collections = [];
    while ($row = $result->fetch_assoc()) {
        $row['post_count'] = (int)$row['post_count'];
        $collections[] = $row;
    }
    $stmt->close();

    jsonResponse(['collections' => $collections]);
}

function handlePostCollections($conn) {
    $post_id = isset($_GET['post_id']) && is_numeric($_GET['post_id']) ? (int)$_GET['post_id'] : 0;
    if (!$post_id) {
        jsonResponse(['error' => '缺少post_id参数'], 400);
    }

    $sql = "SELECT c.id, c.title, c.description, c.cover_image, cp.sort_order 
            FROM collection_posts cp 
            JOIN collections c ON cp.collection_id = c.id 
            WHERE cp.post_id = ? 
            ORDER BY cp.sort_order ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $post_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $collections = [];
    while ($row = $result->fetch_assoc()) {
        $collections[] = $row;
    }
    $stmt->close();

    jsonResponse(['collections' => $collections]);
}

function handleCreateCollection($conn) {
    check_user_auth();
    $current_user = get_current_logged_user();

    $input = json_decode(file_get_contents('php://input'), true);
    $title = trim($input['title'] ?? '');
    $description = trim($input['description'] ?? '');
    $cover_image = trim($input['cover_image'] ?? '');

    if (empty($title)) {
        jsonResponse(['error' => '合集标题不能为空'], 400);
    }
    if (mb_strlen($title) > 100) {
        jsonResponse(['error' => '合集标题不能超过100个字符'], 400);
    }
    if (mb_strlen($description) > 1000) {
        jsonResponse(['error' => '合集简介不能超过1000个字符'], 400);
    }

    $stmt = $conn->prepare("INSERT INTO collections (title, description, cover_image, author_id, author_nickname) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param("sssis", $title, $description, $cover_image, $current_user['id'], $current_user['nickname']);

    if (!$stmt->execute()) {
        $stmt->close();
        jsonResponse(['error' => '创建合集失败，请重试'], 500);
    }

    $collection_id = $conn->insert_id;
    $stmt->close();

    jsonResponse([
        'message' => '合集创建成功',
        'collection' => [
            'id' => $collection_id,
            'title' => $title,
            'description' => $description,
            'cover_image' => $cover_image,
            'author_id' => $current_user['id'],
            'author_nickname' => $current_user['nickname'],
            'post_count' => 0
        ]
    ], 201);
}

function handleUpdateCollection($conn) {
    check_user_auth();
    $current_user = get_current_logged_user();

    $input = json_decode(file_get_contents('php://input'), true);
    $collection_id = (int)($input['collection_id'] ?? 0);
    $title = trim($input['title'] ?? '');
    $description = trim($input['description'] ?? '');
    $cover_image = trim($input['cover_image'] ?? '');

    if (!$collection_id) {
        jsonResponse(['error' => '缺少合集ID'], 400);
    }
    if (empty($title)) {
        jsonResponse(['error' => '合集标题不能为空'], 400);
    }
    if (mb_strlen($title) > 100) {
        jsonResponse(['error' => '合集标题不能超过100个字符'], 400);
    }

    $check_stmt = $conn->prepare("SELECT author_id FROM collections WHERE id = ?");
    $check_stmt->bind_param("i", $collection_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows === 0) {
        $check_stmt->close();
        jsonResponse(['error' => '合集不存在'], 404);
    }
    $collection = $check_result->fetch_assoc();
    $check_stmt->close();

    if ((int)$collection['author_id'] !== $current_user['id']) {
        jsonResponse(['error' => '无权编辑此合集'], 403);
    }

    $stmt = $conn->prepare("UPDATE collections SET title = ?, description = ?, cover_image = ? WHERE id = ? AND author_id = ?");
    $stmt->bind_param("sssii", $title, $description, $cover_image, $collection_id, $current_user['id']);

    if (!$stmt->execute()) {
        $stmt->close();
        jsonResponse(['error' => '更新合集失败'], 500);
    }

    $affected = $stmt->affected_rows;
    $stmt->close();

    jsonResponse([
        'message' => $affected > 0 ? '更新成功' : '无变更',
        'updated' => $affected > 0
    ]);
}

function handleDeleteCollection($conn) {
    check_user_auth();
    $current_user = get_current_logged_user();

    $input = json_decode(file_get_contents('php://input'), true);
    $collection_id = (int)($input['collection_id'] ?? 0);

    if (!$collection_id) {
        jsonResponse(['error' => '缺少合集ID'], 400);
    }

    $check_stmt = $conn->prepare("SELECT author_id FROM collections WHERE id = ?");
    $check_stmt->bind_param("i", $collection_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows === 0) {
        $check_stmt->close();
        jsonResponse(['error' => '合集不存在'], 404);
    }
    $collection = $check_result->fetch_assoc();
    $check_stmt->close();

    if ((int)$collection['author_id'] !== $current_user['id']) {
        jsonResponse(['error' => '无权删除此合集'], 403);
    }

    $stmt = $conn->prepare("DELETE FROM collections WHERE id = ? AND author_id = ?");
    $stmt->bind_param("ii", $collection_id, $current_user['id']);

    if (!$stmt->execute()) {
        $stmt->close();
        jsonResponse(['error' => '删除合集失败'], 500);
    }

    $affected = $stmt->affected_rows;
    $stmt->close();

    jsonResponse([
        'message' => $affected > 0 ? '合集已删除' : '删除失败',
        'deleted' => $affected > 0
    ]);
}

function handleAddPost($conn) {
    check_user_auth();
    $current_user = get_current_logged_user();

    $input = json_decode(file_get_contents('php://input'), true);
    $collection_id = (int)($input['collection_id'] ?? 0);
    $post_id = (int)($input['post_id'] ?? 0);

    if (!$collection_id || !$post_id) {
        jsonResponse(['error' => '缺少合集ID或帖子ID'], 400);
    }

    $check_stmt = $conn->prepare("SELECT author_id FROM collections WHERE id = ?");
    $check_stmt->bind_param("i", $collection_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows === 0) {
        $check_stmt->close();
        jsonResponse(['error' => '合集不存在'], 404);
    }
    $collection = $check_result->fetch_assoc();
    $check_stmt->close();

    if ((int)$collection['author_id'] !== $current_user['id']) {
        jsonResponse(['error' => '无权操作此合集'], 403);
    }

    $post_stmt = $conn->prepare("SELECT id, author_name FROM posts WHERE id = ?");
    $post_stmt->bind_param("i", $post_id);
    $post_stmt->execute();
    $post_result = $post_stmt->get_result();

    if ($post_result->num_rows === 0) {
        $post_stmt->close();
        jsonResponse(['error' => '帖子不存在'], 404);
    }
    $post_row = $post_result->fetch_assoc();
    $post_stmt->close();

    if ($post_row['author_name'] !== $current_user['nickname']) {
        jsonResponse(['error' => '只能添加自己的帖子到合集'], 403);
    }

    $exist_stmt = $conn->prepare("SELECT id FROM collection_posts WHERE collection_id = ? AND post_id = ?");
    $exist_stmt->bind_param("ii", $collection_id, $post_id);
    $exist_stmt->execute();
    $exist_result = $exist_stmt->get_result();

    if ($exist_result->num_rows > 0) {
        $exist_stmt->close();
        jsonResponse(['error' => '该帖子已在此合集中'], 409);
    }
    $exist_stmt->close();

    $max_stmt = $conn->prepare("SELECT COALESCE(MAX(sort_order), -1) as max_order FROM collection_posts WHERE collection_id = ?");
    $max_stmt->bind_param("i", $collection_id);
    $max_stmt->execute();
    $max_result = $max_stmt->get_result();
    $max_row = $max_result->fetch_assoc();
    $next_order = (int)$max_row['max_order'] + 1;
    $max_stmt->close();

    $conn->begin_transaction();
    try {
        $insert_stmt = $conn->prepare("INSERT INTO collection_posts (collection_id, post_id, sort_order) VALUES (?, ?, ?)");
        $insert_stmt->bind_param("iii", $collection_id, $post_id, $next_order);
        if (!$insert_stmt->execute()) {
            throw new Exception('添加帖子到合集失败');
        }
        $insert_stmt->close();

        $update_stmt = $conn->prepare("UPDATE collections SET post_count = post_count + 1 WHERE id = ?");
        $update_stmt->bind_param("i", $collection_id);
        $update_stmt->execute();
        $update_stmt->close();

        $conn->commit();

        jsonResponse([
            'message' => '帖子已添加到合集',
            'sort_order' => $next_order
        ], 201);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => $e->getMessage()], 500);
    }
}

function handleRemovePost($conn) {
    check_user_auth();
    $current_user = get_current_logged_user();

    $input = json_decode(file_get_contents('php://input'), true);
    $collection_id = (int)($input['collection_id'] ?? 0);
    $post_id = (int)($input['post_id'] ?? 0);

    if (!$collection_id || !$post_id) {
        jsonResponse(['error' => '缺少合集ID或帖子ID'], 400);
    }

    $check_stmt = $conn->prepare("SELECT author_id FROM collections WHERE id = ?");
    $check_stmt->bind_param("i", $collection_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows === 0) {
        $check_stmt->close();
        jsonResponse(['error' => '合集不存在'], 404);
    }
    $collection = $check_stmt->fetch_assoc();
    $check_stmt->close();

    if ((int)$collection['author_id'] !== $current_user['id']) {
        jsonResponse(['error' => '无权操作此合集'], 403);
    }

    $conn->begin_transaction();
    try {
        $del_stmt = $conn->prepare("DELETE FROM collection_posts WHERE collection_id = ? AND post_id = ?");
        $del_stmt->bind_param("ii", $collection_id, $post_id);
        $del_stmt->execute();
        $affected = $del_stmt->affected_rows;
        $del_stmt->close();

        if ($affected > 0) {
            $update_stmt = $conn->prepare("UPDATE collections SET post_count = GREATEST(post_count - 1, 0) WHERE id = ?");
            $update_stmt->bind_param("i", $collection_id);
            $update_stmt->execute();
            $update_stmt->close();

            reorderCollectionPosts($conn, $collection_id);
        }

        $conn->commit();

        jsonResponse([
            'message' => $affected > 0 ? '帖子已从合集中移除' : '帖子不在此合集中',
            'removed' => $affected > 0
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => $e->getMessage()], 500);
    }
}

function handleReorderPosts($conn) {
    check_user_auth();
    $current_user = get_current_logged_user();

    $input = json_decode(file_get_contents('php://input'), true);
    $collection_id = (int)($input['collection_id'] ?? 0);
    $post_orders = $input['post_orders'] ?? [];

    if (!$collection_id) {
        jsonResponse(['error' => '缺少合集ID'], 400);
    }
    if (!is_array($post_orders) || empty($post_orders)) {
        jsonResponse(['error' => '排序数据不能为空'], 400);
    }

    $check_stmt = $conn->prepare("SELECT author_id FROM collections WHERE id = ?");
    $check_stmt->bind_param("i", $collection_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows === 0) {
        $check_stmt->close();
        jsonResponse(['error' => '合集不存在'], 404);
    }
    $collection = $check_result->fetch_assoc();
    $check_stmt->close();

    if ((int)$collection['author_id'] !== $current_user['id']) {
        jsonResponse(['error' => '无权操作此合集'], 403);
    }

    $conn->begin_transaction();
    try {
        $update_stmt = $conn->prepare("UPDATE collection_posts SET sort_order = ? WHERE collection_id = ? AND post_id = ?");

        foreach ($post_orders as $item) {
            $post_id = (int)($item['post_id'] ?? 0);
            $sort_order = (int)($item['sort_order'] ?? 0);
            if ($post_id > 0) {
                $update_stmt->bind_param("iii", $sort_order, $collection_id, $post_id);
                $update_stmt->execute();
            }
        }
        $update_stmt->close();

        $conn->commit();

        jsonResponse(['message' => '排序已更新']);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => $e->getMessage()], 500);
    }
}

function handleBatchAddPosts($conn) {
    check_user_auth();
    $current_user = get_current_logged_user();

    $input = json_decode(file_get_contents('php://input'), true);
    $collection_id = (int)($input['collection_id'] ?? 0);
    $post_ids = $input['post_ids'] ?? [];

    if (!$collection_id) {
        jsonResponse(['error' => '缺少合集ID'], 400);
    }
    if (!is_array($post_ids) || empty($post_ids)) {
        jsonResponse(['error' => '帖子列表不能为空'], 400);
    }

    $check_stmt = $conn->prepare("SELECT author_id FROM collections WHERE id = ?");
    $check_stmt->bind_param("i", $collection_id);
    $check_stmt->execute();
    $check_result = $check_stmt->get_result();

    if ($check_result->num_rows === 0) {
        $check_stmt->close();
        jsonResponse(['error' => '合集不存在'], 404);
    }
    $collection = $check_stmt->fetch_assoc();
    $check_stmt->close();

    if ((int)$collection['author_id'] !== $current_user['id']) {
        jsonResponse(['error' => '无权操作此合集'], 403);
    }

    $max_stmt = $conn->prepare("SELECT COALESCE(MAX(sort_order), -1) as max_order FROM collection_posts WHERE collection_id = ?");
    $max_stmt->bind_param("i", $collection_id);
    $max_stmt->execute();
    $max_row = $max_stmt->get_result()->fetch_assoc();
    $next_order = (int)$max_row['max_order'] + 1;
    $max_stmt->close();

    $conn->begin_transaction();
    try {
        $insert_stmt = $conn->prepare("INSERT IGNORE INTO collection_posts (collection_id, post_id, sort_order) VALUES (?, ?, ?)");
        $added_count = 0;

        foreach ($post_ids as $post_id) {
            $post_id = (int)$post_id;
            if ($post_id <= 0) continue;

            $post_check = $conn->prepare("SELECT author_name FROM posts WHERE id = ? AND status = 'published'");
            $post_check->bind_param("i", $post_id);
            $post_check->execute();
            $post_res = $post_check->get_result();
            if ($post_res->num_rows === 0) {
                $post_check->close();
                continue;
            }
            $prow = $post_res->fetch_assoc();
            $post_check->close();

            if ($prow['author_name'] !== $current_user['nickname']) {
                continue;
            }

            $insert_stmt->bind_param("iii", $collection_id, $post_id, $next_order);
            if ($insert_stmt->execute() && $insert_stmt->affected_rows > 0) {
                $next_order++;
                $added_count++;
            }
        }
        $insert_stmt->close();

        $count_stmt = $conn->prepare("SELECT COUNT(*) as cnt FROM collection_posts WHERE collection_id = ?");
        $count_stmt->bind_param("i", $collection_id);
        $count_stmt->execute();
        $cnt_row = $count_stmt->get_result()->fetch_assoc();
        $real_count = (int)$cnt_row['cnt'];
        $count_stmt->close();

        $update_stmt = $conn->prepare("UPDATE collections SET post_count = ? WHERE id = ?");
        $update_stmt->bind_param("ii", $real_count, $collection_id);
        $update_stmt->execute();
        $update_stmt->close();

        $conn->commit();

        jsonResponse([
            'message' => "已添加 {$added_count} 篇帖子",
            'added_count' => $added_count
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        jsonResponse(['error' => $e->getMessage()], 500);
    }
}

function reorderCollectionPosts($conn, $collection_id) {
    $sql = "SELECT id, sort_order FROM collection_posts WHERE collection_id = ? ORDER BY sort_order ASC, id ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param("i", $collection_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $items = [];
    while ($row = $result->fetch_assoc()) {
        $items[] = $row;
    }
    $stmt->close();

    $update_stmt = $conn->prepare("UPDATE collection_posts SET sort_order = ? WHERE id = ?");
    $new_order = 0;
    foreach ($items as $item) {
        $update_stmt->bind_param("ii", $new_order, $item['id']);
        $update_stmt->execute();
        $new_order++;
    }
    $update_stmt->close();
}
