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
        return { privateKey, publicKey };
    } catch (err) {
        console.warn('[VPN] "wg" command failed, using Node.js crypto fallback (useful for local dev).');
        try {
            const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519', {
                publicKeyEncoding: { type: 'spki', format: 'der' },
                privateKeyEncoding: { type: 'pkcs8', format: 'der' }
            });
            const rawPublic = publicKey.slice(12).toString('base64');
            const rawPrivate = privateKey.slice(16).toString('base64');
            return { privateKey: rawPrivate, publicKey: rawPublic };
        } catch (cryptoErr) {
            // Final fallback
            const priv = crypto.randomBytes(32).toString('base64');
            const pub = crypto.randomBytes(32).toString('base64');
            return { privateKey: priv, publicKey: pub };
        }
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
        execSync(`sudo wg syncconf wg0 /etc/wireguard/wg0.conf`);
        
        console.log("[VPN] WireGuard configuration successfully rebuilt and synced.");
        return true;
    } catch (err) {
        console.error("[VPN] Rebuild and Sync Config Error:", err.message);
        // During local development, copy operations might fail. Allow grace.
        return false;
    }
}

module.exports = {
    generateWgKeys,
    allocateVpnIp,
    rebuildWireGuardConfig
};
