/**
 * RADIUS Database Sync Utilities
 * Syncs vouchers to FreeRADIUS database for Mikrotik hotspot authentication
 */

const db = require('../config/db');

function getPackageValiditySeconds(pkg) {
    if (!pkg) return 0;

    if (pkg.validity_unit === 'minutes' && pkg.validity_minutes && pkg.validity_minutes > 0) {
        return pkg.validity_minutes * 60;
    }

    if (pkg.validity_unit === 'hours' && pkg.validity_hours && pkg.validity_hours > 0) {
        return pkg.validity_hours * 3600;
    }

    if (pkg.validity_hours && pkg.validity_hours > 0) {
        return pkg.validity_hours * 3600;
    }

    if (pkg.validity_minutes && pkg.validity_minutes > 0) {
        return pkg.validity_minutes * 60;
    }

    return 0;
}

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
            // 1. Strictly normalize voucher code to lowercase for FreeRADIUS PAP
            const codeExact = voucherCode.trim();
            const codeLower = codeExact.toLowerCase();
            const codeUpper = codeExact.toUpperCase();
            const codeVariations = Array.from(new Set([codeExact, codeLower, codeUpper]));

            // Clean legacy User-Password attribute & insert exact-matching lowercase Cleartext-Password
            for (const c of codeVariations) {
                await connection.query(`DELETE FROM radcheck WHERE username = ? AND (attribute = 'User-Password' OR attribute = 'Cleartext-Password')`, [c]);
            }

            await connection.query(`
                INSERT INTO radcheck (username, attribute, op, value)
                VALUES (?, 'Cleartext-Password', ':=', ?)
            `, [codeLower, codeLower]);

            console.log(`[RADIUS] Synced password for voucher: ${voucherCode}`);

            // 2. Fetch package details for rate limit, validity, and simultaneous devices
            const [packages] = await connection.query(
                'SELECT rate_limit, validity_hours, validity_minutes, validity_unit, simultaneous_devices FROM packages WHERE id = ?',
                [packageId]
            );

            if (packages.length === 0) {
                console.warn(`[RADIUS] Package ${packageId} not found for voucher ${voucherCode}`);
                return true;
            }

            const pkg = packages[0];

            // 3. Set rate limit (MikroTik-specific attribute) for all case variations
            if (pkg.rate_limit) {
                for (const c of codeVariations) {
                    await connection.query(`
                        INSERT INTO radreply (username, attribute, op, value)
                        VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)
                        ON DUPLICATE KEY UPDATE value = VALUES(value)
                    `, [c, pkg.rate_limit]);
                }
            }

            // 4. Set session timeout & expiration
            let sessionSeconds = 0;
            if (pkg.validity_unit === 'minutes' && pkg.validity_minutes && pkg.validity_minutes > 0) {
                sessionSeconds = Math.round(pkg.validity_minutes * 60);
            } else if (pkg.validity_hours && pkg.validity_hours > 0) {
                sessionSeconds = Math.round(pkg.validity_hours * 3600);
            } else if (pkg.validity_minutes && pkg.validity_minutes > 0) {
                sessionSeconds = Math.round(pkg.validity_minutes * 60);
            } else {
                sessionSeconds = 86400; // 24hr fallback
            }

            // Fetch cumulative session time used from radacct for this voucher (checking case variations)
            const [acctRows] = await connection.query(
                'SELECT COALESCE(SUM(acctsessiontime), 0) as total_used_sec, MIN(acctstarttime) as first_acct_start FROM radacct WHERE username IN (?)',
                [codeVariations]
            );
            const totalUsedSec = Number(acctRows[0]?.total_used_sec || 0);
            const firstAcctStart = acctRows[0]?.first_acct_start;

            // Fetch voucher details
            const [voucherDetails] = await connection.query(
                'SELECT first_used_at, expires_at FROM vouchers WHERE code = ? OR code = ? OR code = ?',
                [codeExact, codeLower, codeUpper]
            );

            let firstUsedAt = voucherDetails[0]?.first_used_at;
            let expiresAt = voucherDetails[0]?.expires_at;

            // Auto-activate voucher if accounting sessions exist but first_used_at is NULL
            if (!firstUsedAt && firstAcctStart) {
                firstUsedAt = new Date(firstAcctStart);
                expiresAt = new Date(firstUsedAt.getTime() + sessionSeconds * 1000);
                await connection.query(
                    'UPDATE vouchers SET first_used_at = ?, is_used = 1, expires_at = ? WHERE (code = ? OR code = ?) AND first_used_at IS NULL',
                    [firstUsedAt, expiresAt, codeExact, codeLower]
                ).catch(() => {});
            }

            let isExpired = false;
            let remainingUptimeSecs = Math.max(0, sessionSeconds - totalUsedSec);
            let effectiveTimeout = remainingUptimeSecs;

            if (expiresAt) {
                const now = Date.now();
                const remainingExpirySecs = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
                effectiveTimeout = Math.min(remainingUptimeSecs, remainingExpirySecs);
            }

            if (effectiveTimeout <= 0 || (sessionSeconds > 0 && totalUsedSec >= sessionSeconds) || (expiresAt && new Date(expiresAt).getTime() <= Date.now())) {
                isExpired = true;
                effectiveTimeout = 0;
            }

            if (isExpired) {
                // Deny login by marking expired and removing Password & Replies for all case variations
                await connection.query("UPDATE vouchers SET status = 'expired', is_used = 1 WHERE code IN (?)", [codeVariations]).catch(() => {});
                await connection.query("DELETE FROM radcheck WHERE username IN (?)", [codeVariations]).catch(() => {});
                await connection.query("DELETE FROM radreply WHERE username IN (?)", [codeVariations]).catch(() => {});
                return false;
            }

            if (effectiveTimeout > 0) {
                const idleTimeoutSecs = pkg.idle_timeout_seconds || 300;
                for (const c of codeVariations) {
                    await connection.query(`
                        INSERT INTO radreply (username, attribute, op, value)
                        VALUES (?, 'Session-Timeout', ':=', ?)
                        ON DUPLICATE KEY UPDATE value = VALUES(value)
                    `, [c, effectiveTimeout.toString()]);

                    await connection.query(`
                        INSERT INTO radreply (username, attribute, op, value)
                        VALUES (?, 'Idle-Timeout', ':=', ?)
                        ON DUPLICATE KEY UPDATE value = VALUES(value)
                    `, [c, idleTimeoutSecs.toString()]);
                }
            }

            // 5. Set simultaneous devices limit (Simultaneous-Use in radcheck)
            if (pkg.simultaneous_devices && pkg.simultaneous_devices > 0) {
                for (const c of codeVariations) {
                    await connection.query(`
                        INSERT INTO radcheck (username, attribute, op, value)
                        VALUES (?, 'Simultaneous-Use', ':=', ?)
                        ON DUPLICATE KEY UPDATE value = VALUES(value)
                    `, [c, pkg.simultaneous_devices.toString()]);
                }
            }

            return true;

        } finally {
            connection.release();
        }

    } catch (err) {
        console.error(`[RADIUS] Sync Error for voucher ${voucherCode}:`, err);
        return false;
    }
}

