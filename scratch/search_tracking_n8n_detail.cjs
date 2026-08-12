const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const filePath = path.join(rootDir, 'n8n_wf_bot_recheios.json');
const content = fs.readFileSync(filePath, 'utf8');

const keywords = ['ctwaClid', 'externalAdReply', 'contextInfo'];
for (const kw of keywords) {
  let index = -1;
  let count = 0;
  while ((index = content.indexOf(kw, index + 1)) !== -1) {
    if (++count > 5) break;
    const start = Math.max(0, index - 120);
    const end = Math.min(content.length, index + kw.length + 120);
    const snippet = content.substring(start, end).replace(/\r?\n/g, ' ');
    console.log(`Found "${kw}" near: ... ${snippet.trim()} ...`);
  }
}
