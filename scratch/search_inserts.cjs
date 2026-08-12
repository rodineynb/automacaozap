const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== 'node_modules' && f !== '.git' && f !== '.gemini' && f !== 'dist' && f !== 'build') {
        walkDir(dirPath, callback);
      }
    } else {
      callback(dirPath);
    }
  });
}

const searchPattern = /INSERT\s+INTO\s+messages/gi;

walkDir('c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP\\workers', (filePath) => {
  if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (searchPattern.test(line)) {
        console.log(`${filePath}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
});
