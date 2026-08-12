const { execSync } = require('child_process');

try {
  console.log('=== LATEST MESSAGES ===');
  const messages = execSync('npx wrangler d1 execute whatsapp-platform --remote --command "SELECT * FROM messages ORDER BY created_at DESC LIMIT 15"', { encoding: 'utf8' });
  console.log(messages);

  console.log('\n=== LATEST ERROR LOGS ===');
  const errors = execSync('npx wrangler d1 execute whatsapp-platform --remote --command "SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 10"', { encoding: 'utf8' });
  console.log(errors);

  console.log('\n=== CONVERSATION STATE ===');
  const state = execSync('npx wrangler d1 execute whatsapp-platform --remote --command "SELECT * FROM conversation_state ORDER BY updated_at DESC LIMIT 5"', { encoding: 'utf8' });
  console.log(state);
} catch (err) {
  console.error('Error executing query:', err.message);
}
