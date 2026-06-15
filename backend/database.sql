SET NAMES utf8mb4;

-- Create database (if not exists, though docker env does this)
CREATE DATABASE IF NOT EXISTS `www.17speed.vip` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `www.17speed.vip`;

-- Posts table
CREATE TABLE IF NOT EXISTS `posts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL COMMENT '帖子标题',
    `content` TEXT NOT NULL COMMENT '帖子内容',
    `author_name` VARCHAR(100) NOT NULL COMMENT '作者昵称',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comments table
CREATE TABLE IF NOT EXISTS `comments` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `post_id` INT NOT NULL COMMENT '所属帖子ID',
    `author_name` VARCHAR(100) NOT NULL COMMENT '评论昵称',
    `content` TEXT NOT NULL COMMENT '评论内容',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '评论时间',
    FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: Insert some sample data
INSERT INTO `posts` (`title`, `content`, `author_name`, `created_at`) VALUES
('欢迎来到极简论坛', '这是一个基于 PHP + MySQL 的轻量级论坛系统。', '管理员', NOW()),
('测试帖子', '这是一条测试内容，用于验证系统功能。', '测试员', NOW());

INSERT INTO `comments` (`post_id`, `author_name`, `content`, `created_at`) VALUES
(1, '访客A', '界面很简洁，不错！', NOW()),
(1, '访客B', '加载速度很快。', NOW());

-- Users table
CREATE TABLE IF NOT EXISTS `users` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    `email` VARCHAR(100) NOT NULL UNIQUE COMMENT '邮箱',
    `password_hash` VARCHAR(255) NOT NULL COMMENT '密码哈希',
    `nickname` VARCHAR(50) NOT NULL COMMENT '昵称',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '注册时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX `idx_username` (`username`),
    INDEX `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stories table (接龙故事主表)
CREATE TABLE IF NOT EXISTS `stories` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL COMMENT '故事标题',
    `opening_paragraph` TEXT NOT NULL COMMENT '开头段落',
    `max_words_per_paragraph` INT NOT NULL DEFAULT 100 COMMENT '每段字数上限',
    `author_id` INT NOT NULL COMMENT '作者用户ID',
    `author_nickname` VARCHAR(50) NOT NULL COMMENT '作者昵称',
    `status` VARCHAR(20) NOT NULL DEFAULT 'active' COMMENT '状态：active-进行中，closed-已封笔',
    `lock_user_id` INT NULL COMMENT '当前持有锁的用户ID',
    `lock_user_nickname` VARCHAR(50) NULL COMMENT '当前持有锁的用户昵称',
    `lock_expires_at` DATETIME NULL COMMENT '锁过期时间',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_status` (`status`),
    INDEX `idx_author_id` (`author_id`),
    INDEX `idx_lock_expires` (`lock_expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Story paragraphs table (故事段落表)
