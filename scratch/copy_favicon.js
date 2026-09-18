const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../wipay-frontend/public/img/wi-fi 3d.jpg');
const dest = path.join(__dirname, '../wipay-frontend/public/favicon.ico');

if (fs.existsSync(src)) {
  fs.copyFileSync(src, dest);
  console.log('Successfully set favicon.ico to 3D Wi-Fi icon!');
}
