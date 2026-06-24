const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const { sendSMS } = require('../utils/sms');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

// Configure Multer for temp uploads
const upload = multer({ dest: 'uploads/' });

// Middleware applied to all routes in this file
router.use('/admin', authenticateToken);

// --- Categories ---
router.post('/admin/categories', async (req, res) => {
    const { name, router_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const [result] = await db.query('INSERT INTO categories (name, admin_id, router_id) VALUES (?, ?, ?)', [name, req.user.id, router_id || null]);
        req.io.emit('data_update', { type: 'categories' });
        res.json({ id: result.insertId, name, router_id, message: 'Category created' });
    } catch (err) {
        console.error('Create Category Error:', err);
        res.status(500).json({ error: 'Failed to create category' });
    }
});

router.get('/admin/categories', async (req, res) => {
    try {
        const router_id = req.query.router_id;
        let query = 'SELECT * FROM categories WHERE admin_id = ?';
        let params = [req.user.id];

        if (router_id && router_id !== 'all') {
            query += ' AND router_id = ?'; // STRICT: Show ONLY specific
            params.push(router_id);
        } else {
            // For "All", maybe show everything? Or only Globals?
            // Let's show everything for now.
        }

        query += ' ORDER BY created_at DESC';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});



router.put('/admin/categories/:id', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const [result] = await db.query('UPDATE categories SET name = ? WHERE id = ? AND admin_id = ?', [name, req.params.id, req.user.id]);
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Category not found' });

        req.io.emit('data_update', { type: 'categories' });
        req.io.emit('data_update', { type: 'packages' }); // Cascaded UI update
        res.json({ message: 'Category updated successfully' });
    } catch (err) {
        console.error('Update Category Error:', err);
        res.status(500).json({ error: 'Failed to update category' });
    }
});

router.delete('/admin/categories/:id', async (req, res) => {
    const categoryId = req.params.id;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Verify Category Ownership
        const [cat] = await connection.query('SELECT id FROM categories WHERE id = ? AND admin_id = ?', [categoryId, req.user.id]);
        if (cat.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Category not found' });
        }

        // 2. Get Package IDs linked to this category
        const [packages] = await connection.query('SELECT id FROM packages WHERE category_id = ?', [categoryId]);
        const packageIds = packages.map(p => p.id);

        if (packageIds.length > 0) {
            // 3. Delete Vouchers linked to these packages
            const placeholders = packageIds.map(() => '?').join(',');
            await connection.query(`DELETE FROM vouchers WHERE package_id IN (${placeholders})`, packageIds);

            // 4. Delete Packages
            await connection.query('DELETE FROM packages WHERE category_id = ?', [categoryId]);
        }

        // 5. Delete Category
        await connection.query('DELETE FROM categories WHERE id = ?', [categoryId]);

        await connection.commit();
        req.io.emit('data_update', { type: 'categories' });
        req.io.emit('data_update', { type: 'packages' }); // Cascaded
        req.io.emit('data_update', { type: 'vouchers' }); // Cascaded
        res.json({ message: 'Category and all related data deleted successfully' });

    } catch (err) {
        await connection.rollback();
        console.error('Delete Category Error:', err);
        res.status(500).json({ error: 'Failed to delete category' });
    } finally {
        connection.release();
    }
});


// --- Routers ---
router.post('/admin/routers', async (req, res) => {
    const { name, mikhmon_url } = req.body;
    if (!name || !mikhmon_url) return res.status(400).json({ error: 'Name and URL are required' });

    try {
        const [result] = await db.query('INSERT INTO routers (name, mikhmon_url, admin_id) VALUES (?, ?, ?)', [name, mikhmon_url, req.user.id]);
        req.io.emit('data_update', { type: 'routers' });
        res.json({ id: result.insertId, name, message: 'Router added' });
    } catch (err) {
        console.error('Create Router Error:', err);
        res.status(500).json({ error: 'Failed to add router' });
    }
});

router.get('/admin/routers', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM routers WHERE admin_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch routers' });
    }
});

