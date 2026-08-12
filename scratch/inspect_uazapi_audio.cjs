const fs = require('fs');

const files = [
  'c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP\\n8n_wf_bot_recheios.json',
  'c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP\\n8n_wf_seq1_recheios.json'
];

files.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  console.log(`\n=== SEARCHING AUDIO NODES IN ${filePath} ===`);
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
    }
  }
  
  const nodes = parsed.nodes || parsed.workflow?.nodes || [];
  nodes.forEach(node => {
    const nodeStr = JSON.stringify(node).toLowerCase();
    if (nodeStr.includes('audio') || nodeStr.includes('.mp3') || nodeStr.includes('.ogg') || nodeStr.includes('.oga')) {
      console.log(`Node Name: "${node.name}" | Type: ${node.type}`);
      if (node.parameters) {
        console.log('Parameters:', JSON.stringify(node.parameters, null, 2));
      }
      console.log('------------------------');
    }
  });
});
