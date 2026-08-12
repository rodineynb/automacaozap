const { execSync } = require('child_process');

try {
  console.log('=== LLMS TABLE ===');
  const llms = execSync('npx wrangler d1 execute whatsapp-platform --remote --command "SELECT * FROM llms"', { encoding: 'utf8' });
  console.log(llms);

  console.log('=== AUTOMATIONS LLMS TABLE ===');
  const autoLlms = execSync('npx wrangler d1 execute whatsapp-platform --remote --command "SELECT * FROM automation_llms"', { encoding: 'utf8' });
  console.log(autoLlms);
} catch (err) {
  console.error('Error executing query:', err.message);
}
