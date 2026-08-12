const { execSync } = require('child_process');

try {
  console.log('=== WHATSAPP APIS ===');
  const apis = execSync('npx wrangler d1 execute whatsapp-platform --remote --command "SELECT * FROM whatsapp_apis"', { encoding: 'utf8' });
  console.log(apis);
} catch (err) {
  console.error('Error executing query:', err.message);
}
