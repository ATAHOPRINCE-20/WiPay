const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const db = require('../config/db');

/**
 * Generate a new WireGuard public/private key pair.
 * Uses native 'wg' command line utility on the server,
 * falling back to Node's Crypto implementation in dev environments.
 */
function generateWgKeys() {
    try {
        const privateKey = execSync('wg genkey', { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
        const publicKey = execSync(`echo "${privateKey}" | wg pubkey`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
        if (privateKey && publicKey && privateKey.length === 44 && publicKey.length === 44) {
            return { privateKey, publicKey };
        }
    } catch (err) {}

    try {
        const privateKeyBuf = crypto.randomBytes(32);
        privateKeyBuf[0] &= 248;
        privateKeyBuf[31] &= 127;
        privateKeyBuf[31] |= 64;
        const privateKey = privateKeyBuf.toString('base64');

        const privKeyObj = crypto.createPrivateKey({
            key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), privateKeyBuf]),
            format: 'der',
            type: 'pkcs8'
        });
        const pubKeyObj = crypto.createPublicKey(privKeyObj);
        const pubDer = pubKeyObj.export({ format: 'der', type: 'spki' });
        const publicKey = pubDer.slice(pubDer.length - 32).toString('base64');

        return { privateKey, publicKey };
    } catch (cryptoErr) {
        console.error('[VPN] Key generation fallback error:', cryptoErr);
        const priv = crypto.randomBytes(32).toString('base64');
        return { privateKey: priv, publicKey: priv };
    }
}

/**
 * Allocates the next available IP address in the 10.66.66.0/24 subnet.
 * Starts from 10.66.66.2 (10.66.66.1 is reserved for the VPS).
 */
async function allocateVpnIp() {
    const [rows] = await db.query("SELECT ip_address FROM routers WHERE ip_address LIKE '10.66.66.%'");
    const takenIps = rows.map(r => r.ip_address);
    
    for (let i = 2; i <= 254; i++) {
        const ip = `10.66.66.${i}`;
        if (!takenIps.includes(ip)) {
            return ip;
        }
    }
    throw new Error('No available IPs in the 10.66.66.0/24 range');
}

/**
 * Rebuilds the wireguard wg0.conf configuration file on the VPS by querying the database 
 * for all active VPN peers, writes it, and runs `wg syncconf` to update the kernel routing table.
 */