CREATE TABLE IF NOT EXISTS `story_paragraphs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `story_id` INT NOT NULL COMMENT '所属故事ID',
    `paragraph_order` INT NOT NULL COMMENT '段落顺序，0为开头段落，从1开始递增',
    `content` TEXT NOT NULL COMMENT '段落内容',
    `author_id` INT NOT NULL COMMENT '段落作者ID',
    `author_nickname` VARCHAR(50) NOT NULL COMMENT '段落作者昵称',
    `word_count` INT NOT NULL COMMENT '本段实际字数',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uk_story_order` (`story_id`, `paragraph_order`),
    INDEX `idx_story_id` (`story_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Private conversations table (私信会话表)
CREATE TABLE IF NOT EXISTS `private_conversations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user1_id` INT NOT NULL COMMENT '用户1ID（较小ID）',
    `user2_id` INT NOT NULL COMMENT '用户2ID（较大ID）',
    `user1_nickname` VARCHAR(50) NOT NULL COMMENT '用户1昵称',
    `user2_nickname` VARCHAR(50) NOT NULL COMMENT '用户2昵称',
    `last_message_id` INT NULL COMMENT '最后一条消息ID',
    `last_message_content` VARCHAR(500) NULL COMMENT '最后一条消息摘要',
    `last_message_time` DATETIME NULL COMMENT '最后一条消息时间',
    `last_sender_id` INT NULL COMMENT '最后一条消息发送者ID',
    `user1_unread_count` INT NOT NULL DEFAULT 0 COMMENT '用户1未读数',
    `user2_unread_count` INT NOT NULL DEFAULT 0 COMMENT '用户2未读数',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (`user1_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`user2_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uk_users` (`user1_id`, `user2_id`),
    INDEX `idx_user1` (`user1_id`),
    INDEX `idx_user2` (`user2_id`),
    INDEX `idx_user1_updated` (`user1_id`, `updated_at`),
    INDEX `idx_user2_updated` (`user2_id`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Private messages table (私信消息表)
CREATE TABLE IF NOT EXISTS `private_messages` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `conversation_id` INT NOT NULL COMMENT '会话ID',
    `sender_id` INT NOT NULL COMMENT '发送者ID',
    `receiver_id` INT NOT NULL COMMENT '接收者ID',
    `content` TEXT NOT NULL COMMENT '消息内容',
    `is_read` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已读：0-未读，1-已读',
    `read_at` DATETIME NULL COMMENT '阅读时间',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
    FOREIGN KEY (`conversation_id`) REFERENCES `private_conversations`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_conversation_id` (`conversation_id`),
    INDEX `idx_sender_id` (`sender_id`),
    INDEX `idx_receiver_id` (`receiver_id`),
    INDEX `idx_conversation_created` (`conversation_id`, `created_at`),
    INDEX `idx_receiver_unread` (`receiver_id`, `is_read`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mentions table (@提及记录表)
CREATE TABLE IF NOT EXISTS `mentions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `source_type` VARCHAR(20) NOT NULL COMMENT '来源类型：post-帖子，comment-评论',
    `source_id` INT NOT NULL COMMENT '来源ID（帖子ID或评论ID）',
    `post_id` INT NOT NULL COMMENT '所属帖子ID（用于跳转）',
    `mentioned_user_id` INT NOT NULL COMMENT '被提及用户ID',
    `mentioned_nickname` VARCHAR(50) NOT NULL COMMENT '被提及用户昵称',
    `mentioner_user_id` INT NULL COMMENT '提及者用户ID（登录用户）',
    `mentioner_nickname` VARCHAR(100) NOT NULL COMMENT '提及者昵称',
    `content_snippet` VARCHAR(200) NULL COMMENT '内容片段预览',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (`mentioned_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_mentioned_user` (`mentioned_user_id`),
    INDEX `idx_source` (`source_type`, `source_id`),
    INDEX `idx_post_id` (`post_id`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications table (用户提醒表)
CREATE TABLE IF NOT EXISTS `notifications` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL COMMENT '接收提醒的用户ID',
    `type` VARCHAR(20) NOT NULL COMMENT '提醒类型：mention-@提及，comment-评论回复',
    `source_type` VARCHAR(20) NOT NULL COMMENT '来源类型：post-帖子，comment-评论',
    `source_id` INT NOT NULL COMMENT '来源ID',
    `post_id` INT NOT NULL COMMENT '所属帖子ID',
    `actor_nickname` VARCHAR(100) NOT NULL COMMENT '触发者昵称',
    `title` VARCHAR(200) NOT NULL COMMENT '提醒标题',
    `content` TEXT NULL COMMENT '提醒内容',
    `is_read` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已读：0-未读，1-已读',
    `read_at` DATETIME NULL COMMENT '阅读时间',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_user_unread` (`user_id`, `is_read`),
    INDEX `idx_created_at` (`created_at`),
    INDEX `idx_source` (`source_type`, `source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Point rules table (积分规则配置表)
CREATE TABLE IF NOT EXISTS `point_rules` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `action_type` VARCHAR(50) NOT NULL UNIQUE COMMENT '动作类型：create_post-发帖，receive_comment-被评论，create_comment-评论他人',
    `action_name` VARCHAR(100) NOT NULL COMMENT '动作名称',
    `points` INT NOT NULL DEFAULT 0 COMMENT '奖励积分数',
    `daily_limit` INT NOT NULL DEFAULT 0 COMMENT '每日上限次数，0表示不限',
    `is_enabled` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：0-禁用，1-启用',
    `description` VARCHAR(500) NULL COMMENT '规则说明',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX `idx_action_type` (`action_type`),
    INDEX `idx_is_enabled` (`is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Level badges table (等级徽章配置表)
CREATE TABLE IF NOT EXISTS `level_badges` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `level` INT NOT NULL UNIQUE COMMENT '等级：1-5',
    `level_name` VARCHAR(50) NOT NULL COMMENT '等级名称：Lv1新手，Lv2入门，Lv3进阶，Lv4高手，Lv5资深',
    `min_points` INT NOT NULL COMMENT '所需最低积分',
    `badge_icon` VARCHAR(255) NULL COMMENT '徽章图标（可存emoji或图标路径）',
    `badge_color` VARCHAR(20) NULL COMMENT '徽章颜色',
    `description` VARCHAR(500) NULL COMMENT '等级说明',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX `idx_level` (`level`),
    INDEX `idx_min_points` (`min_points`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User points table (用户积分表)
CREATE TABLE IF NOT EXISTS `user_points` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL UNIQUE COMMENT '用户ID',
    `nickname` VARCHAR(50) NOT NULL COMMENT '用户昵称（冗余）',
    `total_points` INT NOT NULL DEFAULT 0 COMMENT '累计总积分',
    `current_points` INT NOT NULL DEFAULT 0 COMMENT '当前可用积分（预留，暂时与total一致）',
    `level` INT NOT NULL DEFAULT 1 COMMENT '当前等级',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_total_points` (`total_points`),
    INDEX `idx_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Point transactions table (积分流水表)
CREATE TABLE IF NOT EXISTS `point_transactions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL COMMENT '用户ID',
    `action_type` VARCHAR(50) NOT NULL COMMENT '动作类型（关联point_rules）',
    `points_change` INT NOT NULL COMMENT '积分变动值（正数为增加，负数为扣除）',
    `balance_after` INT NOT NULL COMMENT '变动后余额',
    `source_type` VARCHAR(20) NULL COMMENT '来源类型：post-帖子，comment-评论',
    `source_id` INT NULL COMMENT '来源ID（帖子ID或评论ID）',
    `related_user_id` INT NULL COMMENT '关联用户ID（如评论者、被评论者）',
    `related_user_nickname` VARCHAR(50) NULL COMMENT '关联用户昵称',
    `description` VARCHAR(500) NULL COMMENT '变动说明',
    `idempotency_key` VARCHAR(100) NOT NULL UNIQUE COMMENT '幂等键，防重复结算：{user_id}_{action_type}_{source_type}_{source_id}',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_user_created` (`user_id`, `created_at`),
    INDEX `idx_action_type` (`action_type`),
    INDEX `idx_source` (`source_type`, `source_id`),
    UNIQUE KEY `uk_idempotency_key` (`idempotency_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default point rules (插入默认积分规则)
INSERT IGNORE INTO `point_rules` (`action_type`, `action_name`, `points`, `daily_limit`, `is_enabled`, `description`) VALUES
('create_post', '发布帖子', 10, 10, 1, '每发布一篇帖子获得积分，每日上限10次'),
('receive_comment', '帖子被评论', 5, 0, 1, '自己的帖子收到他人评论时获得积分'),
('create_comment', '评论他人', 2, 50, 1, '每评论一篇他人帖子获得积分，每日上限50次');

-- Insert default level badges (插入默认等级徽章)
INSERT IGNORE INTO `level_badges` (`level`, `level_name`, `min_points`, `badge_icon`, `badge_color`, `description`) VALUES
(1, 'Lv1 新手', 0, '🌱', '#9CA3AF', '初入论坛，欢迎加入！'),
(2, 'Lv2 入门', 50, '🌿', '#10B981', '开始活跃，渐入佳境。'),
(3, 'Lv3 进阶', 200, '🌳', '#3B82F6', '持续贡献，社区中坚。'),
(4, 'Lv4 高手', 500, '🏆', '#F59E0B', '经验丰富，社区达人。'),
(5, 'Lv5 资深', 1000, '👑', '#EF4444', '殿堂级用户，社区瑰宝。');

-- Follows table (用户关注关系表)
CREATE TABLE IF NOT EXISTS `follows` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `follower_id` INT NOT NULL COMMENT '关注者用户ID（粉丝）',
    `following_id` INT NOT NULL COMMENT '被关注者用户ID（作者）',
    `follower_nickname` VARCHAR(50) NOT NULL COMMENT '关注者昵称（冗余）',
    `following_nickname` VARCHAR(50) NOT NULL COMMENT '被关注者昵称（冗余）',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '关注时间',
    FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`following_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uk_follower_following` (`follower_id`, `following_id`),
    INDEX `idx_follower_id` (`follower_id`),
    INDEX `idx_following_id` (`following_id`),
    INDEX `idx_follower_created` (`follower_id`, `created_at`),
    INDEX `idx_following_created` (`following_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
