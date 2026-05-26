const { execSync } = require('child_process');
const installer = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vs_installer.exe";
const installPath = "C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools";
const cmd = `"${installer}" modify --installPath "${installPath}" --add Microsoft.VisualStudio.Component.Windows11SDK.22000 --passive --norestart`;

console.log('Modifying Visual Studio to add Windows 11 SDK...');
try {
  execSync(cmd, { stdio: 'inherit' });
  console.log('Visual Studio Installer completed successfully!');
} catch (e) {
  console.error('Error running VS Installer:', e.message);
  process.exit(1);
}
