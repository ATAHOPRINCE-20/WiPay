-- Migration: Add VPN credentials to admins table
USE wipay;

ALTER TABLE admins
ADD COLUMN vpn_ip VARCHAR(50) DEFAULT NULL,
ADD COLUMN vpn_private_key TEXT DEFAULT NULL,
ADD COLUMN vpn_public_key TEXT DEFAULT NULL,
ADD COLUMN vpn_server_pub TEXT DEFAULT NULL,
ADD COLUMN vpn_endpoint VARCHAR(255) DEFAULT NULL;
