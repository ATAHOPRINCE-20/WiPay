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

    const testRefFailed = `W-TEST-POLL-F-${Date.now()}`;
    const testRefSuccess = `W-TEST-POLL-S-${Date.now()}`;
    const testAdminId = 54;

    try {
        console.log('[TEST] Inserting mock failed and success withdrawals...');
        await db.query(
            'INSERT INTO withdrawals (phone_number, amount, reference, description, admin_id, status) VALUES (?, ?, ?, ?, ?, "failed")',
            ['+256772000000', 3000.00, testRefFailed, 'Test Failed Poll', testAdminId]
        );
        await db.query(
            'INSERT INTO withdrawals (phone_number, amount, reference, description, admin_id, status) VALUES (?, ?, ?, ?, ?, "success")',
            ['+256772000000', 4000.00, testRefSuccess, 'Test Success Poll', testAdminId]
        );

        console.log('[TEST] Polling for failed withdrawal status...');
        const responseFailed = await fetch('http://localhost:5002/api/check-payment-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transaction_ref: testRefFailed
            })
        });
        const dataFailed = await responseFailed.json();
        console.log(`[TEST] Polling Failed Response:`, dataFailed);

        console.log('[TEST] Polling for success withdrawal status...');
        const responseSuccess = await fetch('http://localhost:5002/api/check-payment-status', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                transaction_ref: testRefSuccess
            })
        });
        const dataSuccess = await responseSuccess.json();
        console.log(`[TEST] Polling Success Response:`, dataSuccess);

        let success = true;
        if (dataFailed.status === 'FAILED') {
            console.log('✅ SUCCESS: Polling failed status check returned FAILED.');
        } else {
            console.error('❌ FAILURE: Polling failed status check returned:', dataFailed.status);
            success = false;
        }

        if (dataSuccess.status === 'SUCCESS') {
            console.log('✅ SUCCESS: Polling success status check returned SUCCESS.');
        } else {
            console.error('❌ FAILURE: Polling success status check returned:', dataSuccess.status);
            success = false;
        }

        if (success) {
            console.log('✅ ALL POLLING TESTS PASSED.');
        }

    } catch (err) {
        console.error('[TEST] Error during polling verification:', err);
    } finally {
        console.log('[TEST] Cleaning up mock data...');
        await db.query('DELETE FROM withdrawals WHERE reference IN (?, ?)', [testRefFailed, testRefSuccess]);
        console.log('[TEST] Cleanup complete.');
        await db.end();
    }
}

verify().catch(console.error);
