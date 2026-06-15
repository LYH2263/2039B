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
