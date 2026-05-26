const fs = require('fs');
const path = require('path');

function searchFile(dir, fileName) {
  if (!fs.existsSync(dir)) return [];
  let found = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        found.push(...searchFile(fullPath, fileName));
      } else if (item.toLowerCase() === fileName.toLowerCase()) {
        found.push(fullPath);
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return found;
}

const searchPaths = [
  'C:\\Program Files (x86)\\Microsoft Visual Studio',
  'C:\\Program Files\\Microsoft Visual Studio',
  'C:\\Program Files (x86)\\Windows Kits',
  'C:\\Program Files\\Windows Kits'
];

console.log('Searching for kernel32.lib...');
let results = [];
for (const p of searchPaths) {
  results.push(...searchFile(p, 'kernel32.lib'));
}

console.log('Found results:');
results.forEach(r => console.log(r));
