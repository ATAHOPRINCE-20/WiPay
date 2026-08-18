const mysql = require('mysql2');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('DB Config:', {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    port: process.env.DB_PORT || 3306,
    hasPassword: !!(process.env.DB_PASSWORD || process.env.DB_PASS)
});

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS, // Try both
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    }
    console.log('Connected to MySQL');

    const addColumnQuery = `
        ALTER TABLE packages
        ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1;
    `;

    db.query(addColumnQuery, (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('Column is_active already exists.');
            } else {
                console.error('Error adding column:', err);
                process.exit(1);
            }
        } else {
            console.log('Successfully added is_active column to packages table.');
        }
        db.end();
    });
});
