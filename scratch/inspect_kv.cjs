const { execSync } = require('child_process');

const phone = '5522998513392';
const slug = 'recheios';

async function main() {
  console.log('=== INSPECTING KV KEYS ===');
  const keys = [
    `processing:${slug}:${phone}`,
    `is_delivering_seq2:${slug}:${phone}`,
    `has_queued_messages:${slug}:${phone}`,
    `queue:${slug}:${phone}`,
    `debounce:${slug}:${phone}`
  ];

  for (const key of keys) {
    try {
      const res = execSync(`npx wrangler kv:key get --binding=KV "${key}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      console.log(`Key: "${key}" -> Value: ${res}`);
    } catch (err) {
      console.log(`Key: "${key}" -> Value: null (or not found)`);
    }
  }
}

main();
