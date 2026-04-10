const { getClient, getDynamicClient } = require('../config/routeros');
const db = require('../config/db');

/**
 * Helper to get a RouterOS client for the specified router_id (or default)
 */
async function getRouterClient(router_id) {
    if (router_id) {
        const [routers] = await db.query('SELECT * FROM routers WHERE id = ?', [router_id]);
        if (routers.length > 0) {
            const r = routers[0];
            const mikhmonHost = r.mikhmon_url 
                ? r.mikhmon_url.replace('http://', '').replace('https://', '').split('/')[0].split(':')[0] 
                : null;
            const host = r.api_host || mikhmonHost || process.env.ROUTEROS_HOST;
            return getDynamicClient({
                host,
                user: r.api_user || process.env.ROUTEROS_USER,
                password: r.api_pass || process.env.ROUTEROS_PASSWORD,
                port: r.api_port || 8728
            });
        }
    }
    return getClient();
}

/**
 * Add a user to the Hotspot with multi-router support
 * @param {Object} params
 * @param {string} params.name - Username (voucher code)
 * @param {string} params.password - Password
 * @param {number} [params.router_id] - Specific router ID from DB
 * @param {number} [params.validity_hours] - Validity period in hours (Legacy)
 * @param {string} [params.validity_string] - Validity string (e.g. '1h', '10m') from CSV
 * @param {string} [params.profile='default'] - Hotspot user profile
 */
async function addHotspotUser({ name, password, router_id, validity_hours, validity_string, profile = 'default' }) {
    let client;
    try {
        client = await getRouterClient(router_id);

        // Write a duration marker (e.g. "wipay:24h" or "wipay:1d") into the comment.
        // The MikroTik On-Login script reads this prefix and calculates the real expiry
        // from the moment the user actually logs in, so validity is login-based not purchase-based.
        let durationMarker = '';
        if (validity_string) {
            let v = validity_string.trim().toLowerCase();
            // If it's just a number, append 'h' for safety
            if (!isNaN(v) && v !== '') {
                v = v + 'h';
            }
            durationMarker = `wipay:${v}`;
        } else if (validity_hours && validity_hours > 0) {
            if (validity_hours % 24 === 0) {
                durationMarker = `wipay:${validity_hours / 24}d`;
            } else {
                durationMarker = `wipay:${validity_hours}h`;
            }
        }

        const payload = {
            name,
            password,
            profile,
            comment: durationMarker  // e.g. "wipay:1d" — on-login script sets real expiry at login time
        };

        // Check if user exists using node-routeros standard print with query
        const users = await client.write(['/ip/hotspot/user/print', `?name=${name}`]);

        if (users.length > 0) {
            console.log(`[RouterOS] User ${name} already exists. Updating...`);
            await client.write([
                '/ip/hotspot/user/set',
                `=.id=${users[0]['.id'] || users[0].id}`, // ROS API usually uses .id
                `=comment=${payload.comment}`,
                `=profile=${payload.profile}`
            ]);
            return users[0];
        }

        const result = await client.write([
            '/ip/hotspot/user/add',
            `=name=${payload.name}`,
            `=password=${payload.password}`,
            `=profile=${payload.profile}`,
            `=comment=${payload.comment}`
        ]);
        console.log(`[RouterOS] User ${name} added successfully with marker: ${durationMarker}.`);
        return result;

    } catch (error) {
        console.error(`[RouterOS] Check/Add User Error (${name}):`, error.message);
        return null;
    } finally {
        // Always disconnect fresh connections
        if (client) {
            try { client.close(); } catch (_) {}
        }
    }
}

async function removeHotspotUser(name, router_id) {
    let client;
    try {
        client = await getRouterClient(router_id);

        const users = await client.write(['/ip/hotspot/user/print', `?name=${name}`]);

        if (users.length > 0) {
            await client.write(['/ip/hotspot/user/remove', `=.id=${users[0]['.id'] || users[0].id}`]);
            console.log(`[RouterOS] User ${name} removed.`);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`[RouterOS] Remove User Error (${name}):`, error.message);
        return false;
    } finally {
        if (client) {
            try { client.close(); } catch (_) {}
        }
    }
}

module.exports = {
    addHotspotUser,
    removeHotspotUser
};
