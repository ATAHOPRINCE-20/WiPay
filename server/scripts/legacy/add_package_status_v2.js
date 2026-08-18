const db = require('../src/config/db');

async function runMigration() {
    try {
        console.log('Starting migration...');
        const addColumnQuery = `
            ALTER TABLE packages
            ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1;
        `;

        await db.query(addColumnQuery);
        console.log('Successfully added is_active column to packages table.');
    } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Column is_active already exists.');
        } else {
            console.error('Migration failed:', err);
            process.exit(1);
        }
    } finally {
        // Close the pool to allow script to exit
        await db.end();
    }
}

runMigration();
