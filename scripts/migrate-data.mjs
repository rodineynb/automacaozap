/**
 * Migração Supabase → D1 v4
 * 
 * Gera arquivos .sql com INSERTs e executa via wrangler d1 execute
 * Uso: node scripts/migrate-data.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

const SUPABASE_URL = 'https://awqqqkqvzlggczcoawvi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3cXFxa3F2emxnZ2N6Y29hd3ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ2ODE1MTEsImV4cCI6MjA4MDI1NzUxMX0.9e0KXWDZWc0UBr5clyf_bhl0rWEAMYDhXVn0ZwGFqWM';
const AUTOMATION_ID = '3805b688-0967-4e96-86da-6936c10c5d58';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function fmtDate(d) {
  if (!d) return new Date().toISOString().replace('T', ' ').slice(0, 19);
  try { return new Date(d).toISOString().replace('T', ' ').slice(0, 19); }
  catch { return new Date().toISOString().replace('T', ' ').slice(0, 19); }
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''").replace(/\\/g, '\\\\') + "'";
}

async function supaGet(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function wranglerExec(file) {
  try {
    execSync(`npx wrangler d1 execute whatsapp-platform --remote --file="${file}"`, {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 120000,
    });
    return true;
  } catch (err) {
    console.error(`  ⚠️ Erro ao executar ${file}: ${err.stderr?.toString().slice(0, 200) || err.message}`);
    return false;
  }
}

// ── STEP 1: Migrar followups ──
async function migrateFollowups() {
  console.log('📋 Etapa 1: Migrando leads...\n');
  mkdirSync('scripts/data', { recursive: true });

  const BATCH = 500;
  let offset = 0;
  let count = 0;
  let fileNum = 0;
  const phoneMap = {};

  while (true) {
    const rows = await supaGet('bd_recheios_followup',
      `select=session_id,nome,telefone,pago,email,recebeu_acesso,valor_pagamento,finalizado,nivel_followup,created_at,updated_at&order=created_at.asc&limit=${BATCH}&offset=${offset}`
    );
    if (rows.length === 0) break;

    const lines = [];
    for (const row of rows) {
      const phone = row.telefone || row.session_id;
      if (!phone || phoneMap[phone]) continue;

      const cid = uuid(), vid = uuid(), sid = uuid(), lid = uuid();
      const ca = fmtDate(row.created_at), ua = fmtDate(row.updated_at);

      let phase = 'initial', s1 = 0, s2 = 0;
      if (row.recebeu_acesso && row.pago) { phase = 'completed'; s1 = 1; s2 = 1; }
      else if (row.pago) { phase = 'paid'; s1 = 1; s2 = 1; }
      else if (row.recebeu_acesso) { phase = 'seq2_sent'; s1 = 1; s2 = 1; }
      else if (row.nivel_followup > 0) { phase = 'seq1_sent'; s1 = 1; }

      phoneMap[phone] = { contactId: cid, conversationId: vid };

      lines.push(`INSERT OR IGNORE INTO contacts (id, phone, name, automation_id, created_at) VALUES (${esc(cid)}, ${esc(phone)}, ${esc(row.nome)}, ${esc(AUTOMATION_ID)}, ${esc(ca)});`);
      lines.push(`INSERT INTO conversations (id, contact_id, automation_id, status, ai_active, created_at, updated_at) VALUES (${esc(vid)}, ${esc(cid)}, ${esc(AUTOMATION_ID)}, ${esc(row.finalizado ? 'resolved' : 'open')}, 1, ${esc(ca)}, ${esc(ua)});`);
      lines.push(`INSERT INTO conversation_state (id, conversation_id, automation_slug, phase, seq1_called, seq2_called, payment_confirmed, total_paid, upsell_offered, client_name, client_email, access_delivered, created_at, updated_at) VALUES (${esc(sid)}, ${esc(vid)}, 'recheios', ${esc(phase)}, ${s1}, ${s2}, ${row.pago ? 1 : 0}, ${row.valor_pagamento || 0}, 0, ${esc(row.nome)}, ${esc(row.email)}, ${row.recebeu_acesso ? 1 : 0}, ${esc(ca)}, ${esc(ua)});`);
      lines.push(`INSERT INTO automation_leads (id, automation_id, phone, nome, email, recebeu_acesso, valor_pago, pago, created_at, updated_at) VALUES (${esc(lid)}, ${esc(AUTOMATION_ID)}, ${esc(phone)}, ${esc(row.nome)}, ${esc(row.email)}, ${row.recebeu_acesso ? 1 : 0}, ${row.valor_pagamento || 0}, ${row.pago ? 1 : 0}, ${esc(ca)}, ${esc(ua)});`);
      count++;
    }

    if (lines.length > 0) {
      const file = `scripts/data/leads_${fileNum++}.sql`;
      writeFileSync(file, lines.join('\n'));
      console.log(`  📝 ${file} (${lines.length} statements, ${count} leads)...`);
      const ok = wranglerExec(file);
      if (!ok) console.error(`  ❌ Falhou em ${file}`);
    }

    offset += BATCH;
    await sleep(100);
  }

  console.log(`\n✅ Total leads: ${count} (${fileNum} arquivos SQL)\n`);
  return phoneMap;
}

// ── STEP 2: Migrar mensagens ──
async function migrateMessages(phoneMap) {
  console.log('💬 Etapa 2: Migrando mensagens...\n');

  const BATCH = 1000;
  const SQL_BATCH = 500; // statements por arquivo SQL
  let offset = 0;
  let count = 0;
  let skipped = 0;
  let fileNum = 0;
  let pendingLines = [];

  while (true) {
    const rows = await supaGet('memoria_recheios',
      `select=id,session_id,message&order=id.asc&limit=${BATCH}&offset=${offset}`
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      const ids = phoneMap[row.session_id];
      if (!ids) { skipped++; continue; }
      const msg = row.message;
      if (!msg?.content) { skipped++; continue; }

      const c = msg.content;
      if (c.includes('Envie agora a mensagem de cobrança') ||
          c.includes('seguir exatamente o script') ||
          c.includes('Siga rigorosamente') ||
          c.startsWith('Leia com atenção')) {
        skipped++;
        continue;
      }

      const role = msg.type === 'human' ? 'user' : 'assistant';
      pendingLines.push(`INSERT INTO messages (id, conversation_id, content, role) VALUES (${esc(uuid())}, ${esc(ids.conversationId)}, ${esc(c)}, ${esc(role)});`);
      count++;

      if (pendingLines.length >= SQL_BATCH) {
        const file = `scripts/data/msgs_${fileNum++}.sql`;
        writeFileSync(file, pendingLines.join('\n'));
        wranglerExec(file);
        console.log(`  ✅ ${count} msgs (arquivo ${fileNum})...`);
        pendingLines = [];
      }
    }

    offset += BATCH;
    await sleep(100);
  }

  // Restante
  if (pendingLines.length > 0) {
    const file = `scripts/data/msgs_${fileNum++}.sql`;
    writeFileSync(file, pendingLines.join('\n'));
    wranglerExec(file);
  }

  console.log(`\n✅ Total msgs: ${count} | Skipped: ${skipped} | Arquivos: ${fileNum}`);
}

// ── Main ──
async function main() {
  console.log('🚀 Migração Supabase → D1 v4 (via wrangler)\n');
  const t0 = Date.now();

  const phoneMap = await migrateFollowups();

  // Salvar phoneMap
  writeFileSync('scripts/data/phone_map.json', JSON.stringify(phoneMap));
  console.log(`   📁 phone_map.json salvo (${Object.keys(phoneMap).length} phones)\n`);

  await migrateMessages(phoneMap);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n🎉 Concluído em ${elapsed}s!`);
}

main().catch(err => { console.error('❌', err); process.exit(1); });
