const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'Note', 'Desktop', 'Antigravity', 'AutomacaoZAP', 'n8n_wf_seq1_recheios.json');
const content = fs.readFileSync(filePath, 'utf8');
console.log('First 500 characters:');
console.log(content.substring(0, 500));
