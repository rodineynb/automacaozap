const fs = require('fs');
const path = require('path');

function inspectWorkflow(fileName) {
  const filePath = path.join('c:', 'Users', 'Note', 'Desktop', 'Antigravity', 'AutomacaoZAP', fileName);
  if (!fs.existsSync(filePath)) return;
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    let workflowData;
    const lines = content.split('\n');
    const dataLine = lines.find(l => l.startsWith('data: '));
    if (!dataLine) return;
    
    const jsonStr = dataLine.substring(6).trim();
    const parsed = JSON.parse(jsonStr);
    const textContent = parsed.result.content[0].text;
    workflowData = JSON.parse(textContent);

    const nodes = workflowData.workflow?.nodes || workflowData.nodes || [];
    
    nodes.forEach(node => {
      const isMedia = node.name.toLowerCase().includes('audio') || 
                      node.name.toLowerCase().includes('pdf') || 
                      node.name.toLowerCase().includes('doc') || 
                      node.name.toLowerCase().includes('video') || 
                      node.name.toLowerCase().includes('media') ||
                      node.name.toLowerCase().includes('img') ||
                      JSON.stringify(node.parameters).includes('audio') ||
                      JSON.stringify(node.parameters).includes('document') ||
                      JSON.stringify(node.parameters).includes('media');
                      
      if (isMedia) {
        console.log(`\n[${fileName}] Node: "${node.name}" (${node.type})`);
        console.log(`  URL: ${node.parameters?.url}`);
        console.log(`  Method: ${node.parameters?.method}`);
        console.log(`  Headers:`, node.parameters?.headers?.parameters || node.parameters?.headerParameters);
        console.log(`  Body Parameters:`, node.parameters?.bodyParameters?.parameters);
        if (node.parameters?.jsonBody) {
          console.log(`  JSON Body:`, node.parameters.jsonBody);
        }
      }
    });
  } catch (err) {
    console.error(`Error processing ${fileName}:`, err.message);
  }
}

const files = [
  'n8n_wf_seq1_recheios.json',
  'n8n_wf_bot_recheios.json',
  'n8n_wf_UrXnsr5pPIPzda8wntRx4.json',
  'n8n_wf_FOqcYYL5ALLKp5d6Fx-48.json',
  'n8n_wf_HnnZxGG3iGTW7e1L84a3j.json',
  'n8n_wf_j6mdUHmYdOSYXsxc.json',
  'n8n_wf_clGjYvzwkeSmhIX4.json',
  'n8n_wf_kDkoUC8Mchs0XQFg.json'
];

files.forEach(inspectWorkflow);
