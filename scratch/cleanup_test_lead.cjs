const { execSync } = require('child_process');

const phone = '5522998513392';

try {
  console.log(`Cleaning up D1 data for phone: ${phone}...`);
  
  // Executar comandos SQL
  const queries = [
    `DELETE FROM messages WHERE conversation_id IN (SELECT cv.id FROM conversations cv JOIN contacts ct ON cv.contact_id = ct.id WHERE ct.phone = '${phone}');`,
    `DELETE FROM conversation_state WHERE conversation_id IN (SELECT cv.id FROM conversations cv JOIN contacts ct ON cv.contact_id = ct.id WHERE ct.phone = '${phone}');`,
    `DELETE FROM scheduled_followups WHERE conversation_id IN (SELECT cv.id FROM conversations cv JOIN contacts ct ON cv.contact_id = ct.id WHERE ct.phone = '${phone}');`,
    `DELETE FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE phone = '${phone}');`,
    `DELETE FROM contacts WHERE phone = '${phone}';`,
    `DELETE FROM automation_leads WHERE phone = '${phone}';`,
    `DELETE FROM tracking_data WHERE phone = '${phone}';`,
    `DELETE FROM facebook_tracking_logs WHERE phone = '${phone}';`
  ];

  for (const query of queries) {
    console.log(`Executing: ${query}`);
    const res = execSync(`npx wrangler d1 execute whatsapp-platform --remote --command "${query}"`, { encoding: 'utf8' });
    console.log(res);
  }

  console.log('Database cleanup completed successfully!');

} catch (err) {
  console.error('Error during database cleanup:', err.message);
}
