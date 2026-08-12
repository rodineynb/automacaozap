const { execSync } = require('child_process');

try {
  console.log('=== LATEST ERROR LOGS ===');
  const errors = execSync('npx wrangler d1 execute whatsapp-platform --remote --command "SELECT id, error_type, error_message, created_at FROM error_logs WHERE created_at >= \'2026-05-22 14:00:00\' ORDER BY created_at DESC"', { encoding: 'utf8' });
  console.log(errors);
} catch (err) {
  console.error('Error executing query:', err.message);
}
