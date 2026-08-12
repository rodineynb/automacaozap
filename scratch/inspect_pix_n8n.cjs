const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const filePath = path.join(rootDir, 'n8n_wf_j6mdUHmYdOSYXsxc.json');
const content = fs.readFileSync(filePath, 'utf8');

// Search for http requests near "pix"
let index = -1;
let count = 0;
while ((index = content.toLowerCase().indexOf('http', index + 1)) !== -1) {
  const start = Math.max(0, index - 300);
  const end = Math.min(content.length, index + 1000);
  const snippet = content.substring(start, end);
  if (snippet.toLowerCase().includes('pix')) {
    if (++count > 5) break;
    console.log(`=== MATCH ${count} ===`);
    console.log(snippet.trim());
    console.log('=====================\n');
  }
}
