const { RouterOSAPI } = require('node-routeros');
require('dotenv').config();

const defaultConfig = {
    host: process.env.ROUTEROS_HOST || '192.168.88.1',
    port: parseInt(process.env.ROUTEROS_PORT) || 8728,
    user: process.env.ROUTEROS_USER || 'admin',
    password: process.env.ROUTEROS_PASSWORD || '',
    // Disable keepalive/reconnect to avoid old MD5 auth issues with ROS7
    keepalive: false,
    reconnect: false,
    // RouterOS 7 uses plaintext login over API (not MD5 challenge)
    // If your router has API-SSL enabled on port 8729, set tls: true and port: 8729
    timeout: 10
};

// No persistent connections — create fresh per-use connections for ROS7 compatibility
async function createAndConnect(config) {
    const client = new RouterOSAPI({
        host: config.host,
        port: config.port || 8728,
        user: config.user,
        password: config.password,
        keepalive: false,
        reconnect: false,
        timeout: config.timeout || 10
    });
    await client.connect();
    return client;
}

async function getClient() {
    try {
        const client = await createAndConnect(defaultConfig);
        console.log('[RouterOS] Connected to default router:', defaultConfig.host);
        return client;
    } catch (error) {
        console.error('[RouterOS] Default connection failed:', error.message);
        throw error;
    }
}

/**
 * Get a fresh connection for a specific router configuration
 * Fresh connections per call — avoids ROS7 keepalive re-auth issues
 * @param {Object} routerParams 
 */
async function getDynamicClient(routerParams) {
    const config = {
        host: routerParams.host,
        port: routerParams.port || defaultConfig.port,
        user: routerParams.user || defaultConfig.user,
        password: routerParams.password || defaultConfig.password,
        timeout: 10
    };

    try {
        const client = await createAndConnect(config);
        console.log('[RouterOS] Connected to dynamic router:', config.host);
        return client;
    } catch (error) {
        console.error(`[RouterOS] Dynamic connection failed (${config.host}):`, error.message);
        throw error;
    }
}

module.exports = { getClient, getDynamicClient };
