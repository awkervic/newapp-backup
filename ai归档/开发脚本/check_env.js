const { execSync } = require('child_process');
const vcvars = "C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat";
try {
  const output = execSync(`"${vcvars}" && node -e "console.log(process.env.PATH.split(';').filter(p => p.toLowerCase().includes('msvc')))"`, { encoding: 'utf-8' });
  console.log('Result:\n', output);
} catch (e) {
  console.error('Error:\n', e.message);
}
