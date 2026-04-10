const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { exec } = require("child_process");
const db = require("../config/db");
const { authenticateToken, verifySuperAdmin } = require("../middleware/auth");
const { sendApprovalEmail } = require("../utils/email");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configure Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "../../uploads/resources");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Unique filename: timestamp-original
    cb(null, Date.now() + "-" + file.originalname.replace(/\s+/g, "_"));
  },
});
const upload = multer({ storage: storage });

// Middleware for all super admin routes
router.use(authenticateToken);
router.use(verifySuperAdmin);

// Get All Tenants (Admins) with their routers
router.get("/tenants", async (req, res) => {
  try {
    const query = `
            SELECT 
                a.id, a.username, a.role, a.billing_type, a.subscription_expiry, a.last_active_at, a.created_at,
                a.email, a.business_name, a.business_phone,
                a.vpn_ip, a.vpn_private_key, a.vpn_public_key, a.vpn_server_pub, a.vpn_endpoint,
                (SELECT COALESCE(SUM(t.amount - COALESCE(t.fee, 0)), 0) FROM transactions t WHERE t.admin_id = a.id AND t.status = 'SUCCESS') as gross_revenue,
                (SELECT COALESCE(SUM(w.amount + COALESCE(w.fee, 0)), 0) FROM withdrawals w WHERE w.admin_id = a.id AND (w.status = 'success' OR w.status = 'pending')) as total_payouts,
                (SELECT COALESCE(SUM(s.amount), 0) FROM sms_fees s WHERE s.admin_id = a.id) as sms_balance,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', r.id,
                        'name', r.name,
                        'mikhmon_url', r.mikhmon_url,
                        'api_user', r.api_user,
                        'api_pass', r.api_pass,
                        'api_port', r.api_port
                    )
                ) as routers
            FROM admins a
            LEFT JOIN routers r ON a.id = r.admin_id
            GROUP BY a.id
            ORDER BY a.created_at DESC
        `;
    const [admins] = await db.query(query);

    // Clean up JSON_ARRAYAGG and calculate net_balance
    const cleanedAdmins = admins.map((admin) => {
        const netBalance = Number(admin.gross_revenue) - Number(admin.total_payouts);
        return {
            ...admin,
            net_balance: Math.max(0, netBalance),
            routers:
            admin.routers && admin.routers[0] && admin.routers[0].id !== null
                ? admin.routers
                : [],
        };
    });

    res.json(cleanedAdmins);
  } catch (err) {
    console.error('Fetch Tenants Error:', err);
    res.status(500).json({ error: "Server error fetching tenants" });
  }
});

