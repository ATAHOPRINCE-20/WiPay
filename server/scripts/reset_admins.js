const db = require('../src/config/db');
require('dotenv').config();

async function resetAdmins() {
    console.log('⚠ WARNING: This will delete ALL Admins (except Super Admin) and their Packages/Vouchers.');

    try {
        const conn = await db.getConnection();
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');

        // Identify Super Admin
        const SUPER_ADMIN_ID = 4;

        console.log(`Preserving Super Admin ID: ${SUPER_ADMIN_ID}`);

        // 1. Delete Vouchers belonging to other admins
        // Vouchers link to Packages. Packages link to Admins.
        console.log('Deleting vouchers for removed admins...');
        await conn.query(`
            DELETE v FROM vouchers v
            INNER JOIN packages p ON v.package_id = p.id
            WHERE p.admin_id != ?
        `, [SUPER_ADMIN_ID]);

        // 2. Delete Packages belonging to other admins
        console.log('Deleting packages for removed admins...');
        await conn.query('DELETE FROM packages WHERE admin_id != ?', [SUPER_ADMIN_ID]);

        // 3. Delete the Admins themselves
        console.log('Deleting non-super admins...');
        await conn.query('DELETE FROM admins WHERE id != ?', [SUPER_ADMIN_ID]);

        // 4. Cleanup any orphaned transactions/withdrawals if they weren't fully cleared before
        await conn.query('DELETE FROM transactions WHERE admin_id != ?', [SUPER_ADMIN_ID]);
        await conn.query('DELETE FROM withdrawals WHERE admin_id != ?', [SUPER_ADMIN_ID]);
        await conn.query('DELETE FROM sms_fees WHERE admin_id != ?', [SUPER_ADMIN_ID]);

        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        conn.release();

        console.log('✅ Admins Reset. Only Super Admin remains.');
        process.exit(0);

    } catch (err) {
        console.error('❌ Reset Failed:', err);
        process.exit(1);
    }
}

resetAdmins();
