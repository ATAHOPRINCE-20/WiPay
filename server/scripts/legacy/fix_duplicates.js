require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixDuplicates() {
    try {
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected. Cleaning up duplicates...');

        // 1. Categories
        // Find duplicate names for each admin, keep the MIN(id)
        const [cats] = await conn.query(`
            DELETE c1 FROM categories c1
            INNER JOIN categories c2 
            WHERE c1.id > c2.id AND c1.name = c2.name AND c1.admin_id = c2.admin_id
        `);
        console.log(`Deleted ${cats.affectedRows} duplicate categories.`);

        // 2. Packages
        // Find duplicate names within same category (though category IDs might be different if they were duped)
        // Simpler approach: Delete packages that have same name and same admin, keeping MIN(id)
        const [pkgs] = await conn.query(`
            DELETE p1 FROM packages p1
            INNER JOIN packages p2
            WHERE p1.id > p2.id AND p1.name = p2.name AND p1.admin_id = p2.admin_id
        `);
        console.log(`Deleted ${pkgs.affectedRows} duplicate packages.`);

        conn.end();
    } catch (e) {
        console.error('Error:', e.message);
    }
}

fixDuplicates();
