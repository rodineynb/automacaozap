const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const files = fs.readdirSync(rootDir);

console.log('Searching for "pix" case-insensitive near URL structures...');

for (const file of files) {
  if (file.endsWith('.json') || file.endsWith('.js') || file.endsWith('.cjs') || file.endsWith('.ts')) {
    if (file.includes('node_modules') || file.includes('.git') || file.includes('.react-router')) continue;
    const filePath = path.join(rootDir, file);
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) continue;
      
      const content = fs.readFileSync(filePath, 'utf8');
      
      let index = -1;
      let count = 0;
      const kw = 'pix';
      while ((index = content.toLowerCase().indexOf(kw, index + 1)) !== -1) {
        // Only print if there is a URL indicator near
        const start = Math.max(0, index - 150);
        const end = Math.min(content.length, index + kw.length + 150);
        const snippet = content.substring(start, end).replace(/\r?\n/g, ' ');
        if (snippet.includes('http') || snippet.includes('/') || snippet.includes('send') || snippet.includes('api')) {
          if (++count > 5) break;
          console.log(`[${file}] Found "${kw}" near: ... ${snippet.trim()} ...`);
        }
      }
    } catch (e) {
      // ignore
    }
  }
}
