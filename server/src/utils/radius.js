/**
 * RADIUS Database Sync Utilities
 * Syncs vouchers to FreeRADIUS database for Mikrotik hotspot authentication
 */

const db = require('../config/db');

/**
 * Sync a single voucher to RADIUS database
 * Creates entries in radcheck (password) and radreply (rate limit, session timeout)
 * 
 * @param {string} voucherCode - The voucher/username
 * @param {number} packageId - Package ID to fetch rate limit and validity
 * @returns {Promise<boolean>} True if sync successful
 */
async function syncVoucherToRadius(voucherCode, packageId) {
    try {
        const connection = await db.getConnection();
        
        try {
            // 1. Insert/Update password in radcheck
            // Password = voucher code (simple auth: username = code, password = code)
            await connection.query(`
                INSERT INTO radcheck (username, attribute, op, value)
                VALUES (?, 'Cleartext-Password', ':=', ?)
                ON DUPLICATE KEY UPDATE value = VALUES(value)
            `, [voucherCode, voucherCode]);

            console.log(`[RADIUS] Synced password for voucher: ${voucherCode}`);

            // 2. Fetch package details for rate limit and validity
            const [packages] = await connection.query(
                'SELECT rate_limit, validity_hours FROM packages WHERE id = ?',
                [packageId]
            );

            if (packages.length === 0) {
                console.warn(`[RADIUS] Package ${packageId} not found for voucher ${voucherCode}`);
                return true; // Still mark as synced; package might be deleted
            }

            const pkg = packages[0];

            // 3. Set rate limit (MikroTik-specific attribute)
            // Format: "1M/1M" means 1Mbps upload / 1Mbps download
            if (pkg.rate_limit) {
                await connection.query(`
                    INSERT INTO radreply (username, attribute, op, value)
                    VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)
                    ON DUPLICATE KEY UPDATE value = VALUES(value)
                `, [voucherCode, pkg.rate_limit]);

                console.log(`[RADIUS] Set rate limit for ${voucherCode}: ${pkg.rate_limit}`);
            }

            // 4. Set session timeout if validity_hours is set
            // Session-Timeout is in seconds
            if (pkg.validity_hours && pkg.validity_hours > 0) {
                const sessionSeconds = pkg.validity_hours * 3600;
                await connection.query(`
                    INSERT INTO radreply (username, attribute, op, value)
                    VALUES (?, 'Session-Timeout', ':=', ?)
                    ON DUPLICATE KEY UPDATE value = VALUES(value)
                `, [voucherCode, sessionSeconds.toString()]);

                console.log(`[RADIUS] Set session timeout for ${voucherCode}: ${sessionSeconds}s`);
            }

            return true;

        } finally {
            connection.release();
        }

    } catch (err) {
        console.error(`[RADIUS] Sync Error for voucher ${voucherCode}:`, err);
        // Don't throw; log and continue (RADIUS sync is non-critical)
        return false;
    }
}

/**
 * Sync multiple vouchers to RADIUS in batch
 * 
 * @param {Array<{code: string, packageId: number}>} vouchers - Array of voucher objects
 * @returns {Promise<number>} Number successfully synced
 */
async function syncBatchVouchersToRadius(vouchers) {
    let successCount = 0;

    for (const voucher of vouchers) {
        const success = await syncVoucherToRadius(voucher.code, voucher.packageId);
        if (success) successCount++;
    }

    console.log(`[RADIUS] Batch sync complete: ${successCount}/${vouchers.length} vouchers synced`);
    return successCount;
}

/**
 * Remove a voucher from RADIUS database
 * Called when vouchers are deleted
 * 
 * @param {string} voucherCode - The voucher code to remove
 * @returns {Promise<boolean>} True if successful
 */
async function deleteVoucherFromRadius(voucherCode) {
    try {
        const connection = await db.getConnection();

        try {
            // Remove from all RADIUS tables
            await connection.query('DELETE FROM radcheck WHERE username = ?', [voucherCode]);
            await connection.query('DELETE FROM radreply WHERE username = ?', [voucherCode]);
            await connection.query('DELETE FROM radusergroup WHERE username = ?', [voucherCode]);

            console.log(`[RADIUS] Deleted voucher from RADIUS: ${voucherCode}`);
            return true;

        } finally {
            connection.release();
        }

    } catch (err) {
        console.error(`[RADIUS] Delete Error for voucher ${voucherCode}:`, err);
        return false;
    }
}

/**
 * Check if RADIUS tables exist
 * Useful for health check / admin dashboard
 * 
 * @returns {Promise<boolean>} True if all required RADIUS tables exist
 */
async function checkRadiusTablesExist() {
    try {
        const connection = await db.getConnection();

        try {
            const requiredTables = ['radcheck', 'radreply', 'radusergroup', 'radacct', 'nas'];
            
            for (const table of requiredTables) {
                const [rows] = await connection.query(`SHOW TABLES LIKE '${table}'`);
                if (rows.length === 0) {
                    console.warn(`[RADIUS] Missing table: ${table}`);
                    return false;
                }
            }

            console.log('[RADIUS] All required tables found');
            return true;

        } finally {
            connection.release();
        }

    } catch (err) {
        console.error('[RADIUS] Check Tables Error:', err);
        return false;
    }
}

module.exports = {
    syncVoucherToRadius,
    syncBatchVouchersToRadius,
    deleteVoucherFromRadius,
    checkRadiusTablesExist
};
