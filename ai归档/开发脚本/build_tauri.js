const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findVcvars64(dir) {
  if (!fs.existsSync(dir)) return null;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const found = findVcvars64(fullPath);
        if (found) return found;
      } else if (item.toLowerCase() === 'vcvars64.bat') {
        return fullPath;
      }
    } catch (e) {
      // Ignore errors
    }
  }
  return null;
}

const vsPaths = [
  'C:\\Program Files\\Microsoft Visual Studio',
  'C:\\Program Files (x86)\\Microsoft Visual Studio'
];

let vcvarsPath = null;
for (const dir of vsPaths) {
  vcvarsPath = findVcvars64(dir);
  if (vcvarsPath) break;
}

if (!vcvarsPath) {
  console.error('vcvars64.bat not found.');
  process.exit(1);
}

// Run node directly on the local tauri.js script to ensure 100% environment variables inheritance
const buildCommand = `"${vcvarsPath}" && set PATH=C:\\Users\\<USER>\\.cargo\\bin;%PATH% && node node_modules/@tauri-apps/cli/tauri.js build`;
console.log('Executing build command through direct node execution of tauri.js...');

try {
  execSync(buildCommand, {
    cwd: 'D:\\<PROJECT_DIR>\\newapp-backup',
    stdio: 'inherit'
  });
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
