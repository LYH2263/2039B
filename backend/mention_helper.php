<?php
/**
 * @提及解析辅助函数 mention_helper.php
 * 
 * 用途：
 * 提供稳健的 @提及 解析、存储和渲染功能。
 * 
 * 核心功能：
 * 1. parse_mentions(): 解析文本中的有效 @昵称，支持去重、忽略不存在的用户
 * 2. save_mentions(): 保存提及记录并生成提醒
 * 3. render_mentions(): 将文本中的 @昵称 渲染为高亮链接
 * 4. 稳健解析：区分邮箱、连续多个@、不存在的昵称忽略、去重
 */

require_once __DIR__ . '/db.php';

/**
 * 解析文本中的 @提及
 * 
 * 解析规则：
 * - @后面必须紧跟非空白字符，直到遇到空白、标点或字符串结束
 * - 排除邮箱格式（@前面有字母数字）
 * - 排除连续多个@（如 @@user）
 * - 昵称长度 1-50 个字符
 * - 自动去重
 * - 只保留系统中存在的用户昵称
 * 
 * @param string $text 要解析的文本
 * @param mysqli $conn 数据库连接
 * @return array 有效的提及用户数组 [['user_id' => 1, 'nickname' => 'xxx'], ...]
 */
function parse_mentions($text, $conn) {
    if (empty($text)) {
        return [];
    }

    $pattern = '/(?<!\w)@([^\s@#$%^&*()+=<>?\/\\[\]{}|;:\'",.!？！，。；：\x{201c}\x{201d}\x{2018}\x{2019}（）【】、~`\-]{1,50})/u';
    preg_match_all($pattern, $text, $matches);

    if (empty($matches[1])) {
        return [];
    }

    $nicknames = array_unique($matches[1]);
    $nicknames = array_filter($nicknames, function($nickname) {
        return !empty(trim($nickname));
    });

    if (empty($nicknames)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($nicknames), '?'));
    $types = str_repeat('s', count($nicknames));
    $stmt = $conn->prepare("SELECT id, nickname FROM users WHERE nickname IN ($placeholders)");
    $stmt->bind_param($types, ...$nicknames);
    $stmt->execute();
    $result = $stmt->get_result();

    $valid_users = [];
    while ($row = $result->fetch_assoc()) {
        $valid_users[] = [
            'user_id' => intval($row['id']),
            'nickname' => $row['nickname']
        ];
    }

    return $valid_users;
}

/**
 * 保存 @提及 记录并生成提醒
 * 
 * @param mysqli $conn 数据库连接
 * @param string $source_type 来源类型：post-帖子，comment-评论
 * @param int $source_id 来源ID
 * @param int $post_id 所属帖子ID
 * @param string $content 内容文本
 * @param string $mentioner_nickname 提及者昵称
 * @param int|null $mentioner_user_id 提及者用户ID（登录用户）
 * @param string $post_title 帖子标题（用于提醒）
 * @return array 成功提及的用户数组
 */
function save_mentions($conn, $source_type, $source_id, $post_id, $content, $mentioner_nickname, $mentioner_user_id = null, $post_title = '') {
    $mentioned_users = parse_mentions($content, $conn);
    
    if (empty($mentioned_users)) {
        return [];
    }

    $content_snippet = mb_substr($content, 0, 200);
    if (mb_strlen($content) > 200) {
        $content_snippet .= '...';
    }

    $success_users = [];

    foreach ($mentioned_users as $user) {
        if ($mentioner_user_id && $user['user_id'] == $mentioner_user_id) {
            continue;
        }

        $stmt = $conn->prepare("INSERT INTO mentions 
            (source_type, source_id, post_id, mentioned_user_id, mentioned_nickname, 
             mentioner_user_id, mentioner_nickname, content_snippet) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param("siississ", 
            $source_type, $source_id, $post_id, $user['user_id'], $user['nickname'],
            $mentioner_user_id, $mentioner_nickname, $content_snippet
        );
        
        if ($stmt->execute()) {
            $success_users[] = $user;
            
            $notification_title = "{$mentioner_nickname} 在帖子中提到了你";
            $notification_content = $post_title ? "帖子：{$post_title}" : "";
            
            $stmt_notif = $conn->prepare("INSERT INTO notifications 
                (user_id, type, source_type, source_id, post_id, actor_nickname, title, content) 
                VALUES (?, 'mention', ?, ?, ?, ?, ?, ?)");
            $stmt_notif->bind_param("issiiss", 
                $user['user_id'], $source_type, $source_id, $post_id, 
                $mentioner_nickname, $notification_title, $notification_content
            );
            $stmt_notif->execute();
        }
    }

    return $success_users;
}

/**
 * 将文本中的 @昵称 渲染为高亮链接
 * 
 * @param string $text 原始文本
 * @param mysqli $conn 数据库连接
 * @return string 渲染后的 HTML 文本
 */
function render_mentions($text, $conn) {
    if (empty($text)) {
        return '';
    }

    $mentioned_users = parse_mentions($text, $conn);
    
    if (empty($mentioned_users)) {
        return htmlspecialchars($text);
    }

    $nickname_map = [];
    foreach ($mentioned_users as $user) {
        $nickname_map[$user['nickname']] = $user['user_id'];
    }

    $pattern = '/(?<!\w)@([^\s@#$%^&*()+=<>?\/\\[\]{}|;:\'",.!？！，。；：\x{201c}\x{201d}\x{2018}\x{2019}（）【】、~`\-]{1,50})/u';
    
    return preg_replace_callback($pattern, function($matches) use ($nickname_map) {
        $nickname = $matches[1];
        if (isset($nickname_map[$nickname])) {
            $user_id = $nickname_map[$nickname];
            return '<a href="#" class="mention-link text-primary fw-bold" data-user-id="' . $user_id . '" data-nickname="' . htmlspecialchars($nickname) . '">@' . htmlspecialchars($nickname) . '</a>';
        }
        return htmlspecialchars($matches[0]);
    }, $text);
}

/**
 * 纯文本渲染 @提及（用于不需要链接的场景）
 * 
 * @param string $text 原始文本
 * @param mysqli $conn 数据库连接
 * @return string 渲染后的文本（带 span 高亮）
 */
function render_mentions_text($text, $conn) {
    if (empty($text)) {
        return '';
    }

    $mentioned_users = parse_mentions($text, $conn);
    
    if (empty($mentioned_users)) {
        return htmlspecialchars($text);
    }

    $nicknames = array_column($mentioned_users, 'nickname');
    $nickname_pattern = implode('|', array_map('preg_quote', $nicknames));
    $pattern = '/(?<!\w)@(' . $nickname_pattern . ')(?!\w)/u';
    
    return preg_replace_callback($pattern, function($matches) {
        return '<span class="mention-highlight text-primary fw-bold">@' . htmlspecialchars($matches[1]) . '</span>';
    }, htmlspecialchars($text));
}
?>
