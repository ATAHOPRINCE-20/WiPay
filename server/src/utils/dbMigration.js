const db = require("../config/db");

async function runPendingMigrations() {
  console.log("Checking for pending database migrations...");

  // Helper to wrap migrations in try-catch
  const migrate = async (name, query) => {
    try {
      await db.query(query);
      console.log(`Migration Success: ${name}`);
    } catch (err) {
      if (err.code === "ER_DUP_FIELDNAME" || err.code === "ER_TABLE_EXISTS_ERROR") {
        console.log(`Migration Info: ${name} (already exists).`);
      } else {
        console.error(`Migration Error (${name}):`, err.message);
      }
    }
  };

  // 1. Packages is_active
  await migrate("is_active in packages", "ALTER TABLE packages ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1");

  // 2. Routers table
  await migrate("Routers table", `
    CREATE TABLE IF NOT EXISTS routers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      mikhmon_url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    )
  `);

  // 3. Router_id in transactions
  await migrate("router_id in transactions", "ALTER TABLE transactions ADD COLUMN router_id INT DEFAULT NULL");

  // 4. Nullable package_id
  await migrate("nullable package_id", "ALTER TABLE transactions MODIFY COLUMN package_id INT NULL");

  // 5. Subscription expiry
  await migrate("subscription_expiry in admins", "ALTER TABLE admins ADD COLUMN subscription_expiry DATETIME DEFAULT NULL AFTER billing_type");

  // 6. Withdrawal fee
  await migrate("fee in withdrawals", "ALTER TABLE withdrawals ADD COLUMN fee INT DEFAULT 0 AFTER amount");

  // 7. Mikhmon tokens
  await migrate("mikhmon_tokens table", `
    CREATE TABLE IF NOT EXISTS mikhmon_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      token VARCHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (token),
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    )
  `);

  // 8. Idempotency keys
  await migrate("idempotency_keys table", `
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id INT AUTO_INCREMENT PRIMARY KEY,
      idempotency_key VARCHAR(255) NOT NULL UNIQUE,
      user_id INT,
      endpoint VARCHAR(255) NOT NULL,
      method VARCHAR(10) NOT NULL,
      request_hash VARCHAR(64),
      status_code INT,
      response_body LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME DEFAULT NULL,
      INDEX (idempotency_key),
      INDEX (expires_at)
    )
  `);

  // 9. Cleanup expired idempotency
  try {
    await db.query("DELETE FROM idempotency_keys WHERE expires_at < NOW()");
    console.log("Migration Success: Expired idempotency keys cleaned up.");
  } catch (err) {
    if (err.code !== 'ER_NO_SUCH_TABLE') {
      console.error("Migration Error (Cleanup Idempotency):", err.message);
    }
  }

  // 10. Registration requests
  await migrate("registration_requests table", `
    CREATE TABLE IF NOT EXISTS registration_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      first_name VARCHAR(255) NOT NULL,
      last_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      whatsapp_number VARCHAR(20),
      hotspot_name VARCHAR(255),
      customer_care_contacts TEXT,
      device_type VARCHAR(50),
      login_method VARCHAR(50),
      address TEXT,
      system_usage VARCHAR(50),
      status ENUM('pending', 'pending_otp', 'pending_approval', 'approved', 'rejected') DEFAULT 'pending_otp',
      otp_code VARCHAR(10),
      otp_expiry DATETIME,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Columns for Registration
  const regCols = [
    { name: 'otp_code', type: 'VARCHAR(10)' },
    { name: 'otp_expiry', type: 'DATETIME' }
  ];
  for (const col of regCols) {
    await migrate(`registration_requests ${col.name}`, `ALTER TABLE registration_requests ADD COLUMN ${col.name} ${col.type}`);
  }

  // Role etc for Admins
  const adminCols = [
    { name: 'role', type: "ENUM('super_admin', 'admin') DEFAULT 'admin'" },
    { name: 'email', type: 'VARCHAR(255)' },
    { name: 'business_name', type: 'VARCHAR(255)' },
    { name: 'business_phone', type: 'VARCHAR(20)' }
  ];
  for (const col of adminCols) {
    await migrate(`admins ${col.name}`, `ALTER TABLE admins ADD COLUMN ${col.name} ${col.type}`);
  }

  // 11. Customer Name in Transactions
  await migrate("customer_name in transactions", "ALTER TABLE transactions ADD COLUMN customer_name VARCHAR(255) DEFAULT NULL");

  // 12. Package Name in Transactions
  await migrate("package_name in transactions", "ALTER TABLE transactions ADD COLUMN package_name VARCHAR(255) DEFAULT NULL");

  // 13. Ads table
  await migrate("Ads table", `
    CREATE TABLE IF NOT EXISTS ads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      image_url TEXT NOT NULL,
      target_url TEXT DEFAULT NULL,
      status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    )
  `);

  // 14. Router API Columns
  const routerCols = [
    { name: "api_host", type: "VARCHAR(255) DEFAULT NULL" },
    { name: "api_user", type: "VARCHAR(255) DEFAULT NULL" },
    { name: "api_pass", type: "VARCHAR(255) DEFAULT NULL" },
    { name: "api_port", type: "INT DEFAULT 8728" }
  ];
  for (const col of routerCols) {
    await migrate(`routers ${col.name}`, `ALTER TABLE routers ADD COLUMN ${col.name} ${col.type}`);
  }

  // 15. Admin Tenant Token (For URL Obfuscation)
  await migrate("tenant_token in admins", "ALTER TABLE admins ADD COLUMN tenant_token VARCHAR(64) UNIQUE DEFAULT NULL");
  
  // Populate existing admins with a token if they don't have one
  try {
    const [rows] = await db.query("SELECT id FROM admins WHERE tenant_token IS NULL");
    if (rows.length > 0) {
      const crypto = require('crypto');
      for (const row of rows) {
        const token = crypto.randomBytes(6).toString('hex'); // 12 chars
        await db.query("UPDATE admins SET tenant_token = ? WHERE id = ?", [token, row.id]);
      }
      console.log(`Migration Success: Populated tenant_token for ${rows.length} admins.`);
    }
  } catch (err) {
    console.error("Migration Error (tenant_token population):", err.message);
  }

  // 16. Last Active Tracker
  await migrate("last_active_at in admins", "ALTER TABLE admins ADD COLUMN last_active_at TIMESTAMP NULL DEFAULT NULL");
  await migrate("last_active_at in agents", "ALTER TABLE agents ADD COLUMN last_active_at TIMESTAMP NULL DEFAULT NULL");

  // 17. Validity in Vouchers
  await migrate("validity in vouchers", "ALTER TABLE vouchers ADD COLUMN validity VARCHAR(50) DEFAULT NULL AFTER code");

  // 16. Performance Indexes (critical for query speed)
  const indexes = [
    // transactions - most queried table
    { name: 'idx_tx_admin_status', table: 'transactions', cols: 'admin_id, status' },
    { name: 'idx_tx_admin_status_method', table: 'transactions', cols: 'admin_id, status, payment_method' },
    { name: 'idx_tx_admin_router', table: 'transactions', cols: 'admin_id, router_id' },
    { name: 'idx_tx_ref', table: 'transactions', cols: 'transaction_ref' },
    { name: 'idx_tx_created', table: 'transactions', cols: 'created_at' },
    { name: 'idx_tx_agent_status', table: 'transactions', cols: 'agent_id, status' },
    // vouchers
    { name: 'idx_v_pkg_used_admin', table: 'vouchers', cols: 'package_id, is_used, admin_id' },
    { name: 'idx_v_admin_used', table: 'vouchers', cols: 'admin_id, is_used' },
    { name: 'idx_v_admin_router', table: 'vouchers', cols: 'admin_id, router_id' },
    { name: 'idx_v_agent', table: 'vouchers', cols: 'agent_id, is_used' },
    // packages
    { name: 'idx_pkg_admin', table: 'packages', cols: 'admin_id' },
    { name: 'idx_pkg_category', table: 'packages', cols: 'category_id' },
    { name: 'idx_pkg_router', table: 'packages', cols: 'router_id' },
    // categories
    { name: 'idx_cat_admin', table: 'categories', cols: 'admin_id' },
    // withdrawals
    { name: 'idx_wd_admin_status', table: 'withdrawals', cols: 'admin_id, status' },
    // sms_fees
    { name: 'idx_sms_admin_status', table: 'sms_fees', cols: 'admin_id, status' },
    { name: 'idx_sms_ref', table: 'sms_fees', cols: 'reference' },
    // routers
    { name: 'idx_router_admin', table: 'routers', cols: 'admin_id' },
  ];

  for (const idx of indexes) {
    try {
      await db.query(`CREATE INDEX ${idx.name} ON ${idx.table} (${idx.cols})`);
      console.log(`Index Created: ${idx.name}`);
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        // Index already exists, skip
      } else if (err.code === 'ER_NO_SUCH_TABLE') {
        console.log(`Index Skipped (table missing): ${idx.name}`);
      } else {
        console.error(`Index Error (${idx.name}):`, err.message);
      }
    }
  }
}

module.exports = { runPendingMigrations };
