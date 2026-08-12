const fs = require('fs');

const file1 = 'c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP\\n8n_wf_bot_recheios.json';
const file2 = 'c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP\\n8n_wf_seq1_recheios.json';

function searchFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  console.log(`=== Inspecting ${filePath} ===`);
  const content = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.log("Could not parse as standard JSON directly.");
    return;
  }
  const nodes = parsed.nodes || parsed.workflow?.nodes || [];
  nodes.forEach(node => {
    const nodeStr = JSON.stringify(node);
    if (nodeStr.includes('audio') || nodeStr.includes('Audio') || nodeStr.includes('.mp3')) {
      console.log(`Node Name: "${node.name}" | Type: ${node.type}`);
      if (node.parameters) {
        console.log('Parameters:', JSON.stringify(node.parameters, null, 2));
      }
      console.log('------------------------');
    }
  });
}

searchFile(file1);
searchFile(file2);
