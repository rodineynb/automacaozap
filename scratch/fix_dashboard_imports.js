import fs from 'fs';
import path from 'path';

const dirPath = 'app/components/dashboard';
const files = fs.readdirSync(dirPath);

for (const file of files) {
  if (file.endsWith('.tsx') && file !== 'dashboard-utils.ts') {
    const fullPath = path.join(dirPath, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace imports
    content = content.replace(/['"]\.\.\/lib\/utils['"]/g, "'./dashboard-utils'");
    content = content.replace(/['"]\.\.\/types['"]/g, "'../../types/dashboard'");
    content = content.replace(/['"]\.\.\/lib\/api['"]/g, "'../../lib/api'"); // if any api import
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Updated imports in: ${file}`);
  }
}
