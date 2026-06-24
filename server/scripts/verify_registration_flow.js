const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

const API_URL = 'http://127.0.0.1:5020/api';
const DB_CONFIG = {
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'wipay',
    ssl: {
        rejectUnauthorized: false
    },
    getPublicKey: true
};

async function runTest() {
    let connection;
    try {
        console.log('--- STARTING REGISTRATION FLOW VERIFICATION ---');
        
        // Connect to DB
        connection = await mysql.createConnection(DB_CONFIG);
        console.log('✅ DB Connected');

        // 1. Submit Registration Request
        const testUser = {
            first_name: 'Test',
            last_name: 'User',
            email: `test${Date.now()}@example.com`,
            phone_number: '0770000000',
            whatsapp_number: '0770000000',
            hotspot_name: 'Test Hotspot',
            customer_care_contacts: '0700000000',
            device_type: 'Mikrotik',
            login_method: 'Voucher',
            address: 'Test Address',
            system_usage: 'Billing System'
        };

        console.log(`\n1. Submitting Registration for ${testUser.email}...`);
        await axios.post(`${API_URL}/register-request`, testUser);
        console.log('✅ Registration Submitted');

        // 2. Retrieve OTP from DB (Simulation of checking email)
        const [rows] = await connection.execute(
            'SELECT * FROM registration_requests WHERE email = ?',
            [testUser.email]
        );
        const request = rows[0];
        if (!request) throw new Error('Request not found in DB');
        console.log(`✅ Request found in DB. Status: ${request.status}`);
        console.log(`   OTP extracted: ${request.otp_code}`);

        if (request.status !== 'pending_otp') throw new Error('Status should be pending_otp');

        // 3. Verify OTP
        console.log('\n2. Verifying OTP...');
        await axios.post(`${API_URL}/verify-registration-otp`, {
            email: testUser.email,
            otp: request.otp_code
        });
        console.log('✅ OTP Verified');

        // 4. Check Status after OTP
        const [rows2] = await connection.execute(
            'SELECT * FROM registration_requests WHERE email = ?',
            [testUser.email]
        );
        const requestAfterOtp = rows2[0];
        console.log(`✅ Status after OTP: ${requestAfterOtp.status}`);
        if (requestAfterOtp.status !== 'pending_approval') throw new Error('Status should be pending_approval');

        // 5. Admin Approve (Mocking Super Admin Token - assuming we have one or defaulting)
        // For this test, we need a valid super admin token. 
        // If we can't easily get one, we might skip this or simulate a login first.
        // Let's try to login as 'admin' if it exists, or skip if we don't have creds.
        // As a fallback, we'll manually check the endpoint response basically.
        
        console.log('\n3. Simulating Admin Approval...');
        
        // Attempt login (assuming standard dev creds or just skipping if fail)
        // This part might fail if we don't know a valid admin. 
        // Let's just create a temporary super admin in DB for the test?
        
        const adminUser = 'test_super_admin_' + Date.now();
        const adminPass = 'password123';
        const bcrypt = require('bcryptjs');
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(adminPass, salt);
        
        await connection.execute(
            "INSERT INTO admins (username, password_hash, role, email) VALUES (?, ?, 'super_admin', 'admin@test.com')",
            [adminUser, hash]
        );
        
        // Login
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            username: adminUser,
            password: adminPass
        });
        const token = loginRes.headers['set-cookie'][0].split(';')[0]; // Extract cookie
        
        // Approve
        const approveRes = await axios.post(
            `${API_URL}/super/registration-requests/${request.id}/approve`, 
            {}, 
            { headers: { Cookie: token } }
        );
        console.log('✅ Approval Request Sent: ', approveRes.data.message);

        // 6. Final Status Check
        const [rows3] = await connection.execute(
            'SELECT * FROM registration_requests WHERE email = ?',
            [testUser.email]
        );
        if (rows3[0].status === 'approved') {
            console.log('✅ Final Status is APPROVED. Flow Complete!');
        } else {
            console.error('❌ Final status check failed. Status:', rows3[0].status);
        }

        // Cleanup
        await connection.execute('DELETE FROM registration_requests WHERE email = ?', [testUser.email]);
        await connection.execute('DELETE FROM admins WHERE username = ?', [adminUser]);

    } catch (err) {
        console.error('❌ TEST FAILED:', err.message);
        if (err.response) {
            console.error('   Response status:', err.response.status);
            console.error('   Response data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error('   No response received from server.');
        }
    } finally {
        if (connection) await connection.end();
    }
}

runTest();
