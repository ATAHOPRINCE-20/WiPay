const fs = require('fs');
const path = require('path');

// Read icon.svg
const svgPath = path.join(__dirname, '../wipay-frontend/public/img/icon.svg');
const destPng = path.join(__dirname, '../wipay-frontend/public/img/app-icon.png');
const destPng512 = path.join(__dirname, '../wipay-frontend/public/img/app-icon-512.png');
const clientPng = path.join(__dirname, '../client/img/app-icon.png');

if (fs.existsSync(svgPath)) {
  fs.copyFileSync(svgPath, destPng);
  fs.copyFileSync(svgPath, destPng512);
  fs.copyFileSync(svgPath, clientPng);
  console.log('Successfully copied app-icon files!');
}