router.delete('/admin/routers/:id', async (req, res) => {
    try {
        await db.query('DELETE FROM routers WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        req.io.emit('data_update', { type: 'routers' });
        res.json({ message: 'Router deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete router' });
    }
});

// --- Packages ---
router.post('/admin/packages', async (req, res) => {
    const { name, price, validity_hours, category_id, data_limit_mb, router_id } = req.body;

    if (!name || !price || !category_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        await db.query(`
            INSERT INTO packages (category_id, name, price, validity_hours, data_limit_mb, created_at, admin_id, router_id)
            VALUES (?, ?, ?, ?, ?, NOW(), ?, ?)
        `, [category_id, name, price, validity_hours || 0, data_limit_mb || 0, req.user.id, router_id || null]);
        req.io.emit('data_update', { type: 'packages' });
        res.json({ message: 'Package created successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create package' });
    }
});

router.patch('/admin/packages/:id/toggle', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT is_active FROM packages WHERE id = ? AND admin_id = ?', [req.params.id, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Package not found' });

        const currentState = rows[0].is_active;
        const newState = !currentState;

        await db.query('UPDATE packages SET is_active = ? WHERE id = ?', [newState, req.params.id]);
        req.io.emit('data_update', { type: 'packages' }); // Notify all clients
        res.json({ message: 'Package status updated', is_active: newState });
    } catch (err) {
        console.error('Toggle Package Error:', err);
        res.status(500).json({ error: 'Failed to update package status' });
    }
});

router.get('/admin/packages', async (req, res) => {
    try {
        const router_id = req.query.router_id;
        let query = `
            SELECT p.id, p.name, p.price, p.validity_hours, p.data_limit_mb, p.is_active, p.created_at, c.name as category_name, p.router_id 
            FROM packages p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.admin_id = ?
        `;
        let params = [req.user.id];

        if (router_id && router_id !== 'all') {
            query += ' AND p.router_id = ?';
            params.push(router_id);
        }

        query += ' ORDER BY p.created_at DESC';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Fetch Packages Error:', err);
        res.status(500).json({ error: 'Failed to fetch packages' });
    }
});



router.put('/admin/packages/:id', async (req, res) => {
    const { name, price, validity_hours, data_limit_mb, category_id } = req.body;

    if (!name || !price || !category_id) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const [result] = await db.query(`
            UPDATE packages 
            SET name = ?, price = ?, validity_hours = ?, data_limit_mb = ?, category_id = ?
            WHERE id = ? AND admin_id = ?
        `, [name, price, validity_hours || 0, data_limit_mb || 0, category_id, req.params.id, req.user.id]);

        if (result.affectedRows === 0) return res.status(404).json({ error: 'Package not found' });

        req.io.emit('data_update', { type: 'packages' });
        res.json({ message: 'Package updated successfully' });
    } catch (err) {
        console.error('Update Package Error:', err);
        res.status(500).json({ error: 'Failed to update package' });
    }
});

// --- Vouchers ---
router.post('/admin/vouchers/import', upload.single('file'), async (req, res) => {
    const { package_id, router_id } = req.body; // router_id might come from frontend if package is global

    if (!req.file || !package_id) {
        return res.status(400).json({ error: 'File and package_id are required' });
    }

    const results = [];
    const BATCH_SIZE = 500;
    let totalInserted = 0;

    // Check if package has a router_id
    // If YES, vouchers inherit it. If NO, vouchers might use the passed router_id (if we allow Global Packages to have Specific Vouchers? Complicated. 
    // Simplified Logic: Vouchers inherit Package's router_id. If package is Global, Vouchers are Global. 
    // OR: Vouchers created under specific router view get that router_id.
    // Let's lookup package first.
    let packageRouterId = null;
    try {
        const [pkgRows] = await db.query('SELECT router_id FROM packages WHERE id = ?', [package_id]);
        if (pkgRows.length > 0) packageRouterId = pkgRows[0].router_id;
    } catch (e) { console.error("Error looking up package router:", e); }

    // Final Router ID for vouchers: Package's ID takes precedence (strict), or fallback to passed ID?
    // If Package is Specific, vouchers MUST be specific to that router.
    // If Package is Global (NULL), vouchers CAN be specific (if sold from specific router view) or Global.
    // Use packageRouterId if exists, otherwise use req.body.router_id
    const finalRouterId = packageRouterId || router_id || null;

    const processBatch = async (batch) => {
        if (batch.length === 0) return;

        // Adaptive placeholder: code, comment, package_ref
        const strictValues = [];
        batch.forEach(row => {
            const code = row.code || (Object.values(row)[0]); // First column as code
            const comment = row.comment || null;
            const pkgRef = row.package_ref || null;
            strictValues.push(package_id, code, comment, pkgRef, req.user.id, finalRouterId);
        });

        // We added router_id to the insert columns
        const strictPlaceholder = batch.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');

        const [result] = await db.query(`INSERT IGNORE INTO vouchers (package_id, code, comment, package_ref, admin_id, router_id) VALUES ${strictPlaceholder}`, strictValues);
        totalInserted += result.affectedRows;
    };

    try {
        const stream = fs.createReadStream(req.file.path)
            .pipe(csv())
            .on('data', (data) => {
                results.push(data);
                if (results.length >= BATCH_SIZE) {
                    stream.pause(); // Pause reading while writing to DB
                    const batch = results.splice(0, BATCH_SIZE);
                    processBatch(batch)
                        .then(() => stream.resume())
                        .catch(err => {
                            console.error('Batch Insert Error:', err);
                            stream.destroy(err);
                        });
                }
            })
            .on('end', async () => {
                // Process remaining
                if (results.length > 0) {
                    await processBatch(results);
                }
                // Cleanup file
                fs.unlink(req.file.path, (err) => { if (err) console.error('Cleanup Error:', err); });
                req.io.emit('data_update', { type: 'vouchers' });
                res.json({ message: `Import complete. Processed ${totalInserted} vouchers.` });
            })
            .on('error', (err) => {
                console.error('CSV Stream Error:', err);
                res.status(500).json({ error: 'Failed to process CSV file' });
            });

    } catch (err) {
        console.error('Import Setup Error:', err);
        res.status(500).json({ error: 'Server error during import setup' });
    }
});