// Create New Tenant
router.post("/tenants", async (req, res) => {
  const { username, password, email, business_name, business_phone } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  try {
    // Check if username exists
    const [existing] = await db.query(
      "SELECT id FROM admins WHERE username = ?",
      [username],
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const billingType = req.body.billing_type || "commission";
    const userEmail = email || null;
    const bName = business_name || "UGPAY";
    const bPhone = business_phone || null;

    const [result] = await db.query(
      "INSERT INTO admins (username, password_hash, role, billing_type, email, business_name, business_phone) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [username, hash, "admin", billingType, userEmail, bName, bPhone],
    );

    // AUTOMATION: Create Isolated Mikhmon Instance
    const scriptPath = path.join(
      __dirname,
      "../../scripts/create_mikhmon_client.sh",
    );
    const vpnScriptPath = path.join(__dirname, "../../scripts/AUTOMATE_VPN.sh");

    // Sanitize username for folder creation (replace spaces with underscores)
    const safeUsername = username.replace(/\s+/g, "_");

    // Execute the isolation script.
    exec(`bash "${scriptPath}" "${safeUsername}"`, (error, stdout, stderr) => {
      if (error)
        console.error(`[MIKHMON-AUTO] Error for ${safeUsername}:`, error);
      else console.log(`[MIKHMON-AUTO] Success for ${safeUsername}`);
    });

    // NEW: AUTOMATION: Create VPN Client
    exec(
      `bash "${vpnScriptPath}" "${safeUsername}"`,
      async (error, stdout, stderr) => {
        if (error) {
          console.error(`[VPN-AUTO] Error for ${safeUsername}:`, error);
          return;
        }
        try {
          const vpn = JSON.parse(stdout);
          if (vpn.vpn_ip) {
            await db.query(
              `
                        UPDATE admins SET 
                        vpn_ip = ?, vpn_private_key = ?, vpn_public_key = ?, vpn_server_pub = ?, vpn_endpoint = ? 
                        WHERE id = ?`,
              [
                vpn.vpn_ip,
                vpn.vpn_private_key,
                vpn.vpn_public_key,
                vpn.vpn_server_pub,
                vpn.vpn_endpoint,
                result.insertId,
              ],
            );
            console.log(
              `[VPN-AUTO] VPN created and stored for ${safeUsername}`,
            );
          }
        } catch (e) {
          console.error(
            `[VPN-AUTO] Parse Error for ${safeUsername}:`,
            e,
            stdout,
          );
        }
      },
    );

    res
      .status(201)
      .json({
        message:
          "Tenant created successfully. Mikhmon and VPN isolation pending.",
      });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create tenant" });
  }
});

// Delete Tenant
router.delete("/tenants/:id", async (req, res) => {
  const tenantId = req.params.id;

  // Prevent deleting self
  if (parseInt(tenantId) === req.user.id) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  try {
    await db.query("DELETE FROM admins WHERE id = ?", [tenantId]);
    res.json({ message: "Tenant deleted successfully" });
    // Note: In a real production app, we should probably soft-delete or handle their associated data.
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete tenant" });
  }
});

// Renew Subscription
router.patch("/tenants/:id/subscription", async (req, res) => {
  const tenantId = req.params.id;
  const { expiry_date } = req.body; // YYYY-MM-DD or Valid Date String

  if (!expiry_date) return res.status(400).json({ error: "Date required" });

  try {
    await db.query("UPDATE admins SET subscription_expiry = ? WHERE id = ?", [
      expiry_date,
      tenantId,
    ]);
    res.json({ message: "Subscription updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update subscription" });
  }
});

// Update Tenant Profile
router.patch("/tenants/:id", async (req, res) => {
  const tenantId = req.params.id;
  const { business_name, business_phone, email } = req.body;

  try {
    await db.query(
      "UPDATE admins SET business_name = ?, business_phone = ?, email = ? WHERE id = ?",
      [business_name, business_phone, email, tenantId],
    );
    res.json({ message: "Tenant updated successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

// Reset Tenant Password
router.patch("/tenants/:id/password", async (req, res) => {
  const tenantId = req.params.id;
  const { new_password } = req.body;

  if (!new_password)
    return res.status(400).json({ error: "New password is required" });

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(new_password, salt);

    await db.query("UPDATE admins SET password_hash = ? WHERE id = ?", [
      hash,
      tenantId,
    ]);
    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// Generate VPN for existing tenant
router.post("/tenants/:id/vpn", async (req, res) => {
  const tenantId = req.params.id;
  try {
    const [rows] = await db.query("SELECT username FROM admins WHERE id = ?", [
      tenantId,
    ]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Tenant not found" });

    const username = rows[0].username;
    const vpnScriptPath = path.join(__dirname, "../../scripts/AUTOMATE_VPN.sh");
    const safeUsername = username.replace(/\s+/g, "_");

    exec(
      `bash "${vpnScriptPath}" "${safeUsername}"`,
      async (error, stdout, stderr) => {
        if (error) {
          console.error(`[VPN-AUTO] Error for ${safeUsername}:`, error);
          return res
            .status(500)
            .json({ error: "VPN Script failed", details: stderr });
        }
        try {
          const vpn = JSON.parse(stdout);
          if (vpn.vpn_ip) {
            await db.query(
              `
                        UPDATE admins SET 
                        vpn_ip = ?, vpn_private_key = ?, vpn_public_key = ?, vpn_server_pub = ?, vpn_endpoint = ? 
                        WHERE id = ?`,
              [
                vpn.vpn_ip,
                vpn.vpn_private_key,
                vpn.vpn_public_key,
                vpn.vpn_server_pub,
                vpn.vpn_endpoint,
                tenantId,
              ],
            );
            res.json({ message: "VPN generated successfully", vpn });
          } else {
            res.status(500).json({ error: "VPN response was invalid", stdout });
          }
        } catch (e) {
          console.error(
            `[VPN-AUTO] Parse Error for ${safeUsername}:`,
            e,
            stdout,
          );
          res.status(500).json({ error: "Failed to parse VPN output", stdout });
        }
      },
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// System Stats
router.get("/stats", async (req, res) => {
  try {
    const [admins] = await db.query(
      'SELECT COUNT(*) as count FROM admins WHERE role = "admin"',
    );
    const [vouchers] = await db.query("SELECT COUNT(*) as count FROM vouchers");
    const [totalRevenue] = await db.query(
      'SELECT SUM(amount) as total FROM transactions WHERE status = "SUCCESS"',
    );
    const [totalFees] = await db.query(
      'SELECT SUM(fee) as total FROM transactions WHERE status = "SUCCESS"',
    );
    const [totalSubscriptions] = await db.query(
      'SELECT SUM(amount) as total FROM admin_subscriptions WHERE status = "success"',
    );

    res.json({
      tenantCount: admins[0].count,
      totalVouchers: vouchers[0].count,
      totalRevenue: totalRevenue[0].total || 0,
      totalCommission: totalFees[0].total || 0,
      totalSubscriptions: totalSubscriptions[0].total || 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// --- RESOURCES (FILE UPLOAD) ---

// Upload Resource
router.post("/resources", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const { title, description } = req.body;
    // Path relative to server root for public access (served via static /uploads)
    const publicPath = "/uploads/resources/" + req.file.filename;

    await db.query(
      "INSERT INTO resources (title, file_path, description) VALUES (?, ?, ?)",
      [title, publicPath, description || ""],
    );

    res
      .status(201)
      .json({ message: "File uploaded successfully", file: req.file });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// List Resources
router.get("/resources", async (req, res) => {
  try {
    const [files] = await db.query(
      "SELECT * FROM resources ORDER BY created_at DESC",
    );
    res.json(files);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch resources" });
  }
});

// Delete Resource
router.delete("/resources/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await db.query(
      "SELECT file_path FROM resources WHERE id = ?",
      [id],
    );
    if (rows.length === 0)
      return res.status(404).json({ error: "File not found" });

    const filePath = rows[0].file_path; // e.g., /uploads/resources/filename
    const absolutePath = path.join(__dirname, "../../", filePath);

    // Remove from DB
    await db.query("DELETE FROM resources WHERE id = ?", [id]);

    // Remove from Disk
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }

    res.json({ message: "Resource deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// --- REGISTRATION REQUESTS ---

// List all registration requests
router.get("/registration-requests", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM registration_requests ORDER BY created_at DESC",
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch registration requests" });
  }
});

// Delete/Reject a registration request
router.delete("/registration-requests/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await db.query("DELETE FROM registration_requests WHERE id = ?", [id]);
    res.json({ message: "Registration request deleted/rejected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete request" });
  }
});

// Approve a registration request
router.post("/registration-requests/:id/approve", async (req, res) => {
  const id = req.params.id;
  try {
    // 1. Get Request Details
    const [rows] = await db.query("SELECT * FROM registration_requests WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Request not found" });
    const request = rows[0];

    // 2. Update Status
    await db.query("UPDATE registration_requests SET status = 'approved' WHERE id = ?", [id]);

    // 3. Send Email
    await sendApprovalEmail(request.email);

    res.json({ message: "Request approved and email sent." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to approve request" });
  }
});

// --- Ad Approvals ---

// List all pending ads
router.get("/ads/pending", async (req, res) => {
  try {
    const query = `
      SELECT ads.*, admins.username as admin_username
      FROM ads
      JOIN admins ON ads.admin_id = admins.id
      WHERE ads.status = 'pending'
      ORDER BY ads.created_at DESC
    `;
    const [rows] = await db.query(query);
    res.json(rows);
  } catch (err) {
    console.error('Fetch Pending Ads Error:', err);
    res.status(500).json({ error: "Failed to fetch pending ads" });
  }
});

// Approve an ad
router.post("/ads/:id/approve", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("UPDATE ads SET status = 'approved' WHERE id = ?", [id]);
    res.json({ message: "Ad approved successfully" });
  } catch (err) {
    console.error('Approve Ad Error:', err);
    res.status(500).json({ error: "Failed to approve ad" });
  }
});

// Reject an ad
router.post("/ads/:id/reject", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("UPDATE ads SET status = 'rejected' WHERE id = ?", [id]);
    res.json({ message: "Ad rejected successfully" });
  } catch (err) {
    console.error('Reject Ad Error:', err);
    res.status(500).json({ error: "Failed to reject ad" });
  }
});

// Super Admin: Update Any Router
router.put("/routers/:id", async (req, res) => {
  const { id } = req.params;
  const { name, mikhmon_url, api_user, api_pass, api_port } = req.body;
  if (!name || !mikhmon_url) return res.status(400).json({ error: "Name and URL are required" });

  try {
    const [result] = await db.query(
      "UPDATE routers SET name = ?, mikhmon_url = ?, api_user = ?, api_pass = ?, api_port = ? WHERE id = ?",
      [name, mikhmon_url, api_user || null, api_pass || null, api_port || 8728, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Router not found" });
    }

    res.json({ message: "Router updated successfully" });
  } catch (err) {
    console.error("Super Admin Update Router Error:", err);
    res.status(500).json({ error: "Failed to update router" });
  }
});

module.exports = router;
