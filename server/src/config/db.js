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
    connectionLimit: 100, // Increased for concurrency
    queueLimit: 0
});

module.exports = db;
