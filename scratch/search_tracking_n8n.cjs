const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const files = fs.readdirSync(rootDir);

console.log('Searching for tracking fields in N8N files...');

for (const file of files) {
  if (file.startsWith('n8n_') && file.endsWith('.json')) {
    const filePath = path.join(rootDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Search for keywords
    const keywords = ['ctwaclid', 'referral', 'fbclid', 'clid', 'ctwa'];
    for (const kw of keywords) {
      let index = -1;
      let count = 0;
      while ((index = content.indexOf(kw, index + 1)) !== -1) {
        if (++count > 5) break; // limit to 5 per file
        const start = Math.max(0, index - 80);
        const end = Math.min(content.length, index + kw.length + 80);
        const snippet = content.substring(start, end).replace(/\r?\n/g, ' ');
        console.log(`[${file}] Found "${kw}" near: ... ${snippet.trim()} ...`);
      }
    }
  }
}
