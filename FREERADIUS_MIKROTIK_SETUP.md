# FreeRADIUS & MikroTik Integration Guide for WiPay

This guide walks you through installing FreeRADIUS and connecting your MikroTik routers for Wi-Fi hotspot authentication.

---

## Part 1: FreeRADIUS Installation (On Your VPS)

### Step 1.1: Install FreeRADIUS & MySQL Module

```bash
sudo apt update
sudo apt install -y freeradius freeradius-mysql
```

### Step 1.2: Verify Installation

```bash
freeradius -v
# Should output: FreeRADIUS Version 3.x.x
```

---

## Part 2: Database Setup

### Step 2.1: Create FreeRADIUS Schema in Your MySQL

Use this SQL to set up the RADIUS tables in your **wipay** database. Run in MySQL:

```sql
-- Create RADIUS tables (standard schema)

-- radcheck: Stores user authentication credentials
CREATE TABLE IF NOT EXISTS radcheck (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    UNIQUE KEY username_attribute (username, attribute)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- radreply: Stores RADIUS reply attributes (session timeout, rate limits, etc.)
CREATE TABLE IF NOT EXISTS radreply (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    UNIQUE KEY username_attribute (username, attribute)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- radusergroup: Links users to groups (for package profiles)
CREATE TABLE IF NOT EXISTS radusergroup (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    groupname VARCHAR(64) NOT NULL,
    priority INT DEFAULT 1,
    UNIQUE KEY username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- radgroupcheck: Group authentication rules
CREATE TABLE IF NOT EXISTS radgroupcheck (
    id INT AUTO_INCREMENT PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    UNIQUE KEY groupname_attribute (groupname, attribute)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- radgroupreply: Group reply attributes (rate limits, session timeouts)
CREATE TABLE IF NOT EXISTS radgroupreply (
    id INT AUTO_INCREMENT PRIMARY KEY,
    groupname VARCHAR(64) NOT NULL,
    attribute VARCHAR(64) NOT NULL,
    op VARCHAR(2) NOT NULL DEFAULT ':=',
    value VARCHAR(253) NOT NULL,
    UNIQUE KEY groupname_attribute (groupname, attribute)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- radacct: Accounting records (logging user sessions)
CREATE TABLE IF NOT EXISTS radacct (
    radacctid BIGINT AUTO_INCREMENT PRIMARY KEY,
    acctsessionid VARCHAR(64) NOT NULL,
    acctuniqueid VARCHAR(32) NOT NULL UNIQUE,
    username VARCHAR(64) NOT NULL,
    realm VARCHAR(64),
    nasipaddress VARCHAR(15) NOT NULL,
    nasportid VARCHAR(15),
    nasporttype VARCHAR(32),
    acctstarttime TIMESTAMP NULL,
    acctstoptime TIMESTAMP NULL,
    acctsessiontime INT,
    acctinputoctets BIGINT,
    acctoutputoctets BIGINT,
    acctcausestoptype VARCHAR(32),
    acctterminatecause VARCHAR(32),
    servicetype VARCHAR(32),
    framedprotocol VARCHAR(32),
    framedipaddress VARCHAR(15),
    framedipv6address VARCHAR(42),
    framedipv6prefix VARCHAR(3),
    framedinterfaceid VARCHAR(44),
    delegatedipv6prefix VARCHAR(3),
    acctstartdelay INT,
    acctstopdelay INT,
    xascendsessionsupport INT,
    acctmptsessionsupport TINYINT,
    KEY username (username),
    KEY framedipaddress (framedipaddress),
    KEY acctsessionid (acctsessionid),
    KEY acctstarttime (acctstarttime),
    KEY acctstoptime (acctstoptime),
    KEY nasipaddress (nasipaddress)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- nas: Stores NAS (Network Access Server = MikroTik routers)
CREATE TABLE IF NOT EXISTS nas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nasname VARCHAR(128) NOT NULL UNIQUE,
    shortname VARCHAR(32),
    type VARCHAR(30) DEFAULT 'other',
    ports INT,
    secret VARCHAR(60) NOT NULL DEFAULT 'testing123',
    server VARCHAR(64),
    community VARCHAR(64),
    description VARCHAR(200),
    KEY nasname (nasname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**Run this in MySQL:**
```bash
mysql -u root -p wipay < /path/to/above/script.sql
```

Or paste directly:
```bash
mysql -u root -p wipay
# Then paste the SQL above
```

### Step 2.2: Create a RADIUS-specific MySQL user (Security Best Practice)

```sql
CREATE USER 'radius'@'localhost' IDENTIFIED BY 'radius_secure_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON wipay.radcheck TO 'radius'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON wipay.radreply TO 'radius'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON wipay.radusergroup TO 'radius'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON wipay.radgroupcheck TO 'radius'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON wipay.radgroupreply TO 'radius'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON wipay.radacct TO 'radius'@'localhost';
GRANT SELECT ON wipay.nas TO 'radius'@'localhost';
FLUSH PRIVILEGES;
```

---

## Part 3: Configure FreeRADIUS

### Step 3.1: Edit FreeRADIUS Main Config

```bash
sudo nano /etc/freeradius/3.0/radiusd.conf
```

**Ensure line 470 is uncommented** (for MySQL logging):
```
$INCLUDE mods-available/sql
```

### Step 3.2: Configure MySQL Module

```bash
sudo nano /etc/freeradius/3.0/mods-available/sql
```

**Find and update the `sql` section** (around line 73):

```conf
sql {
    # MySQL settings
    driver = "rlm_sql_mysql"
    
    # Database credentials (must match what you created above)
    server = "localhost"
    port = 3306
    login = "radius"
    password = "radius_secure_password"
    radius_db = "wipay"
    
    # Connection pool settings
    pool {
        start = 5
        min = 3
        max = 32
        spare = 3
        uses = 0
    }
    
    # Queries to run (use standard RADIUS schema)
    query_config = "SELECT id, username, attribute, value, op FROM ${authcheck_table} WHERE username = '%{SQL-User-Name}' ORDER BY id"
    
    query_reply = "SELECT id, username, attribute, value, op FROM ${authreply_table} WHERE username = '%{SQL-User-Name}' ORDER BY id"
    
    group_membership_query = "SELECT groupname FROM ${usergroup_table} WHERE username = '%{SQL-User-Name}' ORDER BY priority"
    
    authorize_group_check_query = "SELECT id, groupname, attribute, Value, op FROM ${groupcheck_table} WHERE groupname = '%{Sql-Group}' ORDER BY id"
    
    authorize_group_reply_query = "SELECT id, groupname, attribute, value, op FROM ${groupreply_table} WHERE groupname = '%{Sql-Group}' ORDER BY id"
    
    accounting {
        reference = "%{tolower:type.%{Acct-Status-Type}}"
        type {
            start = "INSERT INTO ${acct_table} ..."
            # (or use default if pre-configured)
        }
    }
}
```

### Step 3.3: Enable Sites

```bash
# Enable the default site
sudo ln -s /etc/freeradius/3.0/sites-available/default /etc/freeradius/3.0/sites-enabled/default

