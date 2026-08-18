#!/usr/bin/env node

/**
 * RADIUS Setup Verification Script
 * Checks if FreeRADIUS database tables exist and are properly configured
 * 
 * Usage: node server/scripts/verify_radius_setup.js
 */

const db = require('../src/config/db');
const { checkRadiusTablesExist, syncVoucherToRadius } = require('../src/utils/radius');

async function verify() {
    console.log('🔍 Verifying FreeRADIUS Setup...\n');

    try {
        // 1. Check if tables exist
        console.log('1️⃣  Checking RADIUS database tables...');
        const tablesExist = await checkRadiusTablesExist();

        if (!tablesExist) {
            console.error('❌ RADIUS tables not found. Run the setup SQL from FREERADIUS_MIKROTIK_SETUP.md\n');
            process.exit(1);
        }
        console.log('✅ All RADIUS tables found!\n');

        // 2. Check database connection
        console.log('2️⃣  Checking database connection...');
        const [result] = await db.query('SELECT 1 as status');
        if (result[0].status === 1) {
            console.log('✅ Database connection OK\n');
        }

        // 3. Test sync with a demo voucher
        console.log('3️⃣  Testing RADIUS sync...');
        const testCode = 'TEST-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        
        // First get a package ID
        const [packages] = await db.query('SELECT id FROM packages LIMIT 1');
        if (packages.length === 0) {
            console.warn('⚠️  No packages found. Create a package first to test sync.\n');
            console.log('Setup Status: ✅ Database is ready, but no packages exist yet.\n');
            process.exit(0);
        }

        const packageId = packages[0].id;
        const syncResult = await syncVoucherToRadius(testCode, packageId);

        if (syncResult) {
            console.log(`✅ RADIUS sync test successful (test code: ${testCode})\n`);

            // 4. Verify entries in database
            console.log('4️⃣  Verifying RADIUS entries...');
            const [radcheck] = await db.query('SELECT * FROM radcheck WHERE username = ?', [testCode]);
            const [radreply] = await db.query('SELECT * FROM radreply WHERE username = ?', [testCode]);

            if (radcheck.length > 0) {
                console.log('✅ Password entry found in radcheck');
            }
            if (radreply.length > 0) {
                console.log(`✅ Reply entries found in radreply (${radreply.length} entries)`);
            }

            console.log('\n=== RADIUS Setup is Complete! ===\n');
            console.log('Next Steps:');
            console.log('1. Install FreeRADIUS on your VPS (see FREERADIUS_MIKROTIK_SETUP.md)');
            console.log('2. Configure Mikrotik routers as NAS clients in FreeRADIUS');
            console.log('3. Configure Mikrotik Hotspot to use RADIUS authentication');
            console.log('4. Create vouchers through the dashboard - they will automatically sync to RADIUS\n');

        } else {
            console.error('❌ RADIUS sync test failed\n');
            process.exit(1);
        }

    } catch (err) {
        console.error('❌ Verification Error:', err.message);
        console.error('\nTroubleshooting:');
        console.error('- Ensure MySQL is running');
        console.error('- Check .env file for DB_HOST, DB_USER, DB_PASS, DB_NAME');
        console.error('- Run: node server/scripts/setup_multitenancy.js (if not done)');
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

verify();
