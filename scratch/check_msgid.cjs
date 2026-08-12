const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP\\workers\\routes\\chat.ts', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('let msgId')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
