const { execSync } = require('child_process');
const vcvars = "C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat";
try {
  const output = execSync(`"${vcvars}" && where link`, { encoding: 'utf-8' });
  console.log('Result:\n', output);
} catch (e) {
  console.error('Error:\n', e.message);
}
