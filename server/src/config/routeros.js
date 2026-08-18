const { RouterOSClient } = require('node-routeros');
require('dotenv').config();

const config = {
    host: process.env.ROUTEROS_HOST || '192.168.88.1',
    port: process.env.ROUTEROS_PORT || 8728,
    user: process.env.ROUTEROS_USER || 'admin',
    password: process.env.ROUTEROS_PASSWORD || '',
    keepalive: true,
    reconnect: true
};

let client = null;

async function getClient() {
    if (client && client.isConnected()) {
        return client;
    }

    client = new RouterOSClient(config);

    try {
        await client.connect();
        console.log('[RouterOS] Connected to', config.host);
        return client;
    } catch (error) {
        console.error('[RouterOS] Connection failed:', error);
        throw error;
    }
}

module.exports = { getClient };
