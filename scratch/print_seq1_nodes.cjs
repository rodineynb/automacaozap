const fs = require('fs');
const path = require('path');

const filePath = path.join('c:', 'Users', 'Note', 'Desktop', 'Antigravity', 'AutomacaoZAP', 'n8n_wf_seq1_recheios.json');
if (!fs.existsSync(filePath)) {
  console.log('File does not exist');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
let workflowData;
const lines = content.split('\n');
const dataLine = lines.find(l => l.startsWith('data: '));
if (!dataLine) {
  console.log('No data line');
  process.exit(1);
}

const jsonStr = dataLine.substring(6).trim();
const parsed = JSON.parse(jsonStr);
const textContent = parsed.result.content[0].text;
workflowData = JSON.parse(textContent);

const nodes = workflowData.workflow?.nodes || workflowData.nodes || [];
nodes.forEach(node => {
  if (node.type === 'n8n-nodes-base.httpRequest' || JSON.stringify(node.parameters).includes('http')) {
    console.log(`\nNode: "${node.name}" (${node.type})`);
    console.log(`  URL: ${node.parameters?.url}`);
    console.log(`  Method: ${node.parameters?.method}`);
    console.log(`  Headers:`, node.parameters?.headers?.parameters || node.parameters?.headerParameters);
    console.log(`  Body Parameters:`, node.parameters?.bodyParameters?.parameters);
  }
});