function generateVoucherCode(length, prefix) {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Exclude visually similar chars (0, O, 1, I)
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return (prefix || '') + code;
}

router.post('/admin/vouchers/generate', async (req, res) => {
    const { package_id, quantity, prefix, code_length, is_giveaway, batch_ref } = req.body;
    
    if (!package_id || !quantity || quantity <= 0 || quantity > 500) {
        return res.status(400).json({ error: 'Valid package ID and quantity (max 500) are required' });
    }

    try {
        const [pkg] = await db.query('SELECT id, router_id FROM packages WHERE id = ? AND admin_id = ?', [package_id, req.user.id]);
        if (pkg.length === 0) return res.status(404).json({ error: 'Package not found' });

        const router_id = pkg[0].router_id;
        const insertValues = [];
        const generateLength = parseInt(code_length) || 8;

        for (let i = 0; i < quantity; i++) {
            const code = generateVoucherCode(generateLength, prefix);
            insertValues.push([code, package_id, req.user.id, router_id, is_giveaway ? 1 : 0, batch_ref || null]);
        }

        // Batch insert
        await db.query(
            'INSERT INTO vouchers (code, package_id, admin_id, router_id, is_giveaway, package_ref) VALUES ?',
            [insertValues]
        );

        req.io.emit('data_update', { type: 'vouchers' });
        res.json({ message: `Successfully generated ${quantity} vouchers.` });
    } catch (err) {
        console.error('Generate Vouchers Error:', err);
        res.status(500).json({ error: 'Failed to generate vouchers' });
    }
});

router.get('/admin/vouchers', async (req, res) => {
    try {
        const router_id = req.query.router_id;

        let query = `
            SELECT v.id, v.code, v.comment, v.package_ref, v.is_used, p.name as package_name, v.created_at, v.router_id
            FROM vouchers v
            JOIN packages p ON v.package_id = p.id
            WHERE v.is_used = FALSE AND v.admin_id = ?
        `;
        let params = [req.user.id];

        if (router_id && router_id !== 'all') {
            query += ' AND v.router_id = ?';
            params.push(router_id);
        }

        query += ' ORDER BY v.created_at DESC LIMIT 100';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Fetch Vouchers Error:', err);
        res.status(500).json({ error: 'Failed to fetch vouchers.' });
    }
});


const RELWORX_API_URL = 'https://payments.relworx.com/api/mobile-money/request-payment';
const RELWORX_API_KEY = process.env.RELWORX_API_KEY;
const RELWORX_ACCOUNT_NO = process.env.RELWORX_ACCOUNT_NO;

