const fs = require('fs');
const path = require('path');

function searchDir(dir, query) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath, query);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes(query.toLowerCase())) {
        const lines = content.split('\n');
        console.log(`\nFound in ${fullPath}:`);
        lines.forEach((line, index) => {
          if (line.toLowerCase().includes(query.toLowerCase())) {
            console.log(`  Line ${index + 1}: ${line.trim()}`);
          }
        });
      }
    }
  });
}

const workersDir = 'c:\\Users\\Note\\Desktop\\Antigravity\\AutomacaoZAP\\workers';
searchDir(workersDir, 'transcribe');
searchDir(workersDir, 'transcrição');
searchDir(workersDir, 'transcricao');
searchDir(workersDir, 'transcription');
