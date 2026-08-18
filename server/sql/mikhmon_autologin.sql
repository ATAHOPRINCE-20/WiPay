-- Mikhmon Auto-Login Tokens Table
CREATE TABLE IF NOT EXISTS mikhmon_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    token VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX (token),
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);
