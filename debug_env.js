
require('dotenv').config();
console.log('--- ENV DEBUG START ---');
console.log('Current Directory:', process.cwd());
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD Length:', process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : 'UNDEFINED');
console.log('DB_PASSWORD Value:', process.env.DB_PASSWORD); // Safe to print locally for debugging
console.log('--- ENV DEBUG END ---');
