const db = require('f:/WIPAY/server/src/config/db');

async function run() {
    const [admins] = await db.query('SELECT id, portal_slug, subscription_expiry, billing_type FROM admins');
    console.log('Admins:', admins);

    const [packages] = await db.query('SELECT * FROM packages');
    console.log('Packages:', packages);

    const [vouchers] = await db.query('SELECT id, package_id, is_used FROM vouchers');
    console.log('Vouchers count:', vouchers.length, 'unused:', vouchers.filter(v => v.is_used === 0).length);

    // Run the exact query
    let query = `
        SELECT p.id, p.name, p.price, p.validity_hours AS duration_hours
        FROM packages p
        JOIN vouchers v ON p.id = v.package_id AND v.is_used = 0
        JOIN admins a ON p.admin_id = a.id
        WHERE p.is_active = 1
        AND (a.billing_type != 'subscription' OR a.subscription_expiry > NOW() OR a.subscription_expiry IS NULL)
        GROUP BY p.id, p.name, p.price, p.validity_hours
        HAVING COUNT(v.id) > 0
    `;
    const [result] = await db.query(query);
    console.log('Query result:', result);
    process.exit(0);
}
run();
