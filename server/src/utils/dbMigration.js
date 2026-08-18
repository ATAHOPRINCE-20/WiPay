const db = require('../config/db');

async function runPendingMigrations() {
    console.log('Checking for pending database migrations...');
    try {
        // Migration 1: Add is_active to packages
        const addColumnQuery = `
            ALTER TABLE packages
            ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1;
        `;

        await db.query(addColumnQuery);
        console.log('Migration Success: Added is_active column to packages table.');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Migration Info: is_active column already exists.');
        } else {
            console.error('Migration Error:', err);
        }
    }

    try {
        // Migration 2: Create routers table
        const createRoutersTableQuery = `
            CREATE TABLE IF NOT EXISTS routers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT NOT NULL,
                name VARCHAR(255) NOT NULL,
                mikhmon_url TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
            );
        `;
        await db.query(createRoutersTableQuery);
        console.log('Migration Success: Routers table checked/created.');
    } catch (err) {
        console.error('Migration Error (Routers Table):', err);
    }

    try {
        // Migration 3: Add router_id to transactions
        const addRouterColumnQuery = `
            ALTER TABLE transactions
            ADD COLUMN router_id INT DEFAULT NULL;
        `;
        await db.query(addRouterColumnQuery);
        console.log('Migration Success: Added router_id to transactions table.');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Migration Info: router_id column already exists in transactions.');
        } else {
            console.error('Migration Error (Transactions router_id):', err);
        }
    }

    try {
        // Migration 4: Allow NULL for package_id in transactions (for safe deletion)
        const alterPackageIdQuery = `
            ALTER TABLE transactions
            MODIFY COLUMN package_id INT NULL;
        `;
        await db.query(alterPackageIdQuery);
        console.log('Migration Success: transactions.package_id is now nullable.');
    } catch (err) {
        console.error('Migration Error (Transactions package_id):', err);
    }

    try {
        // Migration 5: Add role to admins
        const addRoleQuery = `
            ALTER TABLE admins
            ADD COLUMN role ENUM('admin', 'super_admin') DEFAULT 'admin';
        `;
        await db.query(addRoleQuery);
        console.log('Migration Success: Added role column to admins table.');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Migration Info: role column already exists in admins.');
        } else {
            console.error('Migration Error (Admins role):', err);
        }
    }

    try {
        // Migration 6: Add billing_type to admins
        const addBillingTypeQuery = `
            ALTER TABLE admins
            ADD COLUMN billing_type ENUM('commission', 'subscription') DEFAULT 'commission' AFTER role;
        `;
        await db.query(addBillingTypeQuery);
        console.log('Migration Success: Added billing_type column to admins table.');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Migration Info: billing_type column already exists in admins.');
        } else {
            console.error('Migration Error (Admins billing_type):', err);
        }
    }

    try {
        // Migration 7: Add subscription_expiry to admins
        const addSubExpiryQuery = `
            ALTER TABLE admins
            ADD COLUMN subscription_expiry DATETIME DEFAULT NULL AFTER billing_type;
        `;
        await db.query(addSubExpiryQuery);
        console.log('Migration Success: Added subscription_expiry column to admins table.');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Migration Info: subscription_expiry column already exists in admins.');
        } else {
            console.error('Migration Error (Admins subscription_expiry):', err);
        }
    }

    try {
        // Migration 8: Router isolation (categories, packages, vouchers)
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        if (!(await columnExists('categories', 'router_id'))) {
            console.log("Migration: Adding router_id to categories...");
            await db.query("ALTER TABLE categories ADD COLUMN router_id INT NULL");
        }

        if (!(await columnExists('packages', 'router_id'))) {
            console.log("Migration: Adding router_id to packages...");
            await db.query("ALTER TABLE packages ADD COLUMN router_id INT NULL");
            await db.query("ALTER TABLE packages ADD CONSTRAINT fk_pkg_router FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE SET NULL");
        }

        if (!(await columnExists('vouchers', 'router_id'))) {
            console.log("Migration: Adding router_id to vouchers...");
            await db.query("ALTER TABLE vouchers ADD COLUMN router_id INT NULL");
            await db.query("ALTER TABLE vouchers ADD CONSTRAINT fk_voucher_router FOREIGN KEY (router_id) REFERENCES routers(id) ON DELETE SET NULL");
        }

        console.log('Migration Success: Router isolation columns checked/added.');
    } catch (err) {
        console.error('Migration Error (Router Isolation):', err);
    }

    try {
        // Migration 9: Add RADIUS and VPN columns to routers, and make mikhmon_url nullable
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        if (await columnExists('routers', 'mikhmon_url')) {
            await db.query("ALTER TABLE routers MODIFY COLUMN mikhmon_url TEXT NULL");
        }

        if (!(await columnExists('routers', 'ip_address'))) {
            console.log("Migration: Adding ip_address to routers...");
            await db.query("ALTER TABLE routers ADD COLUMN ip_address VARCHAR(45) DEFAULT NULL");
        }

        if (!(await columnExists('routers', 'radius_secret'))) {
            console.log("Migration: Adding radius_secret to routers...");
            await db.query("ALTER TABLE routers ADD COLUMN radius_secret VARCHAR(255) DEFAULT NULL");
        }

        if (!(await columnExists('routers', 'wg_private_key'))) {
            console.log("Migration: Adding wg_private_key to routers...");
            await db.query("ALTER TABLE routers ADD COLUMN wg_private_key VARCHAR(64) DEFAULT NULL");
        }

        if (!(await columnExists('routers', 'wg_public_key'))) {
            console.log("Migration: Adding wg_public_key to routers...");
            await db.query("ALTER TABLE routers ADD COLUMN wg_public_key VARCHAR(64) DEFAULT NULL");
        }

        console.log('Migration Success: RADIUS/VPN columns checked/added to routers.');
    } catch (err) {
        console.error('Migration Error (Router RADIUS/VPN Columns):', err);
    }

    try {
        // Migration 10: Modify admins role and add parent_id, portal_dns, portal_logo, portal_welcome_msg, terms_text columns
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        console.log("Migration: Checking/modifying admins.role ENUM...");
        await db.query("ALTER TABLE admins MODIFY COLUMN role ENUM('admin', 'super_admin', 'agent') DEFAULT 'admin'");

        if (!(await columnExists('admins', 'parent_id'))) {
            console.log("Migration: Adding parent_id to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN parent_id INT DEFAULT NULL");
            await db.query("ALTER TABLE admins ADD CONSTRAINT fk_admin_parent FOREIGN KEY (parent_id) REFERENCES admins(id) ON DELETE CASCADE");
        }

        if (!(await columnExists('admins', 'portal_dns'))) {
            console.log("Migration: Adding portal_dns to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN portal_dns VARCHAR(255) DEFAULT NULL");
        }

        if (!(await columnExists('admins', 'portal_logo'))) {
            console.log("Migration: Adding portal_logo to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN portal_logo VARCHAR(255) DEFAULT NULL");
        }

        if (!(await columnExists('admins', 'portal_welcome_msg'))) {
            console.log("Migration: Adding portal_welcome_msg to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN portal_welcome_msg VARCHAR(255) DEFAULT NULL");
        }

        if (!(await columnExists('admins', 'terms_text'))) {
            console.log("Migration: Adding terms_text to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN terms_text TEXT DEFAULT NULL");
        }

        // Create portal_ads table
        console.log("Migration: Checking/creating portal_ads table...");
        await db.query(`
            CREATE TABLE IF NOT EXISTS portal_ads (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT NOT NULL,
                title VARCHAR(255) NOT NULL,
                image_url VARCHAR(255) NOT NULL,
                link_url VARCHAR(255) DEFAULT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
            )
        `);

        // Add validity_unit and validity_minutes to packages table if missing
        if (!(await columnExists('packages', 'validity_unit'))) {
            console.log("Migration: Adding validity_unit to packages...");
            await db.query("ALTER TABLE packages ADD COLUMN validity_unit ENUM('minutes', 'hours') DEFAULT 'hours'");
        }

        if (!(await columnExists('packages', 'validity_minutes'))) {
            console.log("Migration: Adding validity_minutes to packages...");
            await db.query("ALTER TABLE packages ADD COLUMN validity_minutes INT DEFAULT NULL");
        }

        console.log('Migration Success: Admins role, parent_id, portal settings and portal_ads table checked/created.');
    } catch (err) {
        console.error('Migration Error (Portal Settings & Ads):', err);
    }

    try {
        // Migration 11: Add business_name, business_phone, portal_slug, referral_code to admins
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        if (!(await columnExists('admins', 'business_name'))) {
            console.log("Migration: Adding business_name to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN business_name VARCHAR(255) DEFAULT 'UGPAY'");
        }

        if (!(await columnExists('admins', 'business_phone'))) {
            console.log("Migration: Adding business_phone to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN business_phone VARCHAR(50) DEFAULT NULL");
        }

        if (!(await columnExists('admins', 'portal_slug'))) {
            console.log("Migration: Adding portal_slug to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN portal_slug VARCHAR(50) UNIQUE DEFAULT NULL");
        }

        if (!(await columnExists('admins', 'referral_code'))) {
            console.log("Migration: Adding referral_code to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN referral_code VARCHAR(50) DEFAULT NULL");
        }

        if (!(await columnExists('admins', 'email'))) {
            console.log("Migration: Adding email to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN email VARCHAR(255) DEFAULT NULL");
        }

        if (!(await columnExists('admins', 'commission_rate'))) {
            console.log("Migration: Adding commission_rate to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN commission_rate DECIMAL(5,2) DEFAULT 5.00 AFTER billing_type");
        }

        // Generate unique random portal_slug for any existing admins that don't have one
        const [admins] = await db.query("SELECT id FROM admins WHERE portal_slug IS NULL OR portal_slug = '' OR portal_slug = 'default'");
        if (admins.length > 0) {
            console.log(`Migration: Generating unique portal_slug for ${admins.length} admins...`);
            const crypto = require('crypto');
            for (const admin of admins) {
                const slug = 'wp_' + crypto.randomBytes(6).toString('hex');
                await db.query("UPDATE admins SET portal_slug = ? WHERE id = ?", [slug, admin.id]);
            }
        }

        console.log('Migration Success: Admins business details and portal_slug checked/created.');
    } catch (err) {
        console.error('Migration Error (Business details & portal_slug):', err);
    }

    try {
        // Migration 12: Ensure withdrawals, admin_subscriptions, and sms_logs tables exist
        await db.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                phone_number VARCHAR(50) DEFAULT NULL,
                status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
                reference VARCHAR(100) UNIQUE DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS admin_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT NOT NULL,
                amount DECIMAL(10,2) NOT NULL,
                months INT NOT NULL DEFAULT 1,
                phone_number VARCHAR(50) DEFAULT NULL,
                status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
                reference VARCHAR(100) UNIQUE DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS sms_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                admin_id INT NOT NULL,
                phone_number VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                status ENUM('sent', 'failed') DEFAULT 'sent',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('Migration Success: withdrawals, admin_subscriptions, and sms_logs tables checked/created.');
    } catch (err) {
        console.error('Migration Error (Withdrawals & Subscriptions):', err);
    }

    try {
        // Migration 13: Ensure vouchers table has is_giveaway and package_ref columns
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        if (!(await columnExists('vouchers', 'is_giveaway'))) {
            console.log("Migration: Adding is_giveaway to vouchers...");
            await db.query("ALTER TABLE vouchers ADD COLUMN is_giveaway TINYINT(1) DEFAULT 0");
        }

        if (!(await columnExists('vouchers', 'package_ref'))) {
            console.log("Migration: Adding package_ref to vouchers...");
            await db.query("ALTER TABLE vouchers ADD COLUMN package_ref VARCHAR(255) DEFAULT NULL");
        }

        console.log('Migration Success: Voucher columns checked/created.');
    } catch (err) {
        console.error('Migration Error (Voucher Columns):', err);
    }

    try {
        // Migration 14: Update legacy portal_dns entries from wipay.com to ugpay.tech
        await db.query("UPDATE admins SET portal_dns = REPLACE(portal_dns, '.wipay.com', '.ugpay.tech') WHERE portal_dns LIKE '%.wipay.com'");
        await db.query("UPDATE admins SET portal_dns = REPLACE(portal_dns, 'wipay.com', 'ugpay.tech') WHERE portal_dns = 'wipay.com'");
        console.log('Migration Success: Legacy portal_dns entries updated to .ugpay.tech');
    } catch (err) {
        console.error('Migration Error (portal_dns update):', err);
    }

    try {
        // Migration 15: Fix failed_low_sms transactions and convert them to success
        await db.query("UPDATE transactions SET status = 'success' WHERE status = 'failed_low_sms'");
        console.log('Migration Success: Converted failed_low_sms transactions to success.');
    } catch (err) {
        console.error('Migration Error (Fix failed_low_sms):', err);
    }

    try {
        // Migration 17: Regenerate valid WireGuard keys for any routers with dummy AAAAAA keys
        const { generateWgKeys, rebuildWireGuardConfig } = require('./vpn');
        const [dummyRouters] = await db.query("SELECT id, name FROM routers WHERE wg_private_key LIKE 'AAAAA%' OR wg_private_key LIKE '%AAA==' OR wg_private_key IS NULL");
        if (dummyRouters.length > 0) {
            console.log(`Migration: Regenerating valid WireGuard keys for ${dummyRouters.length} routers...`);
            for (const r of dummyRouters) {
                const { privateKey, publicKey } = generateWgKeys();
                await db.query("UPDATE routers SET wg_private_key = ?, wg_public_key = ? WHERE id = ?", [privateKey, publicKey, r.id]);
            }
            await rebuildWireGuardConfig();
            console.log("Migration Success: WireGuard keys regenerated and synced to wg0.conf.");
        }
    } catch (err) {
        console.error('Migration Error (Fix WireGuard Keys):', err);
    }

    // Migration 16: Ensure NAS table and ALL active vouchers exist in RADIUS
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS nas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nasname VARCHAR(128) NOT NULL UNIQUE,
                shortname VARCHAR(32),
                type VARCHAR(30) DEFAULT 'mikrotik',
                ports INT,
                secret VARCHAR(60) NOT NULL DEFAULT 'testing123',
                server VARCHAR(64),
                community VARCHAR(64),
                description VARCHAR(200),
                KEY nasname (nasname)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await db.query(`
            INSERT INTO nas (nasname, shortname, type, secret, description)
            SELECT ip_address, name, 'mikrotik', radius_secret, CONCAT('Router ID ', id)
            FROM routers
            ON DUPLICATE KEY UPDATE secret = VALUES(secret), shortname = VALUES(shortname);
        `);

        await db.query(`
            INSERT IGNORE INTO radcheck (username, attribute, op, value)
            SELECT code, 'Cleartext-Password', ':=', code FROM vouchers WHERE status IS NULL OR status != 'expired'
        `);
        await db.query(`
            INSERT IGNORE INTO radcheck (username, attribute, op, value)
            SELECT code, 'User-Password', ':=', code FROM vouchers WHERE status IS NULL OR status != 'expired'
        `);
        console.log(`[MIGRATION] Fast-synced NAS routers and active vouchers to RADIUS.`);
    } catch (err) {
        console.error('[MIGRATION ERROR] NAS & Voucher RADIUS Sync:', err.message);
    }
    try {
        // Migration 19: Add RouterOS API credentials to routers table and timestamp tracking to vouchers table
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        if (!(await columnExists('routers', 'api_port'))) {
            console.log("Migration: Adding api_port to routers...");
            await db.query("ALTER TABLE routers ADD COLUMN api_port INT DEFAULT 8728");
        }
        if (!(await columnExists('routers', 'api_user'))) {
            console.log("Migration: Adding api_user to routers...");
            await db.query("ALTER TABLE routers ADD COLUMN api_user VARCHAR(100) DEFAULT 'admin'");
        }
        if (!(await columnExists('routers', 'api_password'))) {
            console.log("Migration: Adding api_password to routers...");
            await db.query("ALTER TABLE routers ADD COLUMN api_password VARCHAR(255) DEFAULT NULL");
        }

        if (!(await columnExists('vouchers', 'first_used_at'))) {
            console.log("Migration: Adding first_used_at to vouchers...");
            await db.query("ALTER TABLE vouchers ADD COLUMN first_used_at DATETIME DEFAULT NULL");
        }
        if (!(await columnExists('vouchers', 'expires_at'))) {
            console.log("Migration: Adding expires_at to vouchers...");
            await db.query("ALTER TABLE vouchers ADD COLUMN expires_at DATETIME DEFAULT NULL");
        }

        console.log('Migration Success: Router API credentials and voucher expiration timestamps checked/added.');
    } catch (err) {
        console.error('Migration Error (Router API & Voucher Timestamps):', err);
    }

    try {
        // Migration 20: Ensure all package and voucher columns exist to prevent 500 SQL errors
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        // Routers Table Column Checks
        if (!(await columnExists('routers', 'wg_ip'))) {
            console.log("Migration: Adding wg_ip to routers...");
            await db.query("ALTER TABLE routers ADD COLUMN wg_ip VARCHAR(45) DEFAULT NULL");
        }

        // Packages Table Column Checks
        if (!(await columnExists('packages', 'rate_limit'))) {
            console.log("Migration: Adding rate_limit to packages...");
            await db.query("ALTER TABLE packages ADD COLUMN rate_limit VARCHAR(100) DEFAULT '1M/1M'");
        }
        if (!(await columnExists('packages', 'simultaneous_devices'))) {
            console.log("Migration: Adding simultaneous_devices to packages...");
            await db.query("ALTER TABLE packages ADD COLUMN simultaneous_devices INT DEFAULT 1");
        }
        if (!(await columnExists('packages', 'data_limit_mb'))) {
            console.log("Migration: Adding data_limit_mb to packages...");
            await db.query("ALTER TABLE packages ADD COLUMN data_limit_mb INT DEFAULT 0");
        }

        // Vouchers Table Column Checks
        if (!(await columnExists('vouchers', 'used_by'))) {
            console.log("Migration: Adding used_by to vouchers...");
            await db.query("ALTER TABLE vouchers ADD COLUMN used_by VARCHAR(50) DEFAULT NULL");
        }
        if (!(await columnExists('vouchers', 'used_at'))) {
            console.log("Migration: Adding used_at to vouchers...");
            await db.query("ALTER TABLE vouchers ADD COLUMN used_at DATETIME DEFAULT NULL");
        }
        if (!(await columnExists('vouchers', 'comment'))) {
            console.log("Migration: Adding comment to vouchers...");
            await db.query("ALTER TABLE vouchers ADD COLUMN comment VARCHAR(255) DEFAULT NULL");
        }

        // FreeRADIUS Accounting & Auth Tables
        await db.query(`
            CREATE TABLE IF NOT EXISTS radacct (
                radacctid BIGINT AUTO_INCREMENT PRIMARY KEY,
                acctsessionid VARCHAR(64) NOT NULL DEFAULT '',
                acctuniqueid VARCHAR(32) NOT NULL DEFAULT '',
                username VARCHAR(64) NOT NULL DEFAULT '',
                realm VARCHAR(64) DEFAULT '',
                nasipaddress VARCHAR(15) NOT NULL DEFAULT '',
                nasportid VARCHAR(32) DEFAULT NULL,
                nasporttype VARCHAR(32) DEFAULT NULL,
                acctstarttime DATETIME DEFAULT NULL,
                acctupdatetime DATETIME DEFAULT NULL,
                acctstoptime DATETIME DEFAULT NULL,
                acctinterval INT DEFAULT NULL,
                acctsessiontime INT UNSIGNED DEFAULT NULL,
                acctauthentic VARCHAR(32) DEFAULT NULL,
                connectinfo_start VARCHAR(50) DEFAULT NULL,
                connectinfo_stop VARCHAR(50) DEFAULT NULL,
                acctinputoctets BIGINT DEFAULT NULL,
                acctoutputoctets BIGINT DEFAULT NULL,
                calledstationid VARCHAR(50) NOT NULL DEFAULT '',
                callingstationid VARCHAR(50) NOT NULL DEFAULT '',
                acctterminatecause VARCHAR(32) NOT NULL DEFAULT '',
                servicetype VARCHAR(32) DEFAULT NULL,
                framedprotocol VARCHAR(32) DEFAULT NULL,
                framedipaddress VARCHAR(15) NOT NULL DEFAULT '',
                KEY username (username),
                KEY framedipaddress (framedipaddress),
                KEY acctsessionid (acctsessionid),
                KEY acctstarttime (acctstarttime),
                KEY acctstoptime (acctstoptime),
                KEY nasipaddress (nasipaddress)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS radcheck (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL DEFAULT '',
                attribute VARCHAR(64) NOT NULL DEFAULT '',
                op VARCHAR(2) NOT NULL DEFAULT ':=',
                value VARCHAR(253) NOT NULL DEFAULT '',
                KEY username (username)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS radreply (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(64) NOT NULL DEFAULT '',
                attribute VARCHAR(64) NOT NULL DEFAULT '',
                op VARCHAR(2) NOT NULL DEFAULT '=',
                value VARCHAR(253) NOT NULL DEFAULT '',
                KEY username (username)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Ensure all radacct columns required by FreeRADIUS 3.0 exist
        const radacctColumns = [
            { name: 'acctauthentic', type: 'VARCHAR(32) DEFAULT NULL' },
            { name: 'connectinfo_start', type: 'VARCHAR(50) DEFAULT NULL' },
            { name: 'connectinfo_stop', type: 'VARCHAR(50) DEFAULT NULL' },
            { name: 'acctupdatetime', type: 'DATETIME DEFAULT NULL' },
            { name: 'acctinterval', type: 'INT DEFAULT NULL' },
            { name: 'framedipv6address', type: 'VARCHAR(42) DEFAULT NULL' },
            { name: 'framedipv6prefix', type: 'VARCHAR(44) DEFAULT NULL' },
            { name: 'framedinterfaceid', type: 'VARCHAR(44) DEFAULT NULL' },
            { name: 'delegatedipv6prefix', type: 'VARCHAR(44) DEFAULT NULL' }
        ];

        for (const col of radacctColumns) {
            if (!(await columnExists('radacct', col.name))) {
                console.log(`Migration: Adding ${col.name} to radacct...`);
                await db.query(`ALTER TABLE radacct ADD COLUMN ${col.name} ${col.type}`);
            }
        }

        // Ensure agents table has email column
        if (!(await columnExists('agents', 'email'))) {
            console.log("Migration: Adding email column to agents table...");
            await db.query("ALTER TABLE agents ADD COLUMN email VARCHAR(255) DEFAULT NULL AFTER username");
        }

        // Performance Indexes Optimization
        console.log('Migration: Checking and creating high-performance database indexes...');
        const indexQueries = [
            'CREATE INDEX idx_radacct_user_stop ON radacct (username, acctstoptime)',
            'CREATE INDEX idx_radacct_callingstationid ON radacct (callingstationid)',
            'CREATE INDEX idx_vouchers_code ON vouchers (code)',
            'CREATE INDEX idx_vouchers_admin_pkg ON vouchers (admin_id, package_id)',
            'CREATE INDEX idx_vouchers_agent_used ON vouchers (agent_id, is_used)',
            'CREATE INDEX idx_transactions_admin_status ON transactions (admin_id, status, created_at)',
            'CREATE INDEX idx_transactions_agent_settled ON transactions (agent_id, is_settled)',
            'CREATE INDEX idx_packages_admin_active ON packages (admin_id, is_active)',
            'CREATE INDEX idx_agents_admin ON agents (admin_id)',
            'CREATE INDEX idx_routers_admin ON routers (admin_id)',
            'CREATE INDEX idx_sms_logs_admin ON sms_logs (admin_id)'
        ];

        for (const q of indexQueries) {
            try {
                await db.query(q);
            } catch (idxErr) {
                // Ignore if index already exists (ER_DUP_KEYNAME / 1061)
            }
        }
        console.log('Migration Success: All package, voucher, FreeRADIUS, agents schema and performance indexes verified.');
    } catch (err) {
        console.error('Migration Error (Schema/Indexes Verification):', err);
    }

    try {
        // Migration 21: Align database table collations to utf8mb4_general_ci to prevent collation mismatch errors
        console.log("Migration: Aligning table collations for FreeRADIUS and vouchers...");
        await db.query("ALTER TABLE radacct CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci").catch(() => {});
        await db.query("ALTER TABLE radcheck CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci").catch(() => {});
        await db.query("ALTER TABLE radreply CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci").catch(() => {});
        await db.query("ALTER TABLE vouchers CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci").catch(() => {});
        await db.query("ALTER TABLE routers CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci").catch(() => {});
        await db.query("ALTER TABLE vouchers MODIFY code VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci").catch(() => {});
        await db.query("ALTER TABLE radacct MODIFY username VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci").catch(() => {});
        await db.query("ALTER TABLE radacct MODIFY nasipaddress VARCHAR(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci").catch(() => {});
        await db.query("ALTER TABLE routers MODIFY ip_address VARCHAR(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci").catch(() => {});
        console.log('Migration Success: Table collations aligned to utf8mb4_general_ci.');
    } catch (err) {
        console.error('Migration Error (Collation Alignment):', err);
    }

    try {
        // Migration 22: Add opening_balance and last_settled_at to admins table for permanent balance tracking
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        if (!(await columnExists('admins', 'opening_balance'))) {
            console.log("Migration: Adding opening_balance to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN opening_balance DECIMAL(10,2) DEFAULT 0.00");
        }

        if (!(await columnExists('admins', 'last_settled_at'))) {
            console.log("Migration: Adding last_settled_at to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN last_settled_at DATETIME DEFAULT NULL");
        }
        console.log('Migration Success: Admins opening_balance and last_settled_at checked/created.');
    } catch (err) {
        console.error('Migration Error (Admins opening_balance & last_settled_at):', err);
    }

    try {
        // Migration 23: Instant MySQL Trigger on radacct to dynamically update radreply Session-Timeout on every accounting update/stop
        console.log("Migration: Restoring voucher passwords, backfilling Max-All-Session, and creating radacct triggers...");

        // 0. Ensure status column exists, widen radpostauth.pass, purge Max-All-Session, and deduplicate radcheck/radreply
        await db.query(`ALTER TABLE vouchers ADD COLUMN status VARCHAR(20) DEFAULT 'active'`).catch(() => {});
        await db.query(`ALTER TABLE radpostauth MODIFY pass VARCHAR(255) NOT NULL DEFAULT ''`).catch(() => {});
        await db.query(`DELETE FROM radcheck WHERE attribute = 'Max-All-Session'`).catch(() => {});

        await db.query(`
            DELETE t1 FROM radcheck t1
            INNER JOIN radcheck t2 
            WHERE t1.id > t2.id AND t1.username = t2.username AND t1.attribute = t2.attribute
        `).catch(() => {});

        await db.query(`
            DELETE t1 FROM radcheck WHERE attribute = 'Max-All-Session'
        `).catch(() => {});

        await db.query(`
            DELETE t1 FROM radreply t1
            INNER JOIN radreply t2 
            WHERE t1.id > t2.id AND t1.username = t2.username AND t1.attribute = t2.attribute
        `).catch(() => {});

        await db.query(`ALTER TABLE radcheck ADD UNIQUE KEY idx_user_attr (username, attribute)`).catch(() => {});
        await db.query(`ALTER TABLE radreply ADD UNIQUE KEY idx_user_attr (username, attribute)`).catch(() => {});

        // 1. Reset status = 'active' for vouchers that have NOT exhausted their package duration
        await db.query(`
            UPDATE vouchers v
            LEFT JOIN (
                SELECT username, COALESCE(SUM(acctsessiontime), 0) as total_used 
                FROM radacct 
                GROUP BY username
            ) r ON r.username = v.code
            LEFT JOIN packages p ON p.id = v.package_id
            SET v.status = 'active'
            WHERE v.code IS NOT NULL AND (
              r.total_used IS NULL OR r.total_used < (
                CASE 
                  WHEN p.validity_unit = 'minutes' AND p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                  WHEN p.validity_hours > 0 THEN (p.validity_hours * 3600)
                  WHEN p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                  ELSE 86400
                END
              )
            )
        `).catch(() => {});

        // 2. Restore Cleartext-Password & User-Password in radcheck for all active non-expired vouchers (Exact Case)
        await db.query(`
            INSERT INTO radcheck (username, attribute, op, value)
            SELECT v.code, 'Cleartext-Password', ':=', v.code
            FROM vouchers v
            WHERE v.code IS NOT NULL AND v.code != '' AND (v.status IS NULL OR v.status != 'expired')
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        `).catch(() => {});

        await db.query(`
            INSERT INTO radcheck (username, attribute, op, value)
            SELECT v.code, 'User-Password', ':=', v.code
            FROM vouchers v
            WHERE v.code IS NOT NULL AND v.code != '' AND (v.status IS NULL OR v.status != 'expired')
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        `).catch(() => {});

        // Restore Cleartext-Password & User-Password in radcheck (Lowercase)
        await db.query(`
            INSERT INTO radcheck (username, attribute, op, value)
            SELECT LOWER(v.code), 'Cleartext-Password', ':=', LOWER(v.code)
            FROM vouchers v
            WHERE v.code IS NOT NULL AND v.code != '' AND (v.status IS NULL OR v.status != 'expired')
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        `).catch(() => {});

        await db.query(`
            INSERT INTO radcheck (username, attribute, op, value)
            SELECT LOWER(v.code), 'User-Password', ':=', LOWER(v.code)
            FROM vouchers v
            WHERE v.code IS NOT NULL AND v.code != '' AND (v.status IS NULL OR v.status != 'expired')
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        `).catch(() => {});

        // Restore Cleartext-Password & User-Password in radcheck (Uppercase)
        await db.query(`
            INSERT INTO radcheck (username, attribute, op, value)
            SELECT UPPER(v.code), 'Cleartext-Password', ':=', UPPER(v.code)
            FROM vouchers v
            WHERE v.code IS NOT NULL AND v.code != '' AND (v.status IS NULL OR v.status != 'expired')
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        `).catch(() => {});

        await db.query(`
            INSERT INTO radcheck (username, attribute, op, value)
            SELECT UPPER(v.code), 'User-Password', ':=', UPPER(v.code)
            FROM vouchers v
            WHERE v.code IS NOT NULL AND v.code != '' AND (v.status IS NULL OR v.status != 'expired')
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        `).catch(() => {});

        // 3. Backfill Idle-Timeout (300 seconds default) in radreply for all existing vouchers
        await db.query(`
            INSERT INTO radreply (username, attribute, op, value)
            SELECT 
                v.code, 
                'Idle-Timeout', 
                ':=', 
                CAST(COALESCE(p.idle_timeout_seconds, 300) AS CHAR)
            FROM vouchers v
            JOIN packages p ON p.id = v.package_id
            WHERE v.code IS NOT NULL AND (v.status IS NULL OR v.status != 'expired')
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        `).catch(() => {});

        // 4. Backfill Session-Timeout in radreply for all existing active vouchers
        await db.query(`
            INSERT INTO radreply (username, attribute, op, value)
            SELECT 
                v.code, 
                'Session-Timeout', 
                ':=', 
                CAST(
                    CASE 
                        WHEN p.validity_unit = 'minutes' AND p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                        WHEN p.validity_hours > 0 THEN (p.validity_hours * 3600)
                        WHEN p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                        ELSE 86400
                    END AS CHAR
                )
            FROM vouchers v
            JOIN packages p ON p.id = v.package_id
            WHERE v.code IS NOT NULL AND (v.status IS NULL OR v.status != 'expired')
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        `).catch(() => {});

        // 3. Drop existing triggers if present to ensure clean update
        await db.query("DROP TRIGGER IF EXISTS trg_radacct_session_timeout_update").catch(() => {});
        await db.query("DROP TRIGGER IF EXISTS trg_radacct_session_timeout_insert").catch(() => {});
        await db.query("DROP TRIGGER IF EXISTS trg_radacct_session_timeout_update").catch(() => {});

        // Reset falsely expired vouchers back to active if remaining time exists
        await db.query(`
            UPDATE vouchers v
            JOIN packages p ON p.id = v.package_id
            LEFT JOIN (
                SELECT username, SUM(acctsessiontime) as total_used 
                FROM radacct 
                GROUP BY username
            ) a ON (LOWER(a.username) = LOWER(v.code))
            SET v.status = 'active'
            WHERE v.status = 'expired' AND COALESCE(a.total_used, 0) < (
                CASE 
                    WHEN p.validity_unit = 'minutes' AND p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                    WHEN p.validity_hours > 0 THEN (p.validity_hours * 3600)
                    WHEN p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                    ELSE 86400
                END
            )
        `).catch(() => {});

        // Create Trigger AFTER INSERT ON radacct
        await db.query(`
            CREATE TRIGGER trg_radacct_session_timeout_insert
            AFTER INSERT ON radacct
            FOR EACH ROW
            BEGIN
                DECLARE total_used INT DEFAULT 0;
                DECLARE total_allowed INT DEFAULT 0;
                DECLARE expiry_remaining INT DEFAULT 99999999;
                DECLARE remaining_time INT DEFAULT 0;
                
                IF NEW.username IS NOT NULL AND NEW.username != '' THEN
                    SELECT 
                        COALESCE(
                            CAST(
                                CASE 
                                    WHEN p.validity_unit = 'minutes' AND p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                                    WHEN p.validity_hours > 0 THEN (p.validity_hours * 3600)
                                    WHEN p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                                    ELSE 86400
                                END AS UNSIGNED
                            ), 0
                        ),
                        CASE
                            WHEN v.expires_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, NOW(), v.expires_at)
                            ELSE 99999999
                        END
                    INTO total_allowed, expiry_remaining
                    FROM vouchers v
                    JOIN packages p ON p.id = v.package_id
                    WHERE LOWER(v.code) = LOWER(NEW.username)
                    LIMIT 1;
                    
                    IF total_allowed > 0 THEN
                        SELECT COALESCE(SUM(acctsessiontime), 0) INTO total_used 
                        FROM radacct 
                        WHERE LOWER(username) = LOWER(NEW.username);

                        SET remaining_time = LEAST(total_allowed - total_used, expiry_remaining);
                        
                        IF remaining_time <= 0 THEN
                            UPDATE vouchers SET status = 'expired', is_used = 1 WHERE LOWER(code) = LOWER(NEW.username);
                            DELETE FROM radcheck WHERE LOWER(username) = LOWER(NEW.username) AND attribute = 'Cleartext-Password';
                            DELETE FROM radreply WHERE LOWER(username) = LOWER(NEW.username) AND attribute = 'Session-Timeout';
                        ELSEIF remaining_time > 0 THEN
                            INSERT INTO radreply (username, attribute, op, value)
                            VALUES (NEW.username, 'Session-Timeout', ':=', CAST(remaining_time AS CHAR))
                            ON DUPLICATE KEY UPDATE value = CAST(remaining_time AS CHAR);

                            INSERT INTO radcheck (username, attribute, op, value)
                            VALUES (NEW.username, 'Cleartext-Password', ':=', NEW.username)
                            ON DUPLICATE KEY UPDATE value = VALUES(value);
                        END IF;
                    END IF;
                END IF;
            END;
        `).catch(err => console.warn('Trigger creation warning (insert):', err.message));

        // Create Trigger AFTER UPDATE ON radacct
        await db.query(`
            CREATE TRIGGER trg_radacct_session_timeout_update
            AFTER UPDATE ON radacct
            FOR EACH ROW
            BEGIN
                DECLARE total_used INT DEFAULT 0;
                DECLARE total_allowed INT DEFAULT 0;
                DECLARE expiry_remaining INT DEFAULT 99999999;
                DECLARE remaining_time INT DEFAULT 0;
                
                IF NEW.username IS NOT NULL AND NEW.username != '' THEN
                    SELECT 
                        COALESCE(
                            CAST(
                                CASE 
                                    WHEN p.validity_unit = 'minutes' AND p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                                    WHEN p.validity_hours > 0 THEN (p.validity_hours * 3600)
                                    WHEN p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                                    ELSE 86400
                                END AS UNSIGNED
                            ), 0
                        ),
                        CASE
                            WHEN v.expires_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, NOW(), v.expires_at)
                            ELSE 99999999
                        END
                    INTO total_allowed, expiry_remaining
                    FROM vouchers v
                    JOIN packages p ON p.id = v.package_id
                    WHERE LOWER(v.code) = LOWER(NEW.username)
                    LIMIT 1;
                    
                    IF total_allowed > 0 THEN
                        SELECT COALESCE(SUM(acctsessiontime), 0) INTO total_used 
                        FROM radacct 
                        WHERE LOWER(username) = LOWER(NEW.username);

                        SET remaining_time = LEAST(total_allowed - total_used, expiry_remaining);
                        
                        IF remaining_time <= 0 THEN
                            UPDATE vouchers SET status = 'expired', is_used = 1 WHERE LOWER(code) = LOWER(NEW.username);
                            DELETE FROM radcheck WHERE LOWER(username) = LOWER(NEW.username) AND attribute = 'Cleartext-Password';
                            DELETE FROM radreply WHERE LOWER(username) = LOWER(NEW.username) AND attribute = 'Session-Timeout';
                        ELSEIF remaining_time > 0 THEN
                            INSERT INTO radreply (username, attribute, op, value)
                            VALUES (NEW.username, 'Session-Timeout', ':=', CAST(remaining_time AS CHAR))
                            ON DUPLICATE KEY UPDATE value = CAST(remaining_time AS CHAR);

                            INSERT INTO radcheck (username, attribute, op, value)
                            VALUES (NEW.username, 'Cleartext-Password', ':=', NEW.username)
                            ON DUPLICATE KEY UPDATE value = VALUES(value);
                        END IF;
                    END IF;
                END IF;
            END;
        `).catch(err => console.warn('Trigger creation warning (update):', err.message));

        console.log('Migration Success: radacct instant session timeout insert/update triggers & passwords restored.');
    } catch (err) {
        console.error('Migration Error (radacct Triggers):', err);
    }

    try {
        // Migration 24: Add gateway_ref column to transactions table for Airtel/MTN transaction IDs
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        if (!(await columnExists('transactions', 'gateway_ref'))) {
            console.log("Migration: Adding gateway_ref to transactions...");
            await db.query("ALTER TABLE transactions ADD COLUMN gateway_ref VARCHAR(255) DEFAULT NULL AFTER transaction_ref");
            await db.query("CREATE INDEX idx_transactions_gateway_ref ON transactions (gateway_ref)").catch(() => {});
        }
        console.log('Migration Success: gateway_ref column checked/created in transactions.');
    } catch (err) {
        console.error('Migration Error (gateway_ref in transactions):', err);
    }

    try {
        // Migration 25: Add withdrawal_otp and withdrawal_otp_expiry columns to admins
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        if (!(await columnExists('admins', 'withdrawal_otp'))) {
            console.log("Migration: Adding withdrawal_otp to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN withdrawal_otp VARCHAR(10) DEFAULT NULL");
        }
        if (!(await columnExists('admins', 'withdrawal_otp_expiry'))) {
            console.log("Migration: Adding withdrawal_otp_expiry to admins...");
            await db.query("ALTER TABLE admins ADD COLUMN withdrawal_otp_expiry DATETIME DEFAULT NULL");
        }
        console.log('Migration Success: withdrawal_otp columns checked/created in admins.');
    } catch (err) {
        console.error('Migration Error (withdrawal_otp in admins):', err);
    }

    try {
        // Migration 26: Resolve duplicate voucher codes across tenants and re-sync active vouchers to RADIUS
        console.log("Migration 26: Checking for cross-tenant voucher code collisions...");
        const [duplicateRows] = await db.query(`
            SELECT MIN(code) as code, COUNT(*) as cnt, GROUP_CONCAT(id ORDER BY id ASC) as ids
            FROM vouchers
            GROUP BY LOWER(code)
            HAVING cnt > 1
        `);

        if (duplicateRows.length > 0) {
            console.log(`Migration 26: Resolving ${duplicateRows.length} duplicate voucher code groups across tenants...`);
            const crypto = require('crypto');
            for (const dup of duplicateRows) {
                const ids = dup.ids.split(',');
                // Keep the first voucher code intact, append random suffix to subsequent duplicate vouchers
                for (let i = 1; i < ids.length; i++) {
                    const uniqueSuffix = '_' + crypto.randomBytes(2).toString('hex').toUpperCase();
                    const newCode = dup.code + uniqueSuffix;
                    await db.query('UPDATE vouchers SET code = ? WHERE id = ?', [newCode, ids[i]]);
                    console.log(`Migration 26: Renamed duplicate voucher ID ${ids[i]} from ${dup.code} to ${newCode}`);
                }
            }
        }

        // Clean legacy User-Password attribute in radcheck and fix mismatched Cleartext-Password rows
        await db.query("DELETE FROM radcheck WHERE attribute = 'User-Password'").catch(() => {});
        await db.query("UPDATE radcheck SET value = username WHERE attribute = 'Cleartext-Password' AND value != username").catch(() => {});

        // Re-sync all active vouchers cleanly to FreeRADIUS radcheck and radreply
        const { syncVoucherToRadius } = require('./radius');
        const [activeVouchers] = await db.query(`
            SELECT code, package_id FROM vouchers 
            WHERE (status IS NULL OR status != 'expired') AND package_id IS NOT NULL
        `);
        console.log(`Migration 26: Re-syncing ${activeVouchers.length} active vouchers into RADIUS radcheck/radreply...`);
        for (const v of activeVouchers) {
            await syncVoucherToRadius(v.code, v.package_id).catch(() => {});
        }
        console.log('Migration 26 Success: All cross-tenant voucher collisions resolved and RADIUS re-synced.');
    } catch (err) {
        console.error('Migration Error (Voucher Collision Resolution):', err);
    }

    try {
        // Migration 27: Add mac_address and ip_address to transactions table for server-side auto-login
        const columnExists = async (table, column) => {
            const [rows] = await db.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
            return rows.length > 0;
        };

        if (!(await columnExists('transactions', 'mac_address'))) {
            console.log("Migration: Adding mac_address to transactions...");
            await db.query("ALTER TABLE transactions ADD COLUMN mac_address VARCHAR(50) DEFAULT NULL");
        }
        if (!(await columnExists('transactions', 'ip_address'))) {
            console.log("Migration: Adding ip_address to transactions...");
            await db.query("ALTER TABLE transactions ADD COLUMN ip_address VARCHAR(45) DEFAULT NULL");
        }
        console.log('Migration Success: mac_address and ip_address columns checked/created in transactions.');
    } catch (err) {
        console.error('Migration Error (mac_address/ip_address in transactions):', err);
    }
}

module.exports = { runPendingMigrations };



