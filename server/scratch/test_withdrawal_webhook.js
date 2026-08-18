const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'f:/WIPAY/server/.env' });

async function verify() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
    });

    const testRef = `W-TEST-${Date.now()}`;
    const testAdminId = 54; // matching user's admin_id

    try {
        console.log(`[TEST] Inserting mock pending withdrawal for reference ${testRef}...`);
        await db.query(
            'INSERT INTO withdrawals (phone_number, amount, reference, description, admin_id, status) VALUES (?, ?, ?, ?, ?, "pending")',
            ['+256772000000', 5000.00, testRef, 'Test Payout Fail', testAdminId]
        );

        // Verify initial state
        const [rows] = await db.query('SELECT status FROM withdrawals WHERE reference = ?', [testRef]);
        console.log(`[TEST] Inserted withdrawal status:`, rows[0]?.status);

        console.log('[TEST] Sending simulated webhook POST request...');
        const response = await fetch('http://localhost:5002/api/webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: 'failed',
                reference: testRef
            })
        });

        const textResponse = await response.text();
        console.log(`[TEST] Webhook HTTP Response Status: ${response.status}, Body: ${textResponse}`);

        // Wait a moment for any async operations if needed
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify updated state
        const [updatedRows] = await db.query('SELECT status FROM withdrawals WHERE reference = ?', [testRef]);
        console.log(`[TEST] Updated withdrawal status in DB:`, updatedRows[0]?.status);

        if (updatedRows[0]?.status === 'failed') {
            console.log('✅ SUCCESS: Withdrawal status updated to "failed" automatically.');
        } else {
            console.error('❌ FAILURE: Withdrawal status not updated.');
        }

    } catch (err) {
        console.error('[TEST] Error during verification:', err);
    } finally {
        console.log('[TEST] Cleaning up mock data...');
        await db.query('DELETE FROM withdrawals WHERE reference = ?', [testRef]);
        console.log('[TEST] Cleanup complete.');
        await db.end();
    }
}

verify().catch(console.error);
