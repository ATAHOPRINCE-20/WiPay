-- Migration: Add webhook_data to transactions table
USE wipay;
ALTER TABLE transactions ADD COLUMN webhook_data JSON AFTER voucher_code;
ALTER TABLE sms_fees ADD COLUMN webhook_data JSON AFTER reference;