# Enable the inner-tunnel site (for EAP/PAP)
sudo ln -s /etc/freeradius/3.0/sites-available/inner-tunnel /etc/freeradius/3.0/sites-enabled/inner-tunnel
```

### Step 3.4: Set Permissions

```bash
sudo chown -R freerad:freerad /etc/freeradius/3.0
sudo chmod -R 640 /etc/freeradius/3.0
```

### Step 3.5: Test FreeRADIUS (Debug Mode)

```bash
sudo freeradius -X
```

**Look for:**
- ✅ `Ready to process requests`
- ❌ Any errors about database connections

If database errors → check MySQL credentials in `/etc/freeradius/3.0/mods-available/sql`.

**Exit debug mode:** `Ctrl+C`

---

## Part 4: Register MikroTik Routers as NAS Clients

FreeRADIUS needs to know which routers (NAS) are allowed to ask for authentication.

### Step 4.1: Add NAS Entries to Database

For **each MikroTik router**, insert this into MySQL:

```sql
INSERT INTO nas (nasname, shortname, type, secret, description) 
VALUES 
    ('192.168.1.1', 'MikroTik-Main', 'mikrotik', 'shared_secret_123', 'Main Router - Main Branch'),
    ('192.168.1.2', 'MikroTik-Cafe', 'mikrotik', 'shared_secret_456', 'Secondary Router - Cafe');
```

**Replace:**
- `192.168.1.1` → IP address of your MikroTik router
- `shared_secret_123` → A strong secret (20+ chars, alphanumeric + symbols)
- Description → Friendly name

### Step 4.2: Alternative: Configure in FreeRADIUS Clients File

Or edit the clients file directly:

```bash
sudo nano /etc/freeradius/3.0/clients.conf
```

**Add at the end:**

```conf
# MikroTik Router 1
client 192.168.1.1 {
    shortname = MikroTik-Main
    secret = shared_secret_123
    description = Main Router - Main Branch
    nas_type = mikrotik
}

