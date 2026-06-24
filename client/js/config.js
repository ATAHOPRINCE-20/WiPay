// Production Config
// For VPS Deployment, we must use the absolute URL if files are on the Router.
// Use the VPS IP: 84.46.253.72
const CONFIG = {
    API_BASE_URL: 'https://ugpay.tech/api'
};

// DEV OVERRIDE (For when you open the file locally on your laptop)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:') {
    console.warn("Running in Development Mode");
    CONFIG.API_BASE_URL = 'http://localhost:5002'; // Or your local server IP
}
