const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, '../wipay-frontend/public/img/wi-fi 3d.jpg');

const targets = [
  path.join(__dirname, '../wipay-frontend/public/img/ugpay-logo.jpg'),
  path.join(__dirname, '../wipay-frontend/public/img/ugpay-logo.png'),
  path.join(__dirname, '../wipay-frontend/public/img/app-icon.png'),
  path.join(__dirname, '../wipay-frontend/public/img/favicon.ico'),
  path.join(__dirname, '../client/img/wi-fi 3d.jpg'),
  path.join(__dirname, '../client/img/ugpay-logo.jpg'),
  path.join(__dirname, '../client/img/ugpay-logo.png')
];

if (fs.existsSync(srcFile)) {
  targets.forEach(target => {
    fs.copyFileSync(srcFile, target);
    console.log('Copied to:', target);
  });
  console.log('Brand logo update complete!');
} else {
  console.error('Source file wi-fi 3d.jpg not found at:', srcFile);
}
