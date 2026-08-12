const fs = require('fs');
const path = require('path');

const filePath = 'c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP\\n8n_wf_bot_recheios.json';
try {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  
  let parsed = JSON.parse(content);
  const workflow = parsed.workflow || parsed;
  const nodes = workflow.nodes || [];
  
  nodes.forEach(node => {
    const nodeStr = JSON.stringify(node);
    if (nodeStr.includes('.pdf') || nodeStr.includes('Apostila')) {
      console.log(`Node Name: "${node.name}" | Type: ${node.type}`);
      if (node.parameters) {
        console.log('Parameters:', JSON.stringify(node.parameters, null, 2));
      }
    }
  });
} catch (err) {
  console.error(err);
}