async function rebuildWireGuardConfig() {
    try {
        // 1. Fetch all routers with public keys and IPs from DB
        const [routers] = await db.query(
            "SELECT name, ip_address, wg_public_key FROM routers WHERE wg_public_key IS NOT NULL AND ip_address IS NOT NULL"
        );

        // 2. Read the current wg0.conf to extract the [Interface] section
        let interfaceBlock = "";
        try {
            const fullConfig = execSync("sudo cat /etc/wireguard/wg0.conf", { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
            // Split by [Peer] and take the first part
            const peerIndex = fullConfig.indexOf("[Peer]");
            if (peerIndex !== -1) {
                interfaceBlock = fullConfig.substring(0, peerIndex).trim();
            } else {
                interfaceBlock = fullConfig.trim();
            }
        } catch (catErr) {
            console.warn("[VPN] Could not read existing wg0.conf, using fallback interface template.");
            
            let serverPrivKey = "SERVER_PRIVATE_KEY_PLACEHOLDER";
            try {
                serverPrivKey = execSync("sudo cat /etc/wireguard/server_private.key", { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
            } catch (kErr) {
                // If private key file not found, use a mock or environment variable
                serverPrivKey = process.env.WG_SERVER_PRIVATE_KEY || "SERVER_PRIVATE_KEY_PLACEHOLDER";
            }

            interfaceBlock = `[Interface]
Address = 10.66.66.1/24
ListenPort = 51820
PrivateKey = ${serverPrivKey}
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o $(ip route list default | awk '{print $5}') -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o $(ip route list default | awk '{print $5}') -j MASQUERADE`;
        }

        // 3. Rebuild the config content
        let configContent = interfaceBlock + "\n\n";
        for (const router of routers) {
            configContent += `# Peer for ${router.name}\n`;
            configContent += `[Peer]\n`;
            configContent += `PublicKey = ${router.wg_public_key}\n`;
            configContent += `AllowedIPs = ${router.ip_address}/32\n\n`;
        }

        // 4. Write to a temporary file
        const tmpPath = "/tmp/wg0.conf.tmp";
        fs.writeFileSync(tmpPath, configContent);

        // 5. Copy to wireguard directory and sync
        execSync(`sudo cp ${tmpPath} /etc/wireguard/wg0.conf`);
        execSync(`sudo wg-quick strip wg0 > /tmp/wg0.stripped && sudo wg syncconf wg0 /tmp/wg0.stripped && rm -f /tmp/wg0.stripped`, { shell: '/bin/bash' });
        
        console.log("[VPN] WireGuard configuration successfully rebuilt and synced.");
        await syncIptablesPortForwarding().catch(() => {});
        return true;
    } catch (err) {
        console.error("[VPN] Rebuild and Sync Config Error:", err.message);
        // During local development, copy operations might fail. Allow grace.
        return false;
    }
}

/**
 * Automatically syncs iptables NAT port-forwarding rules for WinBox and WebFig 
 * for all connected routers in the database.
 */
async function syncIptablesPortForwarding() {
    try {
        const [routers] = await db.query(
            "SELECT id, ip_address FROM routers WHERE ip_address LIKE '10.66.66.%'"
        );

        let commands = [
            "sudo sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1",
            "sudo iptables -t nat -F PREROUTING 2>/dev/null || true"
        ];

        for (const r of routers) {
            const winboxPort = 8290 + (r.id % 100 || 1);
            const webfigPort = 8080 + (r.id % 100 || 1);

            commands.push(`sudo iptables -t nat -A PREROUTING -p tcp --dport ${winboxPort} -j DNAT --to-destination ${r.ip_address}:8291`);
            commands.push(`sudo iptables -t nat -A PREROUTING -p tcp --dport ${webfigPort} -j DNAT --to-destination ${r.ip_address}:80`);

            if (r.id === 22 || r.ip_address === '10.66.66.2') {
                commands.push(`sudo iptables -t nat -A PREROUTING -p tcp --dport 8291 -j DNAT --to-destination ${r.ip_address}:8291`);
            }
        }

        commands.push("sudo iptables -t nat -A POSTROUTING -d 10.66.66.0/24 -j MASQUERADE 2>/dev/null || true");
        commands.push("sudo netfilter-persistent save >/dev/null 2>&1 || true");

        const fullCmd = commands.join(" && ");
        execSync(fullCmd, { shell: '/bin/bash', stdio: ['pipe', 'pipe', 'ignore'] });
        console.log("[VPN] Auto iptables remote access port-forwarding synced successfully.");
        return true;
    } catch (err) {
        console.warn("[VPN] iptables sync warning (normal in Windows dev):", err.message);
        return false;
    }
}

/**
 * Reads WireGuard peer statuses from kernel via `wg show wg0 dump`.
 * Returns Map of { publicKey => unixTimestampOfLastHandshake }
 */
function getWireGuardPeerStatus() {
    const peerStatus = new Map();
    try {
        const output = execSync('sudo wg show wg0 dump', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
        const lines = output.trim().split('\n');
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 5) {
                const pubKey = parts[0];
                const lastHandshake = parseInt(parts[4], 10);
                if (pubKey && !isNaN(lastHandshake)) {
                    peerStatus.set(pubKey, lastHandshake);
                }
            }
        }
    } catch (err) {
        // Fallback for dev environments without WireGuard binary
    }
    return peerStatus;
}

module.exports = {
    generateWgKeys,
    allocateVpnIp,
    rebuildWireGuardConfig,
    syncIptablesPortForwarding,
    getWireGuardPeerStatus
};
