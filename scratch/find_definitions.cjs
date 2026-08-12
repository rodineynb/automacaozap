const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP\\workers\\automations\\recheios\\tools.ts', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('TOOL_DEFINITIONS')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
