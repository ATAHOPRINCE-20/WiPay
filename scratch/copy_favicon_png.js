const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../wipay-frontend/public/img/favicon.png');
const destClient = path.join(__dirname, '../client/img/favicon.png');
const destPublicRoot = path.join(__dirname, '../wipay-frontend/public/favicon.png');

if (fs.existsSync(src)) {
  fs.copyFileSync(src, destClient);
  fs.copyFileSync(src, destPublicRoot);
  console.log('Successfully copied favicon.png to client and public folders!');
} else {
  console.error('Source favicon.png not found at:', src);
}
