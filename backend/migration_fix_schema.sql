-- ============================================================
-- 迁移脚本：将旧版数据库结构升级到当前 database.sql 的结构
-- 背景：db_data 卷在早期版本初始化后一直保留，后续新增的
--       字段/表从未通过 docker-entrypoint-initdb.d 应用。
-- 本脚本是非破坏性的（保留现有数据），可重复执行。
-- ============================================================
USE `www.17speed.vip`;

-- ---------- 1. 为 posts 表补齐缺失的列 ----------
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS，使用存储过程做条件判断
DROP PROCEDURE IF EXISTS `__add_posts_columns`;
DELIMITER //
CREATE PROCEDURE `__add_posts_columns`()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND COLUMN_NAME = 'status') THEN
        ALTER TABLE `posts` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'published' COMMENT '状态：scheduled-待发布，published-已发布' AFTER `created_at`;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND COLUMN_NAME = 'scheduled_at') THEN
        ALTER TABLE `posts` ADD COLUMN `scheduled_at` DATETIME NULL COMMENT '计划发布时间（NULL表示无需定时）' AFTER `status`;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND COLUMN_NAME = 'published_at') THEN
        ALTER TABLE `posts` ADD COLUMN `published_at` DATETIME NULL COMMENT '实际发布时间' AFTER `scheduled_at`;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND INDEX_NAME = 'idx_status') THEN
        ALTER TABLE `posts` ADD INDEX `idx_status` (`status`);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND INDEX_NAME = 'idx_scheduled_at') THEN
        ALTER TABLE `posts` ADD INDEX `idx_scheduled_at` (`scheduled_at`);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'posts' AND INDEX_NAME = 'idx_status_scheduled') THEN
        ALTER TABLE `posts` ADD INDEX `idx_status_scheduled` (`status`, `scheduled_at`);
    END IF;
END//
DELIMITER ;
CALL `__add_posts_columns`();
DROP PROCEDURE `__add_posts_columns`;

-- 回填历史帖子：已存在的帖子视为已发布，发布时间用创建时间
UPDATE `posts` SET `status` = 'published' WHERE `status` IS NULL OR `status` = '';
UPDATE `posts` SET `published_at` = `created_at` WHERE `published_at` IS NULL;