/**
 * Sync multiple vouchers to RADIUS in batch
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
 */
async function deleteVoucherFromRadius(voucherCode) {
    try {
        const connection = await db.getConnection();

        try {
            if (!voucherCode) return false;
            const codeExact = voucherCode.trim();
            const codeLower = codeExact.toLowerCase();
            const codeUpper = codeExact.toUpperCase();
            const codeVariations = Array.from(new Set([codeExact, codeLower, codeUpper]));

            await connection.query('DELETE FROM radcheck WHERE username IN (?)', [codeVariations]);
            await connection.query('DELETE FROM radreply WHERE username IN (?)', [codeVariations]);
            await connection.query('DELETE FROM radusergroup WHERE username IN (?)', [codeVariations]);

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

/**
 * Get active voucher sessions with computed remaining time.
 * Useful for dashboards and for expiry checks.
 */
async function getActiveVoucherSessions() {
    try {
        const connection = await db.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT
                    r.username,
                    r.acctsessionid,
                    r.acctstarttime,
                    r.acctupdatetime,
                    r.acctsessiontime,
                    r.nasipaddress,
                    v.package_id,
                    p.validity_hours,
                    p.validity_minutes,
                    p.validity_unit,
                    v.expires_at
                FROM radacct r
                LEFT JOIN vouchers v ON v.code = r.username COLLATE utf8mb4_general_ci
                LEFT JOIN packages p ON p.id = v.package_id
                WHERE r.acctstoptime IS NULL
                ORDER BY r.acctstarttime DESC
            `);

            return rows.map((row) => {
                const durationSeconds = getPackageValiditySeconds(row);
                const elapsedWallSecs = row.acctstarttime ? Math.max(0, Math.floor((Date.now() - new Date(row.acctstarttime).getTime()) / 1000)) : 0;
                const usedSeconds = Math.max(Number(row.acctsessiontime || 0), elapsedWallSecs);
                let remainingSeconds = durationSeconds > 0 ? Math.max(0, durationSeconds - usedSeconds) : null;

                if (row.expires_at) {
                    const remainingExpirySecs = Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000);
                    if (remainingSeconds === null || remainingExpirySecs < remainingSeconds) {
                        remainingSeconds = Math.max(0, remainingExpirySecs);
                    }
                }

                return {
                    ...row,
                    durationSeconds,
                    usedSeconds,
                    remainingSeconds
                };
            });
        } finally {
            connection.release();
        }
    } catch (err) {
        console.error('[RADIUS] Get Active Sessions Error:', err);
        return [];
    }
}

/**
 * Automatically clean up stale RADIUS accounting sessions that were left open
 */
async function cleanupStaleRadiusSessions() {
    try {
        const connection = await db.getConnection();
        try {
            // 1. Close dead/orphaned sessions in radacct that have been inactive for over 24 hours (86400s)
            // without interim updates, preventing false-positive premature closures of active 24hr/7day vouchers.
            const [result] = await connection.query(`
                UPDATE radacct 
                SET acctstoptime = DATE_ADD(acctstarttime, INTERVAL COALESCE(NULLIF(acctsessiontime, 0), 86400) SECOND),
                    acctterminatecause = 'Session-Timeout'
                WHERE acctstoptime IS NULL 
                  AND TIMESTAMPDIFF(SECOND, acctstarttime, NOW()) > 86400
                  AND (acctupdatetime IS NULL OR TIMESTAMPDIFF(SECOND, acctupdatetime, NOW()) > 7200)
            `);

            if (result.affectedRows > 0) {
                console.log(`[RADIUS Sweeper] Closed ${result.affectedRows} stale radacct session(s).`);
            }

            // 2. Expire active voucher sessions once package duration / expires_at is reached
            const activeSessions = await getActiveVoucherSessions();
            for (const session of activeSessions) {
                if (session.remainingSeconds !== null && session.remainingSeconds <= 0) {
                    console.log(`[RADIUS Sweeper] Expiring voucher session ${session.username} after ${session.usedSeconds}s`);
                    await disconnectVoucherSession(session.username, 'Session-Timeout');
                }

                // Disconnect orphaned sessions (unlinked vouchers) active over 24 hours
                if (session.remainingSeconds === null && session.acctstarttime) {
                    const elapsedHours = (Date.now() - new Date(session.acctstarttime).getTime()) / (1000 * 3600);
                    if (elapsedHours >= 24) {
                        console.log(`[RADIUS Sweeper] Disconnecting orphaned session ${session.username} after ${elapsedHours.toFixed(1)}h`);
                        await disconnectVoucherSession(session.username, 'Session-Timeout');
                    }
                }
            }

            // 3. Deactivate and mark expired all vouchers whose duration or expiration date has passed
            await connection.query(`
                UPDATE vouchers v
                LEFT JOIN (
                    SELECT username, COALESCE(SUM(acctsessiontime), 0) as total_used 
                    FROM radacct 
                    GROUP BY username
                ) r ON r.username = v.code
                LEFT JOIN packages p ON p.id = v.package_id
                SET v.status = 'expired', v.is_used = 1
                WHERE v.status != 'expired'
                  AND (
                    (v.expires_at IS NOT NULL AND v.expires_at <= NOW())
                    OR (
                      p.id IS NOT NULL AND r.total_used >= (
                        CASE 
                          WHEN p.validity_unit = 'minutes' AND p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                          WHEN p.validity_hours > 0 THEN (p.validity_hours * 3600)
                          WHEN p.validity_minutes > 0 THEN (p.validity_minutes * 60)
                          ELSE 86400
                        END
                      )
                    )
                  )
            `);

            // Fetch all deactivated/expired vouchers to purge RADIUS entries and disconnect sessions
            const [expiredVouchers] = await connection.query(`
                SELECT code FROM vouchers 
                WHERE status = 'expired' OR (expires_at IS NOT NULL AND expires_at <= NOW())
            `);

            for (const v of expiredVouchers) {
                await connection.query("DELETE FROM radcheck WHERE username = ? AND attribute = 'Cleartext-Password'", [v.code]);
                await connection.query("DELETE FROM radcheck WHERE username = ? AND attribute = 'Max-All-Session'", [v.code]);
                await connection.query("DELETE FROM radreply WHERE username = ?", [v.code]);
                await disconnectVoucherSession(v.code, 'Session-Timeout');
            }

            // 4. Re-sync radreply Session-Timeout for active non-expired vouchers
            const [usedVouchers] = await connection.query(`
                SELECT DISTINCT v.code, v.package_id 
                FROM vouchers v
                JOIN radacct r ON r.username = v.code
                WHERE v.package_id IS NOT NULL AND (v.status IS NULL OR v.status != 'expired')
            `);
            for (const uv of usedVouchers) {
                await syncVoucherToRadius(uv.code, uv.package_id);
            }

            // 5. Direct MikroTik hardware sweep for expired vouchers (removes active session & cookies)
            const [routers] = await connection.query("SELECT ip_address, api_port, api_user, api_password FROM routers");
            const { disconnectHotspotUser } = require('./mikrotikApi');
            for (const r of routers) {
                for (const v of expiredVouchers) {
                    await disconnectHotspotUser({
                        host: r.ip_address,
                        port: r.api_port || 8728,
                        user: r.api_user || 'admin',
                        password: r.api_password || ''
                    }, v.code).catch(() => false);
                }
            }

        } finally {
            connection.release();
        }
    } catch (err) {
        console.error('[RADIUS Sweeper Error]:', err);
    }
}

/**
 * Forcefully disconnect an active user session using MikroTik RouterOS API and RADIUS CoA
 */
async function disconnectVoucherSession(voucherCode, terminateCause = 'Admin-Reset') {
    try {
        const connection = await db.getConnection();
        try {
            // 1. Locate NAS IP and actual username from radacct matching username, MAC, or IP
            const [sessions] = await connection.query(
                "SELECT nasipaddress, username FROM radacct WHERE (LOWER(username) = LOWER(?) OR LOWER(callingstationid) = LOWER(?) OR framedipaddress = ?) AND acctstoptime IS NULL ORDER BY acctstarttime DESC LIMIT 1",
                [voucherCode, voucherCode, voucherCode]
            );

            let nasIp = sessions.length > 0 ? sessions[0].nasipaddress : null;
            let targetUser = (sessions.length > 0 && sessions[0].username) ? sessions[0].username : voucherCode;

            // 2. Fetch routers to attempt API disconnect + cookie clearance
            const [routers] = await connection.query(
                nasIp ? "SELECT ip_address, api_port, api_user, api_password FROM routers WHERE ip_address = ?" : "SELECT ip_address, api_port, api_user, api_password FROM routers",
                nasIp ? [nasIp] : []
            );

            const { disconnectHotspotUser } = require('./mikrotikApi');
            for (const r of routers) {
                await disconnectHotspotUser({
                    host: r.ip_address,
                    port: r.api_port || 8728,
                    user: r.api_user || 'admin',
                    password: r.api_password || ''
                }, targetUser).catch(() => false);
            }

            // 3. Send RADIUS CoA Packet of Disconnect if NAS IP is known
            if (nasIp) {
                const [nas] = await connection.query(
                    "SELECT secret FROM nas WHERE nasname = ?",
                    [nasIp]
                );

                if (nas.length > 0) {
                    const secret = nas[0].secret;
                    const { exec } = require('child_process');
                    const cmd = `echo "User-Name = ${targetUser}" | radclient -x ${nasIp}:3799 disconnect ${secret}`;
                    
                    exec(cmd, (error) => {
                        if (error) {
                            console.error(`[RADIUS CoA] radclient failed for ${targetUser} on ${nasIp}:`, error.message);
                        } else {
                            console.log(`[RADIUS CoA] Disconnected user ${targetUser} on NAS ${nasIp}`);
                        }
                    });
                }
            }

            // 4. Update radacct stop time
            await connection.query(
                "UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = ? WHERE (LOWER(username) = LOWER(?) OR LOWER(callingstationid) = LOWER(?) OR framedipaddress = ?) AND acctstoptime IS NULL",
                [terminateCause, targetUser, targetUser, targetUser]
            );

            return true;

        } finally {
            connection.release();
        }
    } catch (err) {
        console.error(`[RADIUS CoA] Error for ${voucherCode}:`, err);
        return false;
    }
}

module.exports = {
    syncVoucherToRadius,
    syncBatchVouchersToRadius,
    deleteVoucherFromRadius,
    checkRadiusTablesExist,
    getActiveVoucherSessions,
    cleanupStaleRadiusSessions,
    disconnectVoucherSession
};

