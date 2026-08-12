const fs = require('fs');

// Parse all workflow files
const files = fs.readdirSync('.').filter(f => f.startsWith('n8n_wf_') && f.endsWith('.json'));

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf-8');
  
  // SSE format: "event: message\ndata: {\"result\":{\"content\":[{\"type\":\"text\",\"text\":\"...escaped json...\"}]}}"
  let wf;
  try {
    // Extract the data line
    const dataLine = raw.split('\n').find(l => l.startsWith('data: '));
    if (dataLine) {
      const sseData = JSON.parse(dataLine.slice(6));
      const textContent = sseData.result?.content?.[0]?.text;
      if (textContent) {
        wf = JSON.parse(textContent);
      }
    }
    if (!wf) {
      // Try direct JSON parse
      wf = JSON.parse(raw.replace(/^\uFEFF/, ''));
    }
  } catch(e) {
    console.log(`${file}: PARSE ERROR - ${e.message.slice(0, 80)}`);
    continue;
  }

  // Navigate to actual workflow
  const workflow = wf.workflow || wf;
  const nodes = workflow.nodes || [];
  
  // Find tracking/purchase/pixel nodes
  const trackNodes = nodes.filter(n => {
    const name = (n.name || '').toLowerCase();
    return name.includes('traque') || name.includes('purchase') || 
           name.includes('rastr') || name.includes('pixel') ||
           name.includes('facebook') || name.includes('graph');
  });

  if (trackNodes.length > 0) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`FILE: ${file} (${nodes.length} nodes, ${trackNodes.length} tracking)`);
    console.log(`${'='.repeat(60)}`);
    
    trackNodes.forEach(n => {
      console.log(`\n--- NODE: ${n.name}`);
      console.log(`    TYPE: ${n.type}`);
      console.log(`    PARAMS: ${JSON.stringify(n.parameters, null, 2).slice(0, 3000)}`);
    });

    // Show connections related to tracking
    const conns = workflow.connections || {};
    console.log('\n--- CONNECTIONS:');
    for (const [from, targets] of Object.entries(conns)) {
      const fromLower = from.toLowerCase();
      if (fromLower.includes('traque') || fromLower.includes('purchase') || 
          fromLower.includes('rastr') || fromLower.includes('sistema') ||
          fromLower.includes('pagament')) {
        const targetNames = [];
        const main = targets.main || [];
        main.forEach(arr => arr.forEach(t => targetNames.push(t.node)));
        console.log(`    ${from} -> [${targetNames.join(', ')}]`);
      }
    }
  } else {
    console.log(`${file}: ${nodes.length} nodes, 0 tracking nodes`);
  }
}
