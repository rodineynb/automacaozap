const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP';
const files = fs.readdirSync(dir).filter(f => f.startsWith('n8n_') && f.endsWith('.json'));

files.forEach(file => {
  try {
    let content = fs.readFileSync(path.join(dir, file), 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      const lines = content.split('\n');
      const dataLine = lines.find(l => l.startsWith('data: '));
      if (dataLine) {
        const textContent = JSON.parse(dataLine.substring(6)).result.content[0].text;
        parsed = JSON.parse(textContent);
      }
    }
    
    if (!parsed) return;
    const workflow = parsed.workflow || parsed;
    const nodes = workflow.nodes || [];
    
    nodes.forEach(node => {
      const nodeStr = JSON.stringify(node);
      if (nodeStr.includes('.pdf') || nodeStr.includes('Apostila')) {
        if (node.type === 'n8n-nodes-base.httpRequest') {
          console.log(`File: ${file} | Node Name: "${node.name}" | Type: ${node.type}`);
          console.log(`  URL: ${node.parameters?.url}`);
          console.log(`  Body:`, JSON.stringify(node.parameters?.bodyParameters || node.parameters?.body || node.parameters, null, 2));
          console.log('---');
        }
      }
    });
  } catch (err) {
    // ignore
  }
});
