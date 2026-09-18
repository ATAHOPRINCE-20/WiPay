const fs = require('fs');
const path = require('path');

const publicRootFav = path.join(__dirname, '../wipay-frontend/public/favicon.ico');
const publicRootPng = path.join(__dirname, '../wipay-frontend/public/favicon.png');
const publicImgPng  = path.join(__dirname, '../wipay-frontend/public/img/favicon.png');
const clientImgPng  = path.join(__dirname, '../client/img/favicon.png');

let newestSource = null;
let maxMtime = 0;

[publicRootFav, publicRootPng, publicImgPng].forEach(file => {
  if (fs.existsSync(file)) {
    const stat = fs.statSync(file);
    if (stat.mtimeMs > maxMtime) {
      maxMtime = stat.mtimeMs;
      newestSource = file;
    }
  }
});

if (newestSource) {
  console.log('Syncing newest favicon from:', newestSource);
  try {
    fs.copyFileSync(newestSource, publicRootFav);
    fs.copyFileSync(newestSource, publicRootPng);
    fs.copyFileSync(newestSource, publicImgPng);
    fs.copyFileSync(newestSource, clientImgPng);
    console.log('All favicon locations synced successfully!');
  } catch (err) {
    console.error('Copy error:', err.message);
  }
} else {
  console.log('No favicon found to sync.');
}
