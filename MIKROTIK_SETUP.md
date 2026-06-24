# Complete MikroTik Configuration Guide - From Scratch to WiPay

This guide covers everything: getting internet, bridging ports, setting up the Hotspot, and connecting to your WiPay VPS.

**Goal**: A router that takes internet from `ether1`, shares it via WiFi/LAN, enforces the WiPay Hotspot, and connects to your VPS for management.

---

## Phase 1: Basic Internet & Bridging

_Assumption: Your Internet Provider (ISP) cable is plugged into **ether1** and gives IP automatically._

1.  **Reset Configuration** (Optional but recommended for clean start)
    - System -> Reset Configuration -> Check "No Default Configuration" -> Reset.
    - _Connect via MAC Address using WinBox after reboot._

2.  **Create a Bridge** (To combine LAN ports & WiFi)
    - Go to **Bridge**.
    - Click **+**, Name it `bridge-lan`, Click **OK**.
    - Go to **Ports** tab.
    - Click **+**, Interface: `ether2`, Bridge: `bridge-lan`. OK.
    - Click **+**, Interface: `ether3`, Bridge: `bridge-lan`. OK.
    - Click **+**, Interface: `ether4`, Bridge: `bridge-lan`. OK.
    - Click **+**, Interface: `wlan1` (Wireless), Bridge: `bridge-lan`. OK.
    - _Do NOT add `ether1` (that's for WAN)._

3.  **Get Internet (WAN)**
    - Go to **IP** -> **DHCP Client**.
    - Click **+**, Interface: `ether1`.
    - Ensure "Add Default Route" is **Yes**.
    - Click **OK**.
    - _Check: You should see a status of "bound" and an IP address._

4.  **Setup LAN IP**
    - Go to **IP** -> **Addresses**.
    - Click **+**.
    - Address: `192.168.88.1/24`
    - Interface: `bridge-lan`.
    - Click **OK**.

5.  **Setup Firewall / NAT** (Crucial for Internet access)
    - Go to **IP** -> **Firewall** -> **NAT** tab.
    - Click **+**.
    - **Chain**: `srcnat`
    - **Out. Interface**: `ether1`
    - **Action** (Action tab): `masquerade`
    - Click **OK**.

6.  **Allow WinBox (Important!)**
    - Go to **IP** -> **Firewall** -> **Filter Rules** tab.
    - Click **+**.
    - **Chain**: `input`
    - **Protocol**: `tcp`
    - **Dst. Port**: `8291`
    - **Action**: `accept`
    - Click **OK**. Move this rule to the **top** if there are other rules.

7.  **Setup DNS**
    - Go to **IP** -> **DNS**.
    - Servers: `8.8.8.8`, `1.1.1.1`
    - Check "Allow Remote Requests".
    - Click **OK**.

---

## Phase 2: Hotspot Setup (Handles DHCP Automatically)

Now we make the router asking for login (Captive Portal).
**Note**: This wizard AUTOMATICALLY sets up the **DHCP Server** for you. You do not need to do it separately.

1.  Go to **IP** -> **Hotspot**.
2.  Make sure you are on the **Servers** tab (first tab).
3.  Click the **Hotspot Setup** button (It is typically on the top toolbar, slightly to the left).
4.  **Interface**: `bridge-lan`. Next.
5.  **Local Address**: `192.168.88.1/24`. Next.
6.  **Pool of Network**: `192.168.88.10-192.168.88.254`. Next.
    - _This is your DHCP Pool (where users get IPs)._
7.  **Select Certificate**: `none`. Next.
8.  **SMTP Server**: `0.0.0.0`. Next.
9.  **DNS Servers**: `8.8.8.8`. Next.
10. **DNS Name**: `wipay.login` (Or leave blank, but a name is better). Next.
11. **User**: `admin`, **Password**: (leave blank). Next.
12. **Success!**

_Verification_: Go to **IP** -> **DHCP Server**. You should see a server named `dhcp1` (or similar) created automatically.

---

## Phase 3: WiPay Integration (Walled Garden)

Allow users to pay before logging in. **Follow this EXACTLY to avoid leaks.**

**Go to "Walled Garden IP List" Tab (2nd Tab)**:

1.  **Rule 1: Allow DNS (Critical for fetching packages)**
    - Click **+**.
    - **Action**: `accept`
    - **Protocol**: `17 (udp)`
    - **Dst. Port**: `53`
    - **Dst. Address**: `(LEAVE EMPTY)` <--- Important!
    - Click **OK**.

2.  **Rule 2: Allow WiPay Server**
    - Click **+**.
    - **Action**: `accept`
    - **Protocol**: `6 (tcp)`
    - **Dst. Port**: `443`
    - **Dst. Address**: `84.46.253.72`
    - _(Make sure Dst. Address List is EMPTY)_.
    - Click **OK**.

**WARNING (The "Free Internet" Leak):**

- Never create a rule with `Dst. Port: 443 / 80` and **Empty** Destination Address.
- If you do, everyone gets free internet.
- Check your list: Only Rule 1 (DNS) should have an empty address.

---

## Phase 4: Upload Custom Login Page

Replace the default MikroTik page with the WiPay client.

1.  Check `client/js/config.js` on your PC:
    ```javascript
    const CONFIG = { API_BASE_URL: "https://ugpay.tech/api" };
    ```
2.  In WinBox, go to **Files**.
3.  Find the `hotspot` folder.
4.  **Upload** contents of your `client` folder (`login.html`, `css`, `js`, etc.) into that `hotspot` folder.
    - _This replaces the default login page._

---

## Phase 5: WireGuard (Remote Management)

Connect this router to your VPS so the system can control it.

**Assumption**: You have run `./add_router_vpn.sh routerX` on your VPS and have the unique keys/IP.

1.  Go to **WireGuard**.
2.  **+ Interface**:
    - Name: `wireguard-vps`
    - Listen Port: `13231`
    - Private Key: `(Paste Private Key from script output)`
3.  **+ Peer**:
    - Interface: `wireguard-vps`
    - Public Key: `(Paste Server Public Key from script output)`
    - Endpoint: `84.46.253.72`
    - Endpoint Port: `51820`
    - Allowed Address: `10.66.66.0/24`
    - Persistent Keepalive: `25`
4.  Go to **IP** -> **Addresses**.
    - **+ Add**: Address: `(Paste IP from script output)/32` (e.g., `10.66.66.3/32`)
    - Interface: `wireguard-vps`

---

## Phase 6: Verify

1.  Connect phone to WiFi.
2.  "Sign in to network" prompt should appear.
3.  You should see the WiPay login page.
4.  Click "Free Trial" or "Packages" -> They should load (proving Internet & Walled Garden work).

---

## Phase 7: Critical Security & Best Practices (Do Not Skip)

1.  **Set a Strong Password**
    - Go to **System** -> **Users**.
    - Double-click `admin`.
    - Click **Password**.
    - Type a strong password. **Do not leave it blank!**

2.  **Disable Unused Services** (Prevent Hackers)
    - Go to **IP** -> **Services**.
    - **DISABLE** (Select and click **X**):
      - `www` (WebFig - Not needed if using WinBox)
      - `www-ssl`
      - `telnet` (Very insecure)
      - `ftp`
    - **ENABLE** (Tick):
      - `winbox` (Port 8291) - **CRITICAL: DO NOT DISABLE**
      - `ssh` (Port 22) - Good for backup
      - `api` (Port 8728) - **ENABLE THIS** (Required for WiPay voucher syncing).
    - _Note: Disabling `www` only disables the Admin Web Panel. Your Hotspot Login Page will still work fine._

3.  **Create Dedicated API User (WiPay Admin)**
    - Run these two commands in the Terminal for maximum security:

    ```bash
    # A. Create a restricted group
    /user group add name=wipay policy=read,write,api,test,password,sniff,!local,!telnet,!ssh,!ftp,!reboot,!policy,!winbox,!sensitive,!romon

    # B. Create the API user with your project password
    /user add name=wipay_admin group=wipay password=Atahoprince@2003
    ```

    - _Why?_ This group protects your router. The server can activate vouchers but CANNOT reboot the router, delete admins, or log in via WinBox.

4.  **Set Correct Time** (Important for Logs)
    - Go to **System** -> **Clock**.
    - Set your **Time Zone Name** (e.g., `Africa/Kampala`).
    - Go to **System** -> **SNTP Client**.
    - Check **Enabled**.
    - **Primary NTP**: `0.africa.pool.ntp.org` (or `0.asia.pool.ntp.org`)
    - **Secondary NTP**: `1.africa.pool.ntp.org`
    - **Other Options**: `pool.ntp.org`, `time.google.com`, `162.159.200.1` (Cloudflare).
    - Click **Apply**.

---

## Phase 8: Enabling Free Trial

Allow users to get free internet for a short time (e.g., 5 minutes).

1.  Go to **IP** -> **Hotspot** -> **Server Profiles** tab.
2.  Double-click your profile (usually `hsprof1`).
3.  Go to the **Login** tab.
4.  Check **Trial**.
5.  Set **Trial Uptime Limit**: `00:05:00` (5 Minutes).
6.  Set **Trial Uptime Reset**: `1d 00:00:00` (Can try again after 1 day).
7.  Click **OK**.
    - _Now the "Free Trial" button on your login page will work._

---

## Phase 9: Login Methods (The Checkboxes)

You asked about "HTTP CHAP", "HTTPS", etc. Here is what you should check in **Server Profiles -> Login**.

1.  **HTTP CHAP** (✅ Check this): This is the standard secure login method.
2.  **HTTP PAP** (✅ Check this): Good fallback for some devices.
3.  **HTTP Cookie** (✅ Check this): Keeps users logged in so they don't have to type the code every time they unlock their phone.
4.  **MAC Cookie** (Optional): Remembers the device for a long time. Good for user experience.
5.  **HTTPS** (❌ Uncheck): Only check this if you bought a real SSL certificate for the ROUTER itself. If you verify with a self-signed cert, phones will show "Security Warning". It's better to leave it OFF for the Hotspot page itself.
6.  **MAC** (❌ Uncheck): We are using Vouchers, not MAC addresses.
7.  **Trial** (✅ Check): As per Phase 8.

---

## Phase 10: Mikhmon Setup (The "Trick")

### Part 1: Create the App (On VPS)

Before connecting the router, create the client's isolated Mikhmon server.

1.  **Login to VPS** via SSH.
2.  **Run the Generator Script**:
    ```bash
    ./create_mikhmon_client.sh client_name
    # Example: ./create_mikhmon_client.sh shop1
    ```
3.  **Result**:
    - You get a focused link: `https://ugpay.tech/shop1/`
    - Default Login: `mikhmon` / `1234`
    - _Give this link to your client._

### Part 2: Connect the Router (Inside Mikhmon)

Now log into that new link (`/shop1/`) and connect the router using the **VPN Tunnel**.

1.  **IP Address**: Use the **VPN IP** assigned to this router (e.g., `10.66.66.2`).
    - _Why?_ The VPS cannot see your "Public IP" easily, but it can ALWAYS see the VPN IP. It acts like a direct cable.
2.  **Port**: `8728` (Default API port you enabled in Phase 7).
3.  **Username/Password**: The router's admin login.
4.  **Hotspot Name**: `wipay` (or whatever you named the DNS Name).
5.  **DNS Name**: `wipay.login`.

**For Future Routers:**

- Router 1: Connect to `10.66.66.2`
- Router 2: Connect to `10.66.66.3`
- Router 3: Connect to `10.66.66.4`
  _(Always use the unique VPN IP generated by the script)._

## Phase 11: Calendar Validity Enforcement

WiPay uses **calendar-based validity** — if a user buys a 24h voucher at 10 AM, it expires at 10 AM the next day, regardless of disconnects.

> [!IMPORTANT]
> **Set `Limit Uptime = 00:00:00` (zero) in ALL hotspot profiles.** If Limit Uptime is non-zero (e.g. `24:00:00`), MikroTik kills the session after that many *hours of usage*, ignoring the calendar timer. The On-Login script below handles real expiry — leave Limit Uptime at zero.
>
> **Go to: IP → Hotspot → User Profiles → double-click `default` → set `Limit Uptime = 00:00:00`**

1.  **On-Login Script**
    - Go to **IP** -> **Hotspot** -> **User Profiles**.
    - Double-click `default` (and any other profiles you use).
    - Go to **Scripts** tab.
    - In **On Login**, paste this script:

    ```bash
    :local user $user;
    :local totalValidity 0s;

    # Skip if a timer is already running (prevents double-scheduling on re-login)
    :if ([/system scheduler find name=$user] != "") do={
        :log info ("WiPay: Timer already active for " . $user);
    } else={

        # Tier 1: Read from Comment field (authoritative — set by WiPay server)
        # Format example: "validity:24h" or "validity:7d"
        :local comment [/ip hotspot user get [find name=$user] comment];
        :if ([:find $comment "validity:"] != -1) do={
            :set totalValidity [:totime [:pick $comment ([:find $comment "validity:"] + 9) [:len $comment]]];
        }

        # Tier 2: Fallback to limit-uptime field
        :if ($totalValidity = 0s) do={
            :set totalValidity [/ip hotspot user get [find name=$user] limit-uptime];
        }

        # Tier 3: Fallback to profile name pattern (e.g. "DAILY", "1h", "30d")
        :if ($totalValidity = 0s) do={
            :local profile [/ip hotspot user get [find name=$user] profile];
            :if ($profile ~ "1h")      do={ :set totalValidity 1h }
            :if ($profile ~ "6h")      do={ :set totalValidity 6h }
            :if ($profile ~ "12h")     do={ :set totalValidity 12h }
            :if ($profile ~ "24h" || $profile ~ "DAILY") do={ :set totalValidity 24h }
            :if ($profile ~ "7d"  || $profile ~ "WEEKLY") do={ :set totalValidity 7d }
            :if ($profile ~ "30d" || $profile ~ "MONTHLY") do={ :set totalValidity 30d }
        }

        # Schedule the cutoff if we found a validity period
        :if ($totalValidity > 0s) do={
            :log info ("WiPay: Starting " . $totalValidity . " calendar timer for " . $user);
            
            # 1. Add the real-time cutoff scheduler
            /system scheduler add name=$user interval=$totalValidity \
                on-event=("/ip hotspot active remove [find user=\\\"" . $user . "\\\"]; /ip hotspot user disable [find name=\\\"" . $user . "\\\"]; /system scheduler remove [find name=\\\"" . $user . "\\\"]")
            
            # 2. CLEAR the limit-uptime so they cannot "pause" the time anymore
            # This converts the Mikhmon uptime-limit into a hard calendar deadline
            /ip hotspot user set [find name=$user] limit-uptime=0s
        }
    }
    ```

2.  **One-Time Migration** — Force all currently active users to re-login so the script starts their timer:

    ```bash
    /ip hotspot active remove [find]
    ```

3.  **Daily Cleanup Script** — Remove expired/disabled users automatically.
    - Go to **System** -> **Scripts**. Create a script named `cleanup_expired`.
    - **Source**:

    ```bash
    /ip hotspot user {
        :foreach i in=[find where disabled=yes] do={
            remove $i
        }
    }
    ```

    - Go to **System** -> **Scheduler**.
    - Add a task: **Interval** = `1d 00:00:00`, **On Event** = `cleanup_expired`.

## Phase 12: Anti-Sharing (TTL) - _Highly Recommended_

This "Mangle" rule prevents users from "sharing" their internet via phone tethering or pocket routers. **Note**: We must scope this to the `bridge-lan` network so it doesn't break your VPN connection.

1. Go to **IP** -> **Firewall** -> **Mangle** tab.
2. Click **+** to add a new rule:
   - **Chain**: `postrouting`
   - **Src. Address**: `192.168.88.0/24` (Your Hotspot network)
   - **Out. Interface**: `ether1` (Your WAN/Internet port).
   - **Action**: `change TTL`
   - **New TTL**: `set:1`
3. Click **OK**.
4. Click **+** again for a second rule:
   - **Chain**: `prerouting`
   - **In. Interface**: `bridge-lan`
   - **Action**: `change TTL`
   - **New TTL**: `set:1`
5. Click **OK**.

> [!IMPORTANT]
> If you don't set the **Src. Address** in Rule 1, the router will try to set the VPN's "life" to 1, and the connection will die before it reaches the VPS.

---

## Troubleshooting & Critical Rules

### 1. The "Golden Rule" for New Routers

When you add Router 2, Router 3, etc., **ALWAYS** use:

- **Endpoint Address**: `84.46.253.72`
- **Endpoint Port**: `51820` (Never change this on the Peer side).
- **Listen Port**: `13231` (Find locally).

### 2. Clock Failed / "Waiting"?

If **System -> SNTP Client** stays on "Waiting", your ISP is blocking the Time Port (123).

- **FIX**: Go to **System -> Clock**.
- **Manually type** the correct Time and Date.
- **Why?** WireGuard **WILL NOT CONNECT** if the date is wrong (e.g., 1970). You _must_ set it manually if auto-update fails.

### 3. Locked Out / Blocked?

If you see "Connection Refused" or can't login:

- **Did you disable `www`?** Use **WinBox** app, not the Browser.
- **Did you set a Firewall Rule wrong?**
  1.  Open WinBox.
  2.  Instead of IP (192.168.88.1), look at the **Neighbors** tab.
  3.  Click the **MAC Address** (e.g., `D4:CA:6D:...`).
  4.  Click **Connect**.
  - _MAC Connection bypasses IP Firewall rules._
