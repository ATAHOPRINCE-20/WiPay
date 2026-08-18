const { getClient } = require('../config/routeros');

/**
 * Add a user to the Hotspot
 * @param {Object} params
 * @param {string} params.name - Username (usually voucher code)
 * @param {string} params.password - Password
 * @param {string} [params.profile='default'] - Hotspot user profile
 * @param {string} [params.limitUptime] - Uptime limit (e.g., '1h', '30d')
 */
async function addHotspotUser({ name, password, profile = 'default', limitUptime }) {
    let client;
    try {
        client = await getClient();

        // Check if user exists
        const users = await client.menu('/ip/hotspot/user').where({ name }).get();
        if (users.length > 0) {
            console.log(`[RouterOS] User ${name} already exists.`);
            return users[0];
        }

        const payload = {
            name,
            password,
            profile
        };

        if (limitUptime) {
            payload['limit-uptime'] = limitUptime;
        }

        const result = await client.menu('/ip/hotspot/user').add(payload);
        console.log(`[RouterOS] User ${name} added successfully.`);
        return result;

    } catch (error) {
        console.error(`[RouterOS] Check/Add User Error (${name}):`, error.message);
        // We do not throw here to avoid breaking the payment flow, 
        // but in a strict system you might want to retry or alert.
        return null;
    }
}

async function removeHotspotUser(name) {
    let client;
    try {
        client = await getClient();
        const users = await client.menu('/ip/hotspot/user').where({ name }).get();

        if (users.length > 0) {
            await client.menu('/ip/hotspot/user').remove(users[0].id);
            console.log(`[RouterOS] User ${name} removed.`);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`[RouterOS] Remove User Error (${name}):`, error.message);
        return false;
    }
}

module.exports = {
    addHotspotUser,
    removeHotspotUser
};
