# UGPAY (WiFi Billing System)

UGPAY is a robust, multi-tenant WiFi billing and management system designed for ISPs and Hotspot owners in Uganda. It allows admins to manage packages, sell vouchers, and accept Mobile Money payments automated via Relworx.

## 🚀 Features (Version 1.1)

### 🖥️ Admin Dashboard

- **Router Analytics & Filtering**: Filter transactions, statistics, and charts by specific Router ID. Perfect for multi-location management.
- **Security**: Secure Login with JWT authentication, error toasts, and auto-redirection.
- **UI/UX**: Dark mode aesthetic, responsive design with **Mobile Hamburger Menu** and **Desktop Sidebar Toggle**.
- **Performance**: **Client-side caching** for instant smooth navigation between views.

### 💰 Payment & Finance

- **SMS Integration**: Purchase SMS credits via Relworx Mobile Money.
- **Improved Modal UX**: **Background Polling** allows you to minimize the payment modal and continue working while waiting for confirmation.
- **Real-time Stats**: Track Daily/Weekly Revenue, Voucher Sales, and SMS Balance instantly.
- **Detailed History**: Filter transaction history by Router to see exactly where revenue is coming from.

### 🎟️ Voucher & Package Management

- **Packages**: Create, Edit, and Delete internet packages (Time & Data limits).
- **Bulk Import**: Upload large CSV files securely (Server-side streaming) to generate thousands of vouchers.
- **Smart Sales**: "Sell Voucher" modal allows sending voucher codes directly to a client's phone via SMS.
- **Logic**: Vouchers are now linked to specific packages and track "Is Used" status.

### ⚙️ System

- **Multi-Tenancy**: Single instance supports multiple router admins.
- **Router Management**: Add/Edit/Delete Routers and link them to MikroTik instances.
- **Frontend/Backend Separation**: Clean architecture with separate `client` and `server` directories for scalable deployment.

## 📂 Project Structure

Verified Professional Structure:

- `client/`: **Frontend** (HTML, CSS, JS). Deployed to `/var/www/wipay-client/`
- `server/`: **Backend** (Node.js, Express). Deployed to `/var/www/wipay-server/`
- `scripts/`: Setup and utility scripts.
- `server.js`: Main application entry point.

## 🛠️ Getting Started

### Prerequisites

- Node.js (v14+)
- MySQL Server

### Installation

1.  **Clone the repository**

    ```bash
    git clone https://github.com/ATAHOPRINCE-20/WiPay.git
    cd WIPAY
    ```

2.  **Install Backend Dependencies**

    ```bash
    cd server
    npm install
    cd ..
    ```

3.  **Configure Environment**
    Create a `.env` file in the `server/` directory:

    ```env
    PORT=5002
    DB_HOST=localhost
    DB_USER=root
    DB_PASS=
    DB_NAME=wipay
    JWT_SECRET=your_jwt_secret
    RELWORX_API_KEY=your_key
    RELWORX_ACCOUNT_NO=your_acc_no
    UGSMS_USERNAME=your_sms_user
    UGSMS_PASSWORD=your_sms_pass
    ```

4.  **Setup Database**
    Run the setup script:

    ```bash
    node scripts/setup_multitenancy.js
    ```

5.  **Create Admin Account**
    ```bash
    node scripts/create_admin.js myadmin securepassword
    ```

### ▶️ Running the Application

Start the server:

```bash
cd server
node server.js
```

- **Public Portal**: `http://localhost:5002`
- **Admin Dashboard**: `http://localhost:5002/dashboard.html` (Login required)

## 📡 Deployment (VPS)

1.  **Frontend**: Upload contents of `client/` to Nginx root (e.g., `/var/www/wipay-client/`).
2.  **Backend**: Upload contents of `server/` to `/var/www/wipay-server/`.
3.  **Process Management**: Use PM2 to run the backend:
    ```bash
    pm2 start server/server.js --name wipay-backend
    ```
4.  **Nginx Config**: Proxy API requests (`/api`) to `localhost:5002` and serve static files from `wipay-client`.

---

_Maintained by Garuga IT Team._
