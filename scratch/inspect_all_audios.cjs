const fs = require('fs');
const path = require('path');

const files = [
  'n8n_wf_bot_recheios.json',
  'n8n_wf_seq1_recheios.json',
  'n8n_wf_UrXnsr5pPIPzda8wntRx4.json',
  'n8n_wf_FOqcYYL5ALLKp5d6Fx-48.json',
  'n8n_wf_HnnZxGG3iGTW7e1L84a3j.json',
  'n8n_wf_j6mdUHmYdOSYXsxc.json',
  'n8n_wf_clGjYvzwkeSmhIX4.json',
  'n8n_wf_kDkoUC8Mchs0XQFg.json'
];

files.forEach(fileName => {
  const filePath = path.join('c:', 'Users', 'Note', 'Desktop', 'Antigravity', 'AutomacaoZAP', fileName);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const lines = content.split('\n');
    const dataLine = lines.find(l => l.startsWith('data: '));
    if (dataLine) {
      const jsonStr = dataLine.substring(6).trim();
      const wrapped = JSON.parse(jsonStr);
      const textContent = wrapped.result.content[0].text;
      parsed = JSON.parse(textContent);
    } else {
      return;
    }
  }

  const nodes = parsed.nodes || parsed.workflow?.nodes || [];
  nodes.forEach(node => {
    const nodeStr = JSON.stringify(node).toLowerCase();
    if (nodeStr.includes('/audio') || nodeStr.includes('audio') || nodeStr.includes('.mp3') || nodeStr.includes('.ogg')) {
      if (node.type === 'n8n-nodes-base.httpRequest') {
        console.log(`\n[${fileName}] Node: "${node.name}"`);
        console.log(`  URL: ${node.parameters?.url}`);
        console.log(`  Method: ${node.parameters?.method}`);
        console.log(`  Headers:`, JSON.stringify(node.parameters?.headers || node.parameters?.headerParameters));
        console.log(`  Body:`, JSON.stringify(node.parameters?.bodyParameters || node.parameters?.jsonBody || node.parameters?.jsonParameters));
      }
    }
  });
});
