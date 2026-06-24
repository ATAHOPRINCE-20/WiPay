# WiPay System Documentation

**WiPay (Garuga Spot)** is a multi-tenant Wi-Fi monetization platform. It enables admins (Tenants) to sell Wi-Fi vouchers to customers via Mobile Money or Cash.

---

## 1. System Architecture

The application follows a **Monolithic Client-Server Architecture**.

### 1.1 The Frontend (Client)
*   **Technology**: React (Vite).
*   **Location**: `wipay-frontend/` folder.
*   **Deployment**: `/var/www/wipay-client/`
*   **Role**:
    *   **Public Portal**: Customers select packages and pay via Mobile Money.
    *   **Admin Interface**: Admins manage vouchers, routers, view sales stats.

### 1.2 The Backend (Server)
*   **Technology**: Node.js (Express framework).
*   **Location**: `server/` folder.
*   **Deployment**: `/var/www/wipay-server/`
*   **Entry Point**: `server.js` (Port 5002).
*   **Role**: Handles Business Logic, Database interactions, and 3rd Party APIs.

### 1.3 The Database
*   **Technology**: MySQL.
*   **Key Tables**:
    *   `admins`: User accounts and billing settings.
    *   `routers`: Managing different router instances.
    *   `vouchers`: Wi-Fi codes (linked to packages).
    *   `transactions`: Log of all Mobile Money payments (now with `router_id`).
    *   `sms_fees`: **The Ledger** for SMS credits (Deposit vs Usage).

---

## 2. Key Features & Workflows

### 2.1 Multi-Tenancy & Router Management
*   Each Admin (Tenant) has their own "Space".
*   Admins can add multiple **Routers** (e.g., "Main Branch", "Cafe Spot") and link them to Mikrotik instance.
*   Transactions are tagged with `router_id`, allowing granular filtering of revenue and sales.

### 2.2 Payment Processing (Mobile Money)
*   **Provider**: Relworx API.
*   **Flow**:
    1.  User enters Phone Number on `index.html`.
    2.  Server initiates payment (tagged with `router_id`).
    3.  **Verification**:
        *   **Webhook**: Relworx notifies Server (Updates status instantly).
        *   **Active Polling**: If Webhook fails (e.g., Localhost), Frontend asks Server to manually check Relworx status.
    4.  **Completion**: On success, a voucher is allocated and sent via SMS.

### 2.3 SMS & Voucher System
*   **Selling Vouchers**:
    *   Admins can "Sell" a voucher manually from the Dashboard.
    *   **Cost**: Each sale deducts **35 UGX** from the Admin's `sms_fees` wallet.
*   **Buying SMS Credits**:
    *   Admins "Top Up" their SMS wallet using Mobile Money.
    *   **UX**: Background polling allows minimizing the modal while waiting for payment.

### 2.4 Admin Dashboard
*   **Real-Time Context**:
    *   **Router Filtering**: Dropdown to filter all stats/charts by specific router.
    *   **Auto-Refresh**: Views update every 10 seconds.
*   **Financials**:
    *   Tracks Daily, Weekly, Monthly, and Yearly Revenue.
    *   Calculates `Net Balance` (Revenue - Withdrawals).

---

## 3. Directory Structure

```text
WIPAY/
├── wipay-frontend/          # [Frontend - React]
│   └── dist/                # Built static files
│
├── server/                  # [Backend]
│   ├── server.js            # Entry Point (CORS, Rate Limiting)
│   ├── .env                 # API Keys & Secrets
│   ├── src/
│   │   ├── config/db.js     # MySQL Connection
│   │   ├── middleware/      # Auth & Security
│   │   └── routes/          # API Instructions
│   │       ├── adminRoutes.js   # Core Logic (Vouchers, SMS, Stats)
│   │       ├── paymentRoutes.js # Relworx Integration
│   │       └── authRoutes.js    # Login/JWT
│   └── scripts/             # Maintenance Tools
```

---

## 4. API Reference

### Public Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/packages` | Public list of internet packages. |
| `POST` | `/api/purchase` | Initiate Mobile Money payment (Requires `router_id`). |
| `POST` | `/api/check-payment-status` | Poll for payment completion. |

### Admin Endpoints (Protected)
*Headers: `Authorization: Bearer <token>`*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/admin/sell-voucher` | Sell voucher & Send SMS (-35 SMS Fee). |
| `POST` | `/api/admin/buy-sms` | Top up SMS wallet. |
| `GET` | `/api/admin/routers` | List all routers. |
| `GET` | `/api/admin/stats` | Get financial reports (Supports `?router_id=X`). |

---

## 5. Security Measures

1.  **Rate Limiting**:
    *   Global Limit: 3000 requests / 15 mins (Accommodates Auto-Refresh).
    *   Login Limit: 10 attempts / hour (Brute-force protection).
2.  **Transactions**:
    *   MySQL Transactions (`BEGIN` ... `COMMIT`) prevent race conditions when selling vouchers.
3.  **Authentication**:
    *   JWT (JSON Web Tokens) used for all protected routes.

---

## 6. How to Run

1.  **Database**: Start MySQL. Run `node server/scripts/setup_multitenancy.js`.
2.  **Server**:
    ```bash
    cd server
    npm install
    node server.js
    ```
3.  **Client**: Open `http://localhost:5002` in your browser.
