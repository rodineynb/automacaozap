const fs = require('fs');
const path = require('path');

function inspectWorkflow(fileName) {
  const filePath = path.join('c:', 'Users', 'Note', 'Desktop', 'Antigravity', 'AutomacaoZAP', fileName);
  if (!fs.existsSync(filePath)) {
    console.log(`File ${fileName} does not exist.`);
    return;
  }
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    let workflowData;
    const lines = content.split('\n');
    const dataLine = lines.find(l => l.startsWith('data: '));
    if (!dataLine) {
      console.log(`Could not find data: line in ${fileName}`);
      return;
    }
    
    const jsonStr = dataLine.substring(6).trim();
    const parsed = JSON.parse(jsonStr);
    const textContent = parsed.result.content[0].text;
    workflowData = JSON.parse(textContent);

    const nodes = workflowData.workflow?.nodes || workflowData.nodes || [];
    console.log(`\n=== INSPECTING ${fileName} (Found ${nodes.length} nodes) ===`);
    
    nodes.forEach(node => {
      const isHttp = node.type === 'n8n-nodes-base.httpRequest';
      const hasUrl = node.parameters && (node.parameters.url || JSON.stringify(node.parameters).includes('http'));
      
      if (isHttp || hasUrl) {
        console.log(`Node: "${node.name}" (${node.type})`);
        console.log(`  URL: ${node.parameters?.url}`);
        console.log(`  Method: ${node.parameters?.method}`);
        if (node.parameters?.sendHeaders) {
          console.log(`  Headers:`, node.parameters.headers?.parameters || node.parameters.headerParameters);
        }
        if (node.parameters?.sendBody) {
          console.log(`  Body Parameters:`, node.parameters.bodyParameters?.parameters || node.parameters.jsonParameters || node.parameters.jsonBody);
        }
        if (node.parameters?.jsonBody) {
          console.log(`  JSON Body:`, node.parameters.jsonBody);
        }
        if (node.parameters?.arguments) {
          console.log(`  Arguments:`, node.parameters.arguments);
        }
        console.log('---');
      }
    });
  } catch (err) {
    console.error(`Error processing ${fileName}:`, err);
  }
}

inspectWorkflow('n8n_wf_seq1_recheios.json');
inspectWorkflow('n8n_wf_bot_recheios.json');
inspectWorkflow('n8n_wf_UrXnsr5pPIPzda8wntRx4.json');
inspectWorkflow('n8n_wf_FOqcYYL5ALLKp5d6Fx-48.json');
inspectWorkflow('n8n_wf_HnnZxGG3iGTW7e1L84a3j.json');
inspectWorkflow('n8n_wf_j6mdUHmYdOSYXsxc.json');
inspectWorkflow('n8n_wf_clGjYvzwkeSmhIX4.json');
inspectWorkflow('n8n_wf_kDkoUC8Mchs0XQFg.json');