-- ---------- 2. 创建缺失的功能表 ----------
CREATE TABLE IF NOT EXISTS `point_rules` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `action_type` VARCHAR(50) NOT NULL UNIQUE,
    `action_name` VARCHAR(100) NOT NULL,
    `points` INT NOT NULL DEFAULT 0,
    `daily_limit` INT NOT NULL DEFAULT 0,
    `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `description` VARCHAR(500) NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_action_type` (`action_type`),
    INDEX `idx_is_enabled` (`is_enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `level_badges` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `level` INT NOT NULL UNIQUE,
    `level_name` VARCHAR(50) NOT NULL,
    `min_points` INT NOT NULL,
    `badge_icon` VARCHAR(255) NULL,
    `badge_color` VARCHAR(20) NULL,
    `description` VARCHAR(500) NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_level` (`level`),
    INDEX `idx_min_points` (`min_points`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_points` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL UNIQUE,
    `nickname` VARCHAR(50) NOT NULL,
    `total_points` INT NOT NULL DEFAULT 0,
    `current_points` INT NOT NULL DEFAULT 0,
    `level` INT NOT NULL DEFAULT 1,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_total_points` (`total_points`),
    INDEX `idx_level` (`level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `point_transactions` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `action_type` VARCHAR(50) NOT NULL,
    `points_change` INT NOT NULL,
    `balance_after` INT NOT NULL,
    `source_type` VARCHAR(20) NULL,
    `source_id` INT NULL,
    `related_user_id` INT NULL,
    `related_user_nickname` VARCHAR(50) NULL,
    `description` VARCHAR(500) NULL,
    `idempotency_key` VARCHAR(100) NOT NULL UNIQUE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_user_created` (`user_id`, `created_at`),
    INDEX `idx_action_type` (`action_type`),
    INDEX `idx_source` (`source_type`, `source_id`),
    UNIQUE KEY `uk_idempotency_key` (`idempotency_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `follows` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `follower_id` INT NOT NULL,
    `following_id` INT NOT NULL,
    `follower_nickname` VARCHAR(50) NOT NULL,
    `following_nickname` VARCHAR(50) NOT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`follower_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`following_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uk_follower_following` (`follower_id`, `following_id`),
    INDEX `idx_follower_id` (`follower_id`),
    INDEX `idx_following_id` (`following_id`),
    INDEX `idx_follower_created` (`follower_id`, `created_at`),
    INDEX `idx_following_created` (`following_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `collections` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `cover_image` VARCHAR(500) NULL,
    `author_id` INT NOT NULL,
    `author_nickname` VARCHAR(50) NOT NULL,
    `post_count` INT NOT NULL DEFAULT 0,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX `idx_author_id` (`author_id`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `collection_posts` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `collection_id` INT NOT NULL,
    `post_id` INT NOT NULL,
    `sort_order` INT NOT NULL DEFAULT 0,
    `added_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `uk_collection_post` (`collection_id`, `post_id`),
    INDEX `idx_collection_order` (`collection_id`, `sort_order`),
    INDEX `idx_post_id` (`post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tickets` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ticket_no` VARCHAR(20) NOT NULL UNIQUE,
    `user_id` INT NULL,
    `nickname` VARCHAR(100) NOT NULL,
    `type` VARCHAR(30) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `description` TEXT NOT NULL,
    `contact` VARCHAR(200) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_ticket_no` (`ticket_no`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_status` (`status`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_replies` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ticket_id` INT NOT NULL,
    `reply_type` VARCHAR(20) NOT NULL DEFAULT 'admin',
    `replier_name` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
    INDEX `idx_ticket_id` (`ticket_id`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- 3. 触发器（合集帖子数维护）----------
DROP TRIGGER IF EXISTS `tr_collection_posts_after_insert`;
DROP TRIGGER IF EXISTS `tr_collection_posts_after_delete`;
DELIMITER //
CREATE TRIGGER `tr_collection_posts_after_insert` AFTER INSERT ON `collection_posts`
FOR EACH ROW
BEGIN
    UPDATE collections SET post_count = (SELECT COUNT(*) FROM collection_posts WHERE collection_id = NEW.collection_id) WHERE id = NEW.collection_id;
END//
CREATE TRIGGER `tr_collection_posts_after_delete` AFTER DELETE ON `collection_posts`
FOR EACH ROW
BEGIN
    UPDATE collections SET post_count = (SELECT COUNT(*) FROM collection_posts WHERE collection_id = OLD.collection_id) WHERE id = OLD.collection_id;
END//
DELIMITER ;

-- ---------- 4. 默认数据 ----------
INSERT IGNORE INTO `point_rules` (`action_type`, `action_name`, `points`, `daily_limit`, `is_enabled`, `description`) VALUES
('create_post', '发布帖子', 10, 10, 1, '每发布一篇帖子获得积分，每日上限10次'),
('receive_comment', '帖子被评论', 5, 0, 1, '自己的帖子收到他人评论时获得积分'),
('create_comment', '评论他人', 2, 50, 1, '每评论一篇他人帖子获得积分，每日上限50次');

INSERT IGNORE INTO `level_badges` (`level`, `level_name`, `min_points`, `badge_icon`, `badge_color`, `description`) VALUES
(1, 'Lv1 新手', 0, '🌱', '#9CA3AF', '初入论坛，欢迎加入！'),
(2, 'Lv2 入门', 50, '🌿', '#10B981', '开始活跃，渐入佳境。'),
(3, 'Lv3 进阶', 200, '🌳', '#3B82F6', '持续贡献，社区中坚。'),
(4, 'Lv4 高手', 500, '🏆', '#F59E0B', '经验丰富，社区达人。'),
(5, 'Lv5 资深', 1000, '👑', '#EF4444', '殿堂级用户，社区瑰宝。');
