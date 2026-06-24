const db = require('../src/config/db');
const { exec } = require('child_process');
const path = require('path');

async function repairAll() {
    console.log("--- 🛠️  Mikhmon Batch Repair Started ---");
    try {
        const [admins] = await db.query('SELECT username FROM admins WHERE role = "admin"');
        console.log(`Found ${admins.length} tenants to check.`);

        for (const admin of admins) {
            const username = admin.username;
            const safeUsername = username.replace(/\s+/g, '_');
            const scriptPath = path.join(__dirname, 'create_mikhmon_client.sh');
            const command = `bash "${scriptPath}" "${safeUsername}"`;

            console.log(`Checking instance for: ${username} (${safeUsername})...`);

            await new Promise((resolve) => {
                exec(command, (err, stdout, stderr) => {
                    if (err) {
                        console.error(`❌ Failed for ${safeUsername}:`, err.message);
                    } else {
                        console.log(`✅ Success for ${safeUsername}: ${stdout.trim()}`);
                    }
                    resolve();
                });
            });
        }
        console.log("--- ✅ Batch Repair Complete ---");
        process.exit(0);
    } catch (err) {
        console.error("Critical Error during repair:", err);
        process.exit(1);
    }
}

repairAll();
