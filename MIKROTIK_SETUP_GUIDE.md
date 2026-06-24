# WiPay — MikroTik Hotspot Configuration Guide

This guide walks you through configuring your MikroTik router to connect to your central WiPay captive portal and FreeRADIUS server.

---

## Step 1: Ensure NTP (Clock) Synchronization
MikroTik's internal clock must match the real-world time, otherwise session limits and voucher expiries will fail.

### WinBox GUI Steps:
1. Go to **System** ➔ **SNTP Client**.
2. Check **Enabled**.
3. Set **Primary NTP Server**: `pool.ntp.org` (or IP `162.159.200.1`)
4. Set **Secondary NTP Server**: `time.google.com` (or IP `216.239.35.0`)
5. Click **Apply** and verify the clock changes in **System** ➔ **Clock**.

---

## Step 2: Configure the RADIUS Client
This tells the router to forward authentication requests to your central FreeRADIUS server.

### WinBox GUI Steps:
1. Click **RADIUS** in the left menu ➔ Click **`+` (Add)**.
2. Under the **General** tab:
   - Check **hotspot**.
   - **Address**: `<YOUR_VPS_PUBLIC_IP>` (The public IP of your RADIUS server).
   - **Secret**: `<YOUR_SHARED_SECRET>` (Must match the secret in your NAS table for this router).
   - **Timeout**: `3000ms`.
3. Under the **Incoming** tab:
   - Check **Accept**.
   - **Port**: `3799` (Required for Disconnect Messages / CoA).
4. Click **OK**.

---

## Step 3: Configure the Hotspot Server Profile
This tells MikroTik to request credentials via RADIUS instead of using its local database.

### WinBox GUI Steps:
1. Go to **IP** ➔ **Hotspot** ➔ **Server Profiles** tab.
2. Select or create your profile (e.g. `hsprof1`).
3. Under the **Login** tab:
   - Check **HTTP PAP** (Do **NOT** check Cookie, HTTP CHAP, or HTTPS).
4. Under the **RADIUS** tab:
   - Check **Use RADIUS**.
   - **Accounting**: Check this.
   - **Interim Update**: `00:05:00` (Sends session updates to the backend every 5 minutes).
5. Click **OK**.

---

## Step 4: Create the Redirect `login.html` File
Create a file named `login.html` on your computer and paste the following redirect code:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=http://<YOUR_CENTRAL_DOMAIN>/captive-portal?slug=<YOUR_PORTAL_SLUG>&link-login=$(link-login-only)&mac=$(mac)&ip=$(ip)&link-orig=$(link-orig-esc)" />
    <title>Redirecting to WiPay...</title>
</head>
<body>
    <div style="font-family: sans-serif; text-align: center; margin-top: 100px; color: #4B5563;">
        <p style="font-weight: bold;">Connecting to Wi-Fi Portal...</p>
        <p style="font-size: 14px;">If you are not redirected automatically, <a href="http://<YOUR_CENTRAL_DOMAIN>/captive-portal?slug=<YOUR_PORTAL_SLUG>&link-login=$(link-login-only)&mac=$(mac)&ip=$(ip)&link-orig=$(link-orig-esc)">click here</a>.</p>
    </div>
</body>
</html>
```

### ✏️ Placeholders to Replace:
* `<YOUR_CENTRAL_DOMAIN>`: Your central portal domain (e.g., `wifi.ugpay.tech` or `127.0.0.1:5173` for local testing).
* `<YOUR_PORTAL_SLUG>`: Your specific admin portal slug (e.g., `wp_7099a6f4865e`).

### Upload Steps:
1. In WinBox, click **Files** on the left menu.
2. Locate the **`hotspot`** directory.
3. Drag and drop your `login.html` file into that folder to overwrite the default login file.

---

## Step 5: Configure the Walled Garden
You must allow unauthenticated users to reach your central portal domain and the payment gateways, otherwise they cannot access the payment screens.

### WinBox GUI Steps:
1. Go to **IP** ➔ **Hotspot** ➔ **Walled Garden** tab.
2. Click **`+` (Add)**:
   - **Dst. Host**: `<YOUR_CENTRAL_DOMAIN>` (e.g., `wifi.ugpay.tech`)
   - **Action**: `allow`
3. Click **`+` (Add)** again:
   - **Dst. Host**: `*.relworx.com` (Allows payment gateway requests)
   - **Action**: `allow`
4. Click **`+` (Add)** again:
   - **Dst. Host**: `*.googleapis.com` & `*.gstatic.com`
   - **Action**: `allow`

---

## Step 6: CLI Configuration Script (Fast Setup)
Alternatively, you can open the **New Terminal** in WinBox, modify the variables, and paste the following script to configure everything in seconds:

```routeros
# --- Configuration Variables ---
:local vpsIp "YOUR_VPS_PUBLIC_IP"
:local radiusSecret "YOUR_SHARED_SECRET"
:local centralDomain "wifi.ugpay.tech"

# 1. Enable SNTP Client for Time Sync
/system ntp client set enabled=yes primary-ntp=162.159.200.1 secondary-ntp=216.239.35.0

# 2. Add RADIUS server configuration
/radius add service=hotspot address=$vpsIp secret=$radiusSecret timeout=3s comment="WiPay RADIUS Server"
/radius incoming set accept=yes port=3799

# 3. Apply RADIUS settings to the Hotspot Server Profile (assuming hsprof1)
/ip hotspot profile set hsprof1 use-radius=yes login-by=http-pap rate-limit=""

# 4. Enable Accounting Interim updates
/ip hotspot profile set hsprof1 radius-interim-update=5m

# 5. Allow Walled Garden Access to Portal and Gateway
/ip hotspot walled-garden add dst-host=$centralDomain action=allow comment="Allow Central Portal"
/ip hotspot walled-garden add dst-host="*.relworx.com" action=allow comment="Allow Relworx Payment Gateway"
/ip hotspot walled-garden add dst-host="*.googleapis.com" action=allow comment="Allow Google Fonts"
/ip hotspot walled-garden add dst-host="*.gstatic.com" action=allow comment="Allow Google Assets"
```
