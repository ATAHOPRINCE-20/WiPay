const mysql = require('mysql2/promise');
require('dotenv').config(); // Ensure env vars are loaded

console.log('Database connected.');

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 30, // Optimized to prevent MySQL ER_CON_COUNT_ERROR
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

module.exports = db;

