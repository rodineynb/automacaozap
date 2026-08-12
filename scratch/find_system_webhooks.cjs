const fs = require('fs');
const path = require('path');

const rootDir = 'c:/Users/Note/Desktop/Antigravity/AutomacaoZAP';
const files = fs.readdirSync(rootDir);

console.log('Searching for http nodes...');

files.forEach(file => {
  if (file.endsWith('.json') && file.startsWith('n8n_')) {
    const filePath = path.join(rootDir, file);
    try {
      let content = fs.readFileSync(filePath, 'utf8');
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
          const jsonStr = dataLine.substring(6);
          const wrapped = JSON.parse(jsonStr);
          const textContent = wrapped.result.content[0].text;
          parsed = JSON.parse(textContent);
        }
      }
      
      if (!parsed) return;
      
      const workflow = parsed.workflow || parsed;
      const nodes = workflow.nodes || [];
      
      nodes.forEach(node => {
        const nodeStr = JSON.stringify(node).toLowerCase();
        if (node.type === 'n8n-nodes-base.httpRequest') {
          const url = node.parameters?.url || '';
          if (!url.includes('uazapi.com') && !url.includes('facebook') && !url.includes('evolution')) {
            console.log(`\nFile: ${file} | Node: "${node.name}" | Type: ${node.type}`);
            console.log(`URL: ${url}`);
            console.log(`Parameters:`, JSON.stringify(node.parameters, null, 2));
          }
        }
      });
    } catch (e) {
      // ignore
    }
  }
});