router.get('/admin/sms-balance', async (req, res) => {
    try {
        // Calculate balance: Sum of SUCCESS deposits - Sum of usage
        // Note: Usage rows (type='usage') are naturally negative in amount, so straight SUM works 
        // IF we filter properly. Usage doesn't have a status usually, or defaults to success.
        // Let's assume usage is always valid. Deposits must be 'success'.
        const [rows] = await db.query(`
            SELECT SUM(amount) as balance 
            FROM sms_fees 
            WHERE admin_id = ? 
            AND (status = 'success' OR status IS NULL)
            AND type != 'subscription'
        `, [req.user.id]);

        const balance = rows[0].balance || 0;
        res.json({ balance: Math.max(0, Number(balance)) });
    } catch (err) {
        console.error('Fetch SMS Balance Error:', err);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

router.post('/admin/buy-sms', async (req, res) => {
    const { amount, phone_number } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount is required' });
    if (!phone_number) return res.status(400).json({ error: 'Phone number is required' });

    try {
        // Format Phone (Robust)
        let formattedPhone = phone_number.replace(/\s+/g, ''); // Remove spaces
        if (formattedPhone.startsWith('256')) formattedPhone = '+' + formattedPhone;
        else if (formattedPhone.startsWith('0')) formattedPhone = '+256' + formattedPhone.slice(1);
        else if (!formattedPhone.startsWith('+')) formattedPhone = '+256' + formattedPhone; // Assume local if completely raw

        // Limit Check (Uganda numbers are usually 13 chars: +256 7XX XXX XXX)
        if (formattedPhone.length < 10) return res.status(400).json({ error: 'Invalid phone number length' });

        const reference = `SMS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 1. Insert Pending Record
        await db.query('INSERT INTO sms_fees (admin_id, amount, type, description, status, reference) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, amount, 'deposit', `Pending Top up via ${formattedPhone}`, 'pending', reference]);

        // 2. Call Relworx
        const response = await fetch(RELWORX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.relworx.v2',
                'Authorization': `Bearer ${RELWORX_API_KEY}`
            },
            body: JSON.stringify({
                account_no: RELWORX_ACCOUNT_NO,
                reference: reference,
                msisdn: formattedPhone,
                currency: 'UGX',
                amount: Number(amount),
                description: `SMS Topup`
            })
        });

        const paymentData = await response.json();

        if (response.ok) {
            res.json({
                message: 'Payment request initiated. Please check your phone.',
                status: 'pending',
                reference: reference
            });
        } else {
            console.error(`[SMS-TOPUP-ERROR] Gateway Failed:`, paymentData);
            await db.query('UPDATE sms_fees SET status = "failed" WHERE reference = ?', [reference]);

            // Pass the exact message from Relworx to the frontend
            const errorMsg = paymentData.message || paymentData.description || 'Unknown gateway error';
            res.status(400).json({ error: errorMsg, details: paymentData });
        }
    } catch (err) {
        console.error('Buy SMS Error:', err);
        res.status(500).json({ error: 'Failed to process purchase: ' + err.message });
    }
});

router.get('/admin/sms-status/:reference', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT status, amount FROM sms_fees WHERE reference = ? AND admin_id = ?', [req.params.reference, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });

        const localStatus = rows[0].status;

        // If success or failed, return immediately
        if (localStatus === 'success' || localStatus === 'failed') {
            return res.json({ status: localStatus });
        }

        // --- Active Backup Poll (For Localhost/Backup) ---
        const checkUrl = `https://payments.relworx.com/api/mobile-money/check-request-status?account_no=${RELWORX_ACCOUNT_NO}&reference=${req.params.reference}&internal_reference=${req.params.reference}`;

        try {
            const gwRes = await fetch(checkUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.relworx.v2',
                    'Authorization': `Bearer ${RELWORX_API_KEY}`
                }
            });

            if (!gwRes.ok) return res.json({ status: 'pending' }); // Keep waiting

            const gwData = await gwRes.json();
            const gwStatus = (gwData.status || '').toUpperCase();
            const itemStatus = (gwData.item_status || '').toUpperCase();

            // Check Success
            if (gwStatus === 'SUCCESS' || itemStatus === 'SUCCESS') {
                await db.query('UPDATE sms_fees SET status = "success" WHERE reference = ?', [req.params.reference]);
                return res.json({ status: 'success' });
            }
            // Check Failure
            else if (gwStatus === 'FAILED' || itemStatus === 'FAILED') {
                await db.query('UPDATE sms_fees SET status = "failed" WHERE reference = ?', [req.params.reference]);
                return res.json({ status: 'failed' });
            }

            return res.json({ status: 'pending' });

        } catch (fetchErr) {
            console.error('[SMS-POLL] Fetch Error:', fetchErr);
            return res.json({ status: 'pending' });
        }

    } catch (err) {
        console.error('Check SMS Status Error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

router.post('/admin/sell-voucher', async (req, res) => {
    const { package_id, phone_number } = req.body;
    const SMS_COST = 35;

    if (!package_id || !phone_number) {
        return res.status(400).json({ error: 'Package and Phone number required' });
    }

    const connection = await db.getConnection(); // Use transaction

    try {
        await connection.beginTransaction();

        // 0. Check SMS Balance
        const [balRows] = await connection.query('SELECT SUM(amount) as balance FROM sms_fees WHERE admin_id = ?', [req.user.id]);
        const balance = Number(balRows[0].balance || 0);

        if (balance < SMS_COST) {
            await connection.rollback();
            return res.status(400).json({ error: `Insufficient SMS balance. Cost: ${SMS_COST}, Balance: ${balance}` });
        }

        // 1. Get Package details
        const [packages] = await connection.query('SELECT * FROM packages WHERE id = ?', [package_id]);
        if (packages.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Package not found' });
        }
        const pkg = packages[0];

        // 2. Get Available Voucher
        const [vouchers] = await connection.query('SELECT * FROM vouchers WHERE package_id = ? AND is_used = FALSE AND admin_id = ? LIMIT 1 FOR UPDATE', [package_id, req.user.id]);
        if (vouchers.length === 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'No vouchers available for this package' });
        }
        const voucher = vouchers[0];

        // 3. Mark Voucher Used
        await connection.query('UPDATE vouchers SET is_used = 1, used_by = ?, used_at = NOW() WHERE id = ?', [phone_number, voucher.id]);

        // 4. Deduct SMS Cost
        await connection.query('INSERT INTO sms_fees (admin_id, amount, type, description) VALUES (?, ?, ?, ?)',
            [req.user.id, -SMS_COST, 'usage', `Voucher Sale: ${voucher.code}`]);

        // 5. Send SMS (Mock or Real)
        const message = `Code: ${voucher.code}. Package: ${pkg.name}.`;
        await sendSMS(phone_number, message);

        // 6. Record SMS Log (if table exists, otherwise skip or ensure it does)
        // Assuming sms_logs table exists from previous context or generic logging
        try {
            await connection.query('INSERT INTO sms_logs (recipient, message, status, admin_id) VALUES (?, ?, ?, ?)',
                [phone_number, message, 'sent', req.user.id]);
        } catch (logErr) {
            console.warn('SMS Log skipped:', logErr.message);
        }

        await connection.commit();
        req.io.emit('data_update', { type: 'vouchers' });
        req.io.emit('data_update', { type: 'sms' });
        res.json({ message: 'Voucher sold and sent via SMS', voucher: voucher.code });

    } catch (err) {
        await connection.rollback();
        console.error('Sell Voucher Error:', err);
        res.status(500).json({ error: 'Transaction failed' });
    } finally {
        connection.release();
    }
});

router.delete('/admin/vouchers', async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No IDs provided' });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        await db.query(`DELETE FROM vouchers WHERE id IN (${placeholders}) AND admin_id = ?`, [...ids, req.user.id]);
        req.io.emit('data_update', { type: 'vouchers' });
        res.json({ message: `Deleted ${ids.length} vouchers` });
    } catch (err) {
        console.error('Delete Vouchers Error:', err);
        res.status(500).json({ error: 'Failed to delete vouchers' });
    }
});

// --- Transactions / Payments History ---
router.get('/admin/transactions', async (req, res) => {
    try {
        const { router_id } = req.query;
        let query = `
            SELECT t.id, t.transaction_ref, t.phone_number, t.amount, t.status, t.payment_method, t.created_at, p.name as package_name, r.name as router_name
            FROM transactions t
            LEFT JOIN packages p ON t.package_id = p.id
            LEFT JOIN routers r ON t.router_id = r.id
            WHERE t.admin_id = ?
        `;
        const params = [req.user.id];

        if (router_id) {
            query += ' AND t.router_id = ?';
            params.push(router_id);
        }

        query += ' ORDER BY t.created_at DESC LIMIT 500';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Fetch Transactions Error:', err);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});


// --- Analytics (Graphs) ---
// --- Analytics (Graphs) ---
router.get('/admin/analytics/transactions', async (req, res) => {
    const { period } = req.query; // 'weekly', 'monthly', 'yearly'
    const adminId = req.user.id;
    let query = '';
    let params = [adminId];

    try {
        if (period === 'weekly') {
            // Last 7 days
            query = `
                SELECT DATE_FORMAT(created_at, '%a') as label, SUM(amount) as total_amount, COUNT(*) as count
                FROM transactions
                WHERE admin_id = ? AND status = 'success' AND payment_method != 'manual' 
                AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
            `;
            if (req.query.router_id) {
                query += ' AND router_id = ?';
                params.push(req.query.router_id);
            }
            query += `
                GROUP BY DATE_FORMAT(created_at, '%a')
                ORDER BY MIN(created_at) ASC
            `;
        } else if (period === 'monthly') {
            // Last 30 days
            query = `
                SELECT DATE_FORMAT(created_at, '%d %b') as label, SUM(amount) as total_amount, COUNT(*) as count
                FROM transactions
                WHERE admin_id = ? AND status = 'success' AND payment_method != 'manual'
                AND created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
            `;
            if (req.query.router_id) {
                query += ' AND router_id = ?';
                params.push(req.query.router_id);
            }
            query += `
                GROUP BY DATE_FORMAT(created_at, '%d %b')
                ORDER BY MIN(created_at) ASC
            `;
        } else if (period === 'yearly') {
            // Last 12 months
            query = `
                SELECT DATE_FORMAT(created_at, '%b %Y') as label, SUM(amount) as total_amount, COUNT(*) as count
                FROM transactions
                WHERE admin_id = ? AND status = 'success' AND payment_method != 'manual'
                AND created_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
                GROUP BY DATE_FORMAT(created_at, '%b %Y')
                ORDER BY MIN(created_at) ASC
            `;
        } else {
            return res.status(400).json({ error: 'Invalid period' });
        }

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Analytics Error:', err); // Check PM2 logs for this
        res.status(500).json({ error: 'Failed to fetch analytics: ' + err.message });
    }
});

// --- Stats & Logs ---
// --- Stats & Logs ---
router.get('/admin/stats', async (req, res) => {
    try {
        console.log('DEBUG STATS USER:', req.user.id);
        const { router_id } = req.query;

        let whereClause = "WHERE admin_id = ? AND status = 'success' AND payment_method != 'manual'";
        const params = [req.user.id];

        if (router_id) {
            whereClause += " AND router_id = ?";
            params.push(router_id);
        }

        const statsQuery = `
            SELECT 
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN (amount - COALESCE(fee,0)) ELSE 0 END), 0) as daily_revenue,
                COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN (amount - COALESCE(fee,0)) ELSE 0 END), 0) as weekly_revenue,
                COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) THEN (amount - COALESCE(fee,0)) ELSE 0 END), 0) as monthly_revenue,
                COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) THEN (amount - COALESCE(fee,0)) ELSE 0 END), 0) as yearly_revenue,
                COALESCE(SUM(amount - COALESCE(fee,0)), 0) as total_revenue
            FROM transactions
            ${whereClause}
        `;

        const [transStats] = await db.query(statsQuery, params);

        const [withdrawStats] = await db.query('SELECT COALESCE(SUM(amount), 0) as total_withdrawn FROM withdrawals WHERE admin_id = ?', [req.user.id]);

        const adminId = req.user.id;
        const totalRevenue = Number(transStats[0].total_revenue);
        const totalWithdrawn = Number(withdrawStats[0].total_withdrawn);
        const netBalance = totalRevenue - totalWithdrawn;

        // 2. Counts
        const [catCount] = await db.query('SELECT count(*) as count FROM categories WHERE admin_id = ?', [adminId]);
        const [pkgCount] = await db.query('SELECT count(*) as count FROM packages WHERE admin_id = ?', [adminId]);
        const [voucherCount] = await db.query('SELECT count(*) as count FROM vouchers WHERE admin_id = ? AND is_used = 0', [adminId]);
        const [boughtCount] = await db.query('SELECT count(*) as count FROM transactions WHERE admin_id = ? AND status = "success" AND payment_method != "manual" AND transaction_ref NOT LIKE "SMS-%"', [adminId]);
        const [paymentCount] = await db.query('SELECT count(*) as count FROM transactions WHERE admin_id = ? AND status = "success"', [adminId]);

        // 3. Subscription Status
        const [adminInfo] = await db.query('SELECT subscription_expiry FROM admins WHERE id = ?', [adminId]);

        res.json({
            finance: {
                ...transStats[0],
                gross_revenue: totalRevenue, // Actual total collected
                net_balance: netBalance      // Available to withdraw
            },
            counts: {
                categories_count: catCount[0].count,
                packages_count: pkgCount[0].count,
                vouchers_count: voucherCount[0].count,
                bought_vouchers_count: boughtCount[0].count,
                payments_count: paymentCount[0].count
            },
            subscription: {
                expiry: adminInfo[0].subscription_expiry
            }
        });
    } catch (err) {
        console.error('Stats Error:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// SMS Balance (Mock or Real)
router.get('/admin/sms-balance', async (req, res) => {
    try {
        // Retrieve balance from Relworx or mocked
        // For now, return 0 or fetch from admins table if column exists.
        // Returning 0 to prevent crash. User can request full implementation later.
        res.json({ balance: 0 });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch SMS balance' });
    }
});

// SMS Logs
router.get('/admin/sms-logs', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM sms_logs WHERE admin_id = ? ORDER BY created_at DESC LIMIT 100', [req.user.id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});


// --- Subscription Renewal ---
router.post('/admin/renew-subscription', async (req, res) => {
    const { phone_number, months } = req.body;

    if (!phone_number) return res.status(400).json({ error: 'Phone number is required' });
    if (!months || months < 1) return res.status(400).json({ error: 'Invalid duration' });

    // Enforce Pricing Server-Side
    const MONTHLY_FEE = 20000;
    const amount = months * MONTHLY_FEE;

    try {
        // Format Phone
        let formattedPhone = phone_number.trim();
        if (formattedPhone.startsWith('0')) formattedPhone = '+256' + formattedPhone.slice(1);
        else if (!formattedPhone.startsWith('+')) formattedPhone = '+' + formattedPhone;

        const reference = `SUB - ${Date.now()} -${Math.floor(Math.random() * 1000)} `;

        console.log(`[SUBSCRIPTION] Initiating for ${formattedPhone}, Months: ${months}, Amount: ${amount}, Ref: ${reference} `);

        // 1. Insert Pending Record in NEW table
        await db.query(`
            INSERT INTO admin_subscriptions
            (admin_id, amount, months, phone_number, status, reference)
        VALUES(?, ?, ?, ?, 'pending', ?)
        `, [req.user.id, amount, months, formattedPhone, reference]);

        // 2. Call Relworx
        const response = await fetch(RELWORX_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.relworx.v2',
                'Authorization': `Bearer ${RELWORX_API_KEY} `
            },
            body: JSON.stringify({
                account_no: RELWORX_ACCOUNT_NO,
                reference: reference,
                msisdn: formattedPhone,
                currency: 'UGX',
                amount: Number(amount),
                description: `Subscription Renewal(${months} months)`
            })
        });

        const paymentData = await response.json();
        console.log(`[SUBSCRIPTION] Gateway Response: `, JSON.stringify(paymentData));

        if (response.ok) {
            res.json({
                message: 'Payment request initiated.',
                status: 'pending',
                reference: reference
            });
        } else {
            console.error(`[SUBSCRIPTION] Gateway Failed: `, paymentData);
            await db.query('UPDATE admin_subscriptions SET status = "failed" WHERE reference = ?', [reference]);
            res.status(400).json({ error: 'Payment gateway failed', details: paymentData });
        }
    } catch (err) {
        console.error('Subscription Error:', err);
        res.status(500).json({ error: 'Failed to process subscription' });
    }
});

router.get('/admin/subscription-status/:reference', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT status, months FROM admin_subscriptions WHERE reference = ? AND admin_id = ?', [req.params.reference, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Transaction not found' });

        const localStatus = rows[0].status;
        const monthsToAdd = rows[0].months;

        if (localStatus === 'success' || localStatus === 'failed') {
            return res.json({ status: localStatus });
        }

        // Poll Gateway
        const checkUrl = `https://payments.relworx.com/api/mobile-money/check-request-status?account_no=${RELWORX_ACCOUNT_NO}&reference=${req.params.reference}&internal_reference=${req.params.reference}`;

        console.log(`[SUBSCRIPTION-POLL] Checking: ${req.params.reference}`);

        const gwRes = await fetch(checkUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/vnd.relworx.v2',
                'Authorization': `Bearer ${RELWORX_API_KEY}`
            }
        });

        if (!gwRes.ok) return res.json({ status: 'pending' });

        const gwData = await gwRes.json();
        const gwStatus = (gwData.status || '').toUpperCase();
        const itemStatus = (gwData.item_status || '').toUpperCase();

        if (gwStatus === 'SUCCESS' || itemStatus === 'SUCCESS') {
            console.log(`[SUBSCRIPTION] Confirmed Success: ${req.params.reference}`);
            await db.query('UPDATE admin_subscriptions SET status = "success" WHERE reference = ?', [req.params.reference]);

            // Update Admin Expiry
            // We need to fetch current expiry first to add time correctly
            const [adminRows] = await db.query('SELECT subscription_expiry FROM admins WHERE id = ?', [req.user.id]);
            let currentExpiry = new Date(adminRows[0].subscription_expiry);
            const now = new Date();

            // If expired, start from NOW. If active, add to current expiry.
            if (currentExpiry < now) currentExpiry = now;

            currentExpiry.setMonth(currentExpiry.getMonth() + monthsToAdd);

            await db.query('UPDATE admins SET subscription_expiry = ? WHERE id = ?', [currentExpiry, req.user.id]);

            return res.json({ status: 'success' });
        } else if (gwStatus === 'FAILED') {
            await db.query('UPDATE admin_subscriptions SET status = "failed" WHERE reference = ?', [req.params.reference]);
            return res.json({ status: 'failed' });
        }

        res.json({ status: 'pending' });

    } catch (err) {
        console.error('Check Subscription Status Error:', err);
        res.status(500).json({ error: 'Failed to check status' });
    }
});

// --- Web Configs (Branding) ---
router.get('/admin/web-configs', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT portal_dns, portal_welcome_msg, terms_text, portal_logo FROM admins WHERE id = ?', [req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Web Configs Error:', err);
        res.status(500).json({ error: 'Failed to fetch web configs' });
    }
});

