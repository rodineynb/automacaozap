const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const files = fs.readdirSync(rootDir);

console.log('Searching for PIX endpoints in N8N files...');

for (const file of files) {
  if (file.startsWith('n8n_') && file.endsWith('.json')) {
    const filePath = path.join(rootDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    let index = -1;
    let count = 0;
    const kw = '/pix';
    while ((index = content.toLowerCase().indexOf(kw, index + 1)) !== -1) {
      if (++count > 10) break;
      const start = Math.max(0, index - 120);
      const end = Math.min(content.length, index + kw.length + 120);
      const snippet = content.substring(start, end).replace(/\r?\n/g, ' ');
      console.log(`[${file}] Found "${kw}" near: ... ${snippet.trim()} ...`);
    }
  }
}