# MikroTik Router 2
client 192.168.1.2 {
    shortname = MikroTik-Cafe
    secret = shared_secret_456
    description = Secondary Router - Cafe
}
```

---

## Part 5: Start FreeRADIUS Service

### Step 5.1: Enable at Boot & Start

```bash
sudo systemctl enable freeradius
sudo systemctl start freeradius
```

### Step 5.2: Check Status

```bash
sudo systemctl status freeradius
```

**Should show:** `● freeradius.service - FreeRADIUS high-performance and feature-rich RADIUS server`

### Step 5.3: View Logs

```bash
sudo tail -f /var/log/freeradius/radius.log
```

---

## Part 6: Configure MikroTik Hotspot for RADIUS Authentication

### Step 6.1: On Your MikroTik Router (via WinBox or SSH)

**Navigate to:** `IP → Hotspot → Servers`

1. **Create a new Hotspot server** (or use existing):
   - Name: `hotspot1`
   - Interface: `ether2` (or your LAN interface)
   - Address Pool: `192.168.2.0/24` (your guest network)
   - Profile: `default`

### Step 6.2: Set RADIUS Authentication

**Navigate to:** `IP → Hotspot → User Profile`

1. **Create or edit a profile:**
   - Name: `default` (or custom name)
   - Shared Users: `1` (or higher)
   - Rate Limit: `1M/1M` (upload/download speeds)
   - Idle Timeout: `10m` (disconnect after idle)

### Step 6.3: Add RADIUS Server to MikroTik

**Navigate to:** `IP → Hotspot → Auth → RADIUS`

1. **Click `+` to add a new RADIUS server:**
   - Service: `hotspot`
   - Address: `<VPS_IP>` (IP of your RADIUS server)
   - Secret: `shared_secret_123` (must match what you set in `/etc/freeradius/3.0/clients.conf`)
   - Timeout: `3s`
   - Accounting: `enabled` (optional, for tracking usage)

### Step 6.4: Optional - Set RADIUS Accounting

If you want MikroTik to send session logs to RADIUS:

**Still in RADIUS section:**
- Enable `Accounting`
- Same server/secret

---

## Part 7: Test the RADIUS Server

### From Your VPS:

```bash
# Test with a test user (must exist in radcheck table first)
radtest username password 127.0.0.1 1812 shared_secret_123
```

**Expected response:**
```
Sent Access-Request Id 1 from 127.0.0.1:xxxxx to 127.0.0.1:1812
	...
Received Access-Accept Id 1 from 127.0.0.1:1812
```

### From MikroTik:

Once configured, when a user tries to connect to your Hotspot:
1. User enters credentials in login portal
2. MikroTik sends RADIUS request to FreeRADIUS
3. FreeRADIUS checks `radcheck` table (voucher code = username, code = password)
4. Returns `Access-Accept` + rate limits + timeout
5. User connects!

---

## Part 8: Integration with Your Node.js Backend

### When Creating a Voucher in Node.js:

You need to **sync the voucher to RADIUS**. Currently your Node.js backend doesn't do this.

**Add this to `server/src/routes/adminRoutes.js`:**

```javascript
// After selling/creating a voucher, insert into radcheck:
async function syncVoucherToRadius(voucherCode, packageId) {
    const query = `
        INSERT INTO radcheck (username, attribute, op, value)
        VALUES (?, 'Cleartext-Password', ':=', ?)
        ON DUPLICATE KEY UPDATE value = VALUES(value)
    `;
    
    await db.query(query, [voucherCode, voucherCode]);
    
    // Also set rate limit if applicable
    const pkgQuery = `SELECT rate_limit FROM packages WHERE id = ?`;
    const [pkg] = await db.query(pkgQuery, [packageId]);
    
    if (pkg && pkg[0]) {
        const rateQuery = `
            INSERT INTO radreply (username, attribute, op, value)
            VALUES (?, 'Mikrotik-Rate-Limit', '=', ?)
            ON DUPLICATE KEY UPDATE value = VALUES(value)
        `;
        await db.query(rateQuery, [voucherCode, pkg[0].rate_limit]);
    }
}
```

**Call this after voucher creation/sale.**

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Connection refused on 1812** | Check `sudo systemctl status freeradius` and firewall: `sudo ufw allow 1812/udp` |
| **RADIUS times out** | Verify MikroTik IP in `clients.conf` matches exactly; check secret matches |
| **Authentication fails** | Verify voucher code exists in `radcheck` table; check logs: `sudo tail -f /var/log/freeradius/radius.log` |
| **User can't connect after auth success** | Check IP pool (`Address Pool` on MikroTik), DHCP configuration |
| **Rate limit not applying** | Verify `Mikrotik-Rate-Limit` attribute in `radreply` table; format: `1M/1M` (upload/download) |

---

## Quick Reference: Voucher Creation Flow (After Setup)

1. **Admin sells voucher** → Node.js backend
2. **Backend inserts into `radcheck`:**
   ```sql
   INSERT INTO radcheck VALUES (NULL, 'ABC12345', 'Cleartext-Password', ':=', 'ABC12345');
   ```
3. **Backend inserts rate limit into `radreply`:**
   ```sql
   INSERT INTO radreply VALUES (NULL, 'ABC12345', 'Mikrotik-Rate-Limit', '=', '1M/1M');
   ```
4. **User connects to MikroTik hotspot, enters code: `ABC12345`**
5. **MikroTik sends RADIUS request** → FreeRADIUS
6. **FreeRADIUS checks `radcheck`** → MATCH ✓
7. **FreeRADIUS sends back rate limit from `radreply`** → MikroTik applies it
8. **User connects at 1M/1M speed!** 🎉

---

## Next Steps

1. ✅ Install FreeRADIUS
2. ✅ Create database tables
3. ✅ Configure MySQL connection
4. ✅ Register MikroTik routers as NAS
5. ✅ Test connection
6. **TODO:** Modify Node.js backend to sync vouchers to RADIUS on creation/sale