router.put('/admin/web-configs', async (req, res) => {
    const { portal_dns, portal_welcome_msg, terms_text } = req.body;
    try {
        await db.query(
            'UPDATE admins SET portal_dns = ?, portal_welcome_msg = ?, terms_text = ? WHERE id = ?',
            [portal_dns || null, portal_welcome_msg || null, terms_text || null, req.user.id]
        );
        res.json({ message: 'Web configs updated' });
    } catch (err) {
        console.error('Update Web Configs Error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
             return res.status(400).json({ error: 'Domain already taken' });
        }
        res.status(500).json({ error: 'Failed to update web configs' });
    }
});

router.post('/admin/web-configs/logo', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const ext = path.extname(req.file.originalname);
        const newName = `logo_${req.user.id}_${Date.now()}${ext}`;
        // Multer dest is 'uploads/', __dirname is src/routes.
        const newPath = path.join(__dirname, '../../uploads', newName);
        fs.renameSync(req.file.path, newPath);
        
        const logo_url = `/uploads/${newName}`;
        await db.query('UPDATE admins SET portal_logo = ? WHERE id = ?', [logo_url, req.user.id]);
        
        res.json({ logo_url });
    } catch (err) {
        console.error('Upload Logo Error:', err);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
});

// --- Portal Ads ---
router.get('/admin/portal-ads', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM portal_ads WHERE admin_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Fetch Portal Ads Error:', err);
        res.status(500).json({ error: 'Failed to fetch portal ads' });
    }
});

