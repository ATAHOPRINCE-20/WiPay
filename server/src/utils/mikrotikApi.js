const routeros = require('node-routeros');
const RouterOSClient = routeros.RouterOSAPI || routeros.RouterOSClient || routeros;

/**
 * Creates and connects a RouterOSClient instance with timeout protection.
 */
async function createClient({ host, port = 8728, user = 'admin', password = '' }, timeoutMs = 4000) {
    const client = new RouterOSClient({
        host,
        port: parseInt(port, 10) || 8728,
        user: user || 'admin',
        password: password || '',
        timeout: timeoutMs,
        keepalive: false
    });

    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
            reject(new Error(`Connection to MikroTik ${host}:${port} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    try {
        await Promise.race([client.connect(), timeoutPromise]);
        clearTimeout(timeoutHandle);

        // Polyfill client.menu for node-routeros API compatibility
        if (!client.menu) {
            client.menu = function (path) {
                const cleanPath = path.replace(/\/print$/, '');
                return {
                    get: async () => {
                        const res = await client.write(`${cleanPath}/print`).catch(() => []);
                        return Array.isArray(res) ? res : [];
                    },
                    where: (params) => {
                        return {
                            get: async () => {
                                const cmd = [`${cleanPath}/print`];
                                for (const [k, v] of Object.entries(params)) {
                                    cmd.push(`?${k}=${v}`);
                                }
                                const res = await client.write(cmd).catch(() => []);
                                return Array.isArray(res) ? res : [];
                            },
                            remove: async () => {
                                const cmd = [`${cleanPath}/print`];
                                for (const [k, v] of Object.entries(params)) {
                                    cmd.push(`?${k}=${v}`);
                                }
                                const items = await client.write(cmd).catch(() => []);
                                if (Array.isArray(items)) {
                                    for (const item of items) {
                                        if (item['.id']) {
                                            await client.write([`${cleanPath}/remove`, `=.id=${item['.id']}`]).catch(() => {});
                                        }
                                    }
                                }
                            }
                        };
                    }
                };
            };
        }

        return client;
    } catch (err) {
        clearTimeout(timeoutHandle);
        try { client.close(); } catch (e) {}
        throw err;
    }
}

/**
 * Fetch live active hotspot users directly from MikroTik API
 */
async function fetchLiveActiveHotspotUsers(routerConfig) {
    let client;
    try {
        client = await createClient(routerConfig);
        const activeRows = await client.menu('/ip/hotspot/active').get();
        client.close();

        return activeRows.map(row => ({
            id: row['.id'],
            username: row['user'] || row['name'] || 'Unknown',
            framedipaddress: row['address'] || '',
            callingstationid: row['mac-address'] || '',
            uptime: row['uptime'] || '0s',
            session_time_left: row['session-time-left'] || row['limit-uptime'] || 'N/A',
            idle_time: row['idle-time'] || '0s',
            acctinputoctets: parseInt(row['bytes-in'], 10) || 0,
            acctoutputoctets: parseInt(row['bytes-out'], 10) || 0,
            login_by: row['login-by'] || 'http',
            source: 'mikrotik_api'
        }));
    } catch (err) {
        if (client) { try { client.close(); } catch (e) {} }
        console.warn(`[MikroTik API] Failed to fetch active users from ${routerConfig.host}:`, err.message);
        throw err;
    }
}

/**
 * Fetch connected network devices (DHCP leases & Hotspot hosts) from MikroTik API
 */
async function fetchConnectedDevices(routerConfig) {
    let client;
    try {
        client = await createClient(routerConfig);
        
        const [leases, hosts] = await Promise.all([
            client.menu('/ip/dhcp-server/lease').get().catch(() => []),
            client.menu('/ip/hotspot/host').get().catch(() => [])
        ]);
        client.close();

        const deviceMap = new Map();

        // 1. Process DHCP leases
        for (const l of leases) {
            const mac = (l['mac-address'] || '').toUpperCase();
            if (!mac) continue;
            deviceMap.set(mac, {
                id: l['.id'],
                mac: mac,
                ip: l['active-address'] || l['address'] || '',
                hostname: l['host-name'] || l['comment'] || 'Unknown Device',
                status: l['status'] || 'bound',
                dynamic: l['dynamic'] === 'true',
                source: 'dhcp',
                expires_after: l['expires-after'] || 'N/A'
            });
        }

        // 2. Augment / Add Hotspot hosts
        for (const h of hosts) {
            const mac = (h['mac-address'] || '').toUpperCase();
            if (!mac) continue;
            const existing = deviceMap.get(mac) || {};
            deviceMap.set(mac, {
                id: existing.id || h['.id'],
                mac: mac,
                ip: h['address'] || existing.ip || '',
                hostname: existing.hostname || h['comment'] || 'Hotspot Host',
                status: h['authorized'] === 'true' ? 'authorized' : (h['bypassed'] === 'true' ? 'bypassed' : 'unauthorized'),
                uptime: h['uptime'] || '0s',
                bytes_in: parseInt(h['bytes-in'], 10) || 0,
                bytes_out: parseInt(h['bytes-out'], 10) || 0,
                source: existing.source ? `${existing.source}+hotspot` : 'hotspot'
            });
        }

        return Array.from(deviceMap.values());
    } catch (err) {
        if (client) { try { client.close(); } catch (e) {} }
        console.warn(`[MikroTik API] Failed to fetch connected devices from ${routerConfig.host}:`, err.message);
        throw err;
    }
}

/**
 * Disconnect a user session directly on MikroTik via RouterOS API
 */
async function disconnectHotspotUser(routerConfig, usernameOrId) {
    let client;
    try {
        client = await createClient(routerConfig);
        const activeRows = await client.menu('/ip/hotspot/active').get().catch(() => []);
        
        const matchingActive = activeRows.filter(r => 
            r['.id'] === usernameOrId || 
            r['user'] === usernameOrId || 
            (r['user'] && r['user'].toLowerCase() === usernameOrId.toLowerCase()) ||
            r['address'] === usernameOrId ||
            r['mac-address'] === usernameOrId
        );

        let removedCount = 0;
        const targetMacs = new Set();

        for (const row of matchingActive) {
            if (row['mac-address']) targetMacs.add(row['mac-address']);
            await client.menu('/ip/hotspot/active').remove(row['.id']).catch(() => {});
            removedCount++;
        }

        // Also remove active cookies so MikroTik does NOT auto-relogin the user's MAC address
        const cookieRows = await client.menu('/ip/hotspot/cookie').get().catch(() => []);
        const matchingCookies = cookieRows.filter(c => 
            c['user'] === usernameOrId || 
            (c['user'] && c['user'].toLowerCase() === usernameOrId.toLowerCase()) ||
            (c['mac-address'] && targetMacs.has(c['mac-address'])) ||
            c['mac-address'] === usernameOrId
        );

        for (const cookie of matchingCookies) {
            await client.menu('/ip/hotspot/cookie').remove(cookie['.id']).catch(() => {});
        }

        client.close();
        console.log(`[MikroTik API] Removed ${removedCount} active session(s) & ${matchingCookies.length} cookie(s) for ${usernameOrId} on ${routerConfig.host}`);
        return removedCount > 0 || matchingCookies.length > 0;
    } catch (err) {
        if (client) { try { client.close(); } catch (e) {} }
        console.error(`[MikroTik API] Error disconnecting user ${usernameOrId} on ${routerConfig.host}:`, err.message);
        return false;
    }
}

/**
 * Fetch system logs directly from MikroTik API
 */
async function fetchRouterLogs(routerConfig, limit = 100) {
    let client;
    try {
        client = await createClient(routerConfig);
        const logs = await client.menu('/log').get().catch(() => []);
        client.close();

        // Return latest logs in reverse chronological order (newest first)
        const recentLogs = logs.slice(-limit).reverse();

        return recentLogs.map(l => ({
            id: l['.id'] || Math.random().toString(),
            time: l['time'] || '',
            topics: l['topics'] || '',
            message: l['message'] || '',
            buffer: l['buffer'] || ''
        }));
    } catch (err) {
        if (client) { try { client.close(); } catch (e) {} }
        console.warn(`[MikroTik API] Failed to fetch logs from ${routerConfig.host}:`, err.message);
        throw err;
    }
}

/**
 * Automatically log in or activate a user session directly on MikroTik via RouterOS API
 */
async function loginHotspotUserOnRouter(routerConfig, username, password, mac, ip) {
    let client;
    try {
        client = await createClient(routerConfig);

        // 1. Remove old active sessions or cookies for MAC/IP if present
        if (mac || ip) {
            const activeRows = await client.menu('/ip/hotspot/active').get().catch(() => []);
            for (const r of activeRows) {
                if ((mac && r['mac-address'] === mac) || (ip && r['address'] === ip)) {
                    await client.menu('/ip/hotspot/active').remove(r['.id']).catch(() => {});
                }
            }
            const cookieRows = await client.menu('/ip/hotspot/cookie').get().catch(() => []);
            for (const c of cookieRows) {
                if ((mac && c['mac-address'] === mac) || (ip && c['address'] === ip)) {
                    await client.menu('/ip/hotspot/cookie').remove(c['.id']).catch(() => {});
                }
            }
        }

        // 2. Add active session directly to MikroTik Hotspot via API if MAC and IP are available
        if (mac && ip) {
            await client.menu('/ip/hotspot/active').add({
                user: username,
                password: password || username,
                'mac-address': mac,
                address: ip
            }).catch(e => console.warn('[MikroTik API Login Warning]:', e.message));
        }

        client.close();
        console.log(`[MikroTik API] Activated user ${username} on ${routerConfig.host} (MAC: ${mac || 'N/A'}, IP: ${ip || 'N/A'})`);
        return true;
    } catch (err) {
        if (client) { try { client.close(); } catch (e) {} }
        console.warn(`[MikroTik API] Login Error on ${routerConfig.host}:`, err.message);
        return false;
    }
}

module.exports = {
    fetchLiveActiveHotspotUsers,
    fetchConnectedDevices,
    disconnectHotspotUser,
    fetchRouterLogs,
    loginHotspotUserOnRouter
};


