const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'server/.env' });

async function check() {
    try {
        const db = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'wipay'
        });

        console.log("Connected to DB.");

        const [superAdmins] = await db.query("SELECT id, username, role, opening_balance, last_settled_at FROM admins WHERE role = 'super_admin'");
        console.log("Super Admins:", superAdmins);

        const [transCount] = await db.query("SELECT COUNT(*) as cnt, SUM(amount) as total_amt, SUM(fee) as total_fee FROM transactions WHERE status = 'success' OR status = 'SUCCESS'");
        console.log("Successful Transactions:", transCount);

        const [commRows] = await db.query(`
            SELECT COALESCE(SUM(
                CASE 
                    WHEN t.fee IS NOT NULL AND t.fee > 0 THEN t.fee
                    WHEN COALESCE(a.billing_type, 'commission') = 'commission' THEN (t.amount * COALESCE(a.commission_rate, 5.00) / 100)
                    ELSE 0
                END
            ), 0) as fee_total 
            FROM transactions t
            LEFT JOIN admins a ON t.admin_id = a.id
            WHERE (t.status = 'success' OR t.status = 'SUCCESS')
              AND (t.transaction_ref NOT LIKE 'SMS-%' AND t.transaction_ref NOT LIKE 'SUB-%' AND t.transaction_ref NOT LIKE 'W-%')
        `);
        console.log("Calculated Commission Total:", commRows[0]);

        const [subRows] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) as sub_total 
            FROM admin_subscriptions 
            WHERE (status = 'success' OR status = 'SUCCESS')
        `);
        console.log("Calculated Subscriptions Total:", subRows[0]);

        await db.end();
    } catch (e) {
        console.error("Check error:", e.message);
    }
}

check();