router.post('/admin/portal-ads/upload', upload.single('file'), async (req, res) => {
    const { title, link_url } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!title) return res.status(400).json({ error: 'Title is required' });

    try {
        const ext = path.extname(req.file.originalname);
        const newName = `ad_${req.user.id}_${Date.now()}${ext}`;
        const newPath = path.join(__dirname, '../../uploads', newName);
        fs.renameSync(req.file.path, newPath);

        const image_url = `/uploads/${newName}`;
        const [result] = await db.query(
            'INSERT INTO portal_ads (admin_id, title, image_url, link_url, is_active) VALUES (?, ?, ?, ?, 1)',
            [req.user.id, title, image_url, link_url || null]
        );

        res.json({
            id: result.insertId,
            title,
            image_url,
            link_url: link_url || null,
            is_active: true,
            message: 'Portal ad uploaded successfully'
        });
    } catch (err) {
        console.error('Upload Portal Ad Error:', err);
        res.status(500).json({ error: 'Failed to upload portal ad' });
    }
});

router.patch('/admin/portal-ads/:id/toggle', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT is_active FROM portal_ads WHERE id = ? AND admin_id = ?',
            [req.params.id, req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Ad not found' });

        const newState = rows[0].is_active ? 0 : 1;
        await db.query(
            'UPDATE portal_ads SET is_active = ? WHERE id = ?',
            [newState, req.params.id]
        );

        res.json({ is_active: newState, message: 'Ad status updated successfully' });
    } catch (err) {
        console.error('Toggle Portal Ad Error:', err);
        res.status(500).json({ error: 'Failed to toggle ad status' });
    }
});

router.delete('/admin/portal-ads/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT image_url FROM portal_ads WHERE id = ? AND admin_id = ?',
            [req.params.id, req.user.id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Ad not found' });

        const imagePath = path.join(__dirname, '../..', rows[0].image_url);
        fs.unlink(imagePath, (err) => {
            if (err) console.warn('Could not delete image file:', err.message);
        });

        await db.query(
            'DELETE FROM portal_ads WHERE id = ? AND admin_id = ?',
            [req.params.id, req.user.id]
        );

        res.json({ message: 'Portal ad deleted successfully' });
    } catch (err) {
        console.error('Delete Portal Ad Error:', err);
        res.status(500).json({ error: 'Failed to delete portal ad' });
    }
});

module.exports = router;
