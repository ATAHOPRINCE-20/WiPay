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

        // Generate slugs for any existing admins that don't have one
        const [admins] = await db.query("SELECT id FROM admins WHERE portal_slug IS NULL");
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
}

module.exports = { runPendingMigrations };
