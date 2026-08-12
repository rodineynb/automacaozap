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
    
    // Some of these files might be direct JSON, others might be the data: JSON format
    let workflowData;
    if (content.startsWith('data: ')) {
      const dataLine = content.split('\n').find(l => l.startsWith('data: '));
      const jsonStr = dataLine.substring(6);
      const parsed = JSON.parse(jsonStr);
      const textContent = parsed.result.content[0].text;
      workflowData = JSON.parse(textContent);
    } else {
      workflowData = JSON.parse(content);
    }

    // Let's search for nodes of type "n8n-nodes-base.httpRequest"
    const nodes = workflowData.nodes || (workflowData.workflow && workflowData.workflow.nodes) || [];
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
        console.log('---');
      }
    });
  } catch (err) {
    console.error(`Error processing ${fileName}:`, err.message);
  }
}

inspectWorkflow('n8n_wf_seq1_recheios.json');
inspectWorkflow('n8n_wf_bot_recheios.json');
inspectWorkflow('n8n_wf_UrXnsr5pPIPzda8wntRx4.json');
