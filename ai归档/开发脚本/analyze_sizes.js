const fs = require('fs');
const path = require('path');

function getDirSize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (let i = 0; i < files.length; i++) {
      const filePath = path.join(dirPath, files[i]);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += stat.size;
      }
    }
  } catch (e) {
    // Ignore errors for permission or missing files
  }
  return size;
}

const nodeModulesPath = path.join('D:', '123123123123', 'newapp-backup', 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  const dirs = fs.readdirSync(nodeModulesPath);
  const results = [];
  for (const dir of dirs) {
    const fullPath = path.join(nodeModulesPath, dir);
    if (fs.statSync(fullPath).isDirectory()) {
      const size = getDirSize(fullPath);
      results.push({ name: dir, size });
    }
  }
  results.sort((a, b) => b.size - a.size);
  console.log('Top 20 directories in node_modules:');
  results.slice(0, 20).forEach(r => {
    console.log(`${r.name}: ${(r.size / 1024 / 1024).toFixed(2)} MB (${r.size} bytes)`);
  });
} else {
  console.log('node_modules not found at', nodeModulesPath);
}
