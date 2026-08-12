const fs = require('fs');
const path = require('path');

const file = 'n8n_wf_bot_recheios.json';
const filePath = path.join('c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP', file);

try {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // Try to parse SSE format
    const lines = content.split('\n');
    const dataLine = lines.find(l => l.trim().startsWith('data: '));
    if (dataLine) {
      const jsonStr = dataLine.trim().substring(6);
      const wrapped = JSON.parse(jsonStr);
      
      // If it has result.content[0].text
      const textContent = wrapped.result?.content?.[0]?.text || wrapped.content;
      parsed = JSON.parse(textContent);
    }
  }
  
  if (!parsed) {
    console.log('Failed to parse n8n file.');
    process.exit(1);
  }
  
  const workflow = parsed.workflow || parsed;
  const nodes = workflow.nodes || [];
  
  nodes.forEach(node => {
    const str = JSON.stringify(node);
    if (str.toLowerCase().includes('download')) {
      console.log(`\n========================================`);
      console.log(`Node Name: "${node.name}"`);
      console.log(`Node Type: ${node.type}`);
      console.log(`Parameters:`, JSON.stringify(node.parameters, null, 2));
    }
  });
} catch (err) {
  console.error('Error running script:', err);
}
