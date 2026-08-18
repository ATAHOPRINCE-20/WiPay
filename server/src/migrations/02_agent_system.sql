-- Database migration to support Agent Management System

CREATE TABLE IF NOT EXISTS `agents` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `admin_id` INT NOT NULL,
    `username` VARCHAR(255) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `phone_number` VARCHAR(20),
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add agent_id to vouchers to track stock
ALTER TABLE `vouchers` ADD COLUMN IF NOT EXISTS `agent_id` INT DEFAULT NULL;
ALTER TABLE `vouchers` ADD COLUMN IF NOT EXISTS `used_at` DATETIME DEFAULT NULL;
ALTER TABLE `vouchers` ADD CONSTRAINT `fk_voucher_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE SET NULL;

-- Add agent_id and settlement fields to transactions to track sales
ALTER TABLE `transactions` ADD COLUMN IF NOT EXISTS `agent_id` INT DEFAULT NULL;
ALTER TABLE `transactions` ADD COLUMN IF NOT EXISTS `is_settled` BOOLEAN DEFAULT FALSE;
ALTER TABLE `transactions` ADD COLUMN IF NOT EXISTS `settled_at` DATETIME DEFAULT NULL;
ALTER TABLE `transactions` ADD CONSTRAINT `fk_transaction_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE SET NULL;
