const fs = require('fs');
const path = require('path');

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
      const jsonStr = dataLine.substring(6);
      const wrapped = JSON.parse(jsonStr);
      // Try to get text content from Gemini artifact format if wrapped
      const textContent = wrapped.result?.content?.[0]?.text || wrapped.result || wrapped;
      parsed = JSON.parse(textContent);
    } else {
      // Try to parse clean line-by-line or regex
      throw new Error('Not normal JSON and no data: prefix');
    }
  }
  
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
  console.error('Error parsing:', err);
}
