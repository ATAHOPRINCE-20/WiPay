const mysql = require('mysql2/promise');
require('dotenv').config();
const dbConfig = {
    host: 'localhost', user: 'root', password: '', database: 'wipay'
};
(async () => {
    try {
        const conn = await mysql.createConnection(dbConfig);
        const [rows] = await conn.query('SHOW COLUMNS FROM withdrawals');
        console.log(JSON.stringify(rows));
        await conn.end();
    } catch (e) { console.error(e); }
})();
