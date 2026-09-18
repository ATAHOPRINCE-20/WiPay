const db = require('../config/db');
const { getWireGuardPeerStatus } = require('../utils/vpn');
const { sendRouterOfflineEmail, sendRouterOnlineEmail } = require('../utils/email');

/**
 * Periodically checks WireGuard peer handshakes for all registered routers.
 * Triggers an email alert when a router transitions to Offline (> 180s without handshake),
 * and a recovery email when it transitions back to Online.
 */
async function processRouterStatusChecks() {
    try {
        // Query all routers along with their owner admin email & business details
        const [routers] = await db.query(`
            SELECT r.id, r.name, r.ip_address, r.wg_public_key, r.offline_alert_sent, r.last_offline_alert_at,
                   a.email as admin_email, a.username as admin_username, a.business_name
            FROM routers r
            JOIN admins a ON r.admin_id = a.id
            WHERE r.wg_public_key IS NOT NULL 
              AND r.wg_public_key != ''
              AND a.email IS NOT NULL 
              AND a.email != ''
        `);

        if (routers.length === 0) return;

        const peerStatusMap = getWireGuardPeerStatus();
        const nowSec = Math.floor(Date.now() / 1000);

        for (const router of routers) {
            const lastHandshakeTs = peerStatusMap.get(router.wg_public_key) || 0;
            // Online if WireGuard handshake was within 180 seconds (3 minutes)
            const isOnline = lastHandshakeTs > 0 && (nowSec - lastHandshakeTs) <= 180;

            if (!isOnline) {
                // Router is OFFLINE
                // Send alert email ONLY if an offline alert has not been sent yet for this stretch
                if (!router.offline_alert_sent) {
                    console.log(`[ROUTER-MONITOR] Router #${router.id} "${router.name}" went OFFLINE. Sending email alert to admin (${router.admin_email})...`);
                    
                    const lastSeenDate = lastHandshakeTs > 0 ? new Date(lastHandshakeTs * 1000) : null;
                    const emailSent = await sendRouterOfflineEmail({
                        toEmail: router.admin_email,
                        username: router.admin_username,
                        businessName: router.business_name,
                        routerName: router.name,
                        ipAddress: router.ip_address,
                        lastSeen: lastSeenDate
                    });

                    if (emailSent) {
                        await db.query(
                            'UPDATE routers SET offline_alert_sent = 1, last_offline_alert_at = NOW() WHERE id = ?',
                            [router.id]
                        );
                        console.log(`[ROUTER-MONITOR] Router #${router.id} offline alert recorded in DB.`);
                    }
                }
            } else {
                // Router is ONLINE
                // If it was previously marked as offline (alert sent), send recovery email & reset flag
                if (router.offline_alert_sent) {
                    console.log(`[ROUTER-MONITOR] Router #${router.id} "${router.name}" recovered ONLINE. Sending recovery email to admin (${router.admin_email})...`);

                    const emailSent = await sendRouterOnlineEmail({
                        toEmail: router.admin_email,
                        username: router.admin_username,
                        businessName: router.business_name,
                        routerName: router.name,
                        ipAddress: router.ip_address
                    });

                    if (emailSent || true) {
                        await db.query(
                            'UPDATE routers SET offline_alert_sent = 0 WHERE id = ?',
                            [router.id]
                        );
                        console.log(`[ROUTER-MONITOR] Router #${router.id} offline flag reset to 0 in DB.`);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[ROUTER-MONITOR ERROR]:', err?.message || err);
    }
}

/**
 * Initialize the periodic router monitoring scheduler
 */
function startRouterMonitorScheduler() {
    // Run initial check 30 seconds after server startup
    setTimeout(() => {
        processRouterStatusChecks().catch(err => console.error('[ROUTER-MONITOR STARTUP ERROR]:', err));
    }, 30 * 1000);

    // Run periodic check every 2 minutes (120,000 ms)
    setInterval(() => {
        processRouterStatusChecks().catch(err => console.error('[ROUTER-MONITOR PERIODIC ERROR]:', err));
    }, 2 * 60 * 1000);

    console.log('[ROUTER-MONITOR] Scheduler initialized (Checking router status every 2 minutes).');
}

module.exports = {
    processRouterStatusChecks,
    startRouterMonitorScheduler
};
