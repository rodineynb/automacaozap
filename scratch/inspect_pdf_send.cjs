const fs = require('fs');

const filePath = 'c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP\\n8n_wf_bot_recheios.json';
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
      parsed = JSON.parse(JSON.parse(dataLine.substring(6)).result.content[0].text);
    }
  }
  
  const workflow = parsed.workflow || parsed;
  const nodes = workflow.nodes || [];
  
  nodes.forEach(node => {
    const nodeStr = JSON.stringify(node);
    if (nodeStr.includes('.pdf') && (node.type.includes('httpRequest') || node.type.includes('whatsapp'))) {
      console.log(`Node Name: "${node.name}" | Type: ${node.type}`);
      console.log('URL:', node.parameters?.url);
      console.log('Body Parameters:', JSON.stringify(node.parameters?.bodyParameters || node.parameters?.body || node.parameters, null, 2));
      console.log('---');
    }
  });
} catch (err) {
  console.error(err);
}
