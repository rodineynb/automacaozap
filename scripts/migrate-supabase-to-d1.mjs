/**
 * Script de migração de dados do Supabase → Cloudflare D1
 * 
 * Migra:
 * - bd_recheios_followup → contacts + conversations + conversation_state + automation_leads
 * - memoria_recheios → messages
 * 
 * Executa via: node --experimental-modules scripts/migrate-supabase-to-d1.mjs
 */

const SUPABASE_URL = 'https://awqqqkqvzlggczcoawvi.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Precisa ser a service_role key
const CF_ACCOUNT_ID = '58e12f4d07f70db12cb7ba2d78e3d384';
const CF_API_TOKEN = 'PugzzRj2yUt2MIOKmU438mtBX_zgger2gF3ZcutE';
const D1_DATABASE_ID = 'a24603e2-88a5-4cb4-854d-b87f03ad5ff0';
const AUTOMATION_ID = '3805b688-0967-4e96-86da-6936c10c5d58';

// ── Helpers ──

async function supabaseQuery(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function d1Execute(sql, params = []) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });
  const data = await res.json();
  if (!data.success) {
    console.error('D1 Error:', JSON.stringify(data.errors));
    throw new Error(`D1 error: ${JSON.stringify(data.errors)}`);
  }
  return data.result;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Step 1: Migrate bd_recheios_followup → contacts + conversations + conversation_state + automation_leads ──

async function migrateFollowups() {
  console.log('📋 Migrando bd_recheios_followup...');
  
  const BATCH_SIZE = 100;
  let offset = 0;
  let total = 0;
  const phoneToIds = {}; // phone → { contactId, conversationId }

  while (true) {
    const rows = await supabaseQuery(
      'bd_recheios_followup',
      `select=*&order=created_at.asc&limit=${BATCH_SIZE}&offset=${offset}`
    );
    
    if (rows.length === 0) break;
    
    for (const row of rows) {
      const phone = row.telefone || row.session_id;
      if (!phone) continue;
      
      const contactId = uuid();
      const conversationId = uuid();
      const stateId = uuid();
      const leadId = uuid();
      const createdAt = row.created_at ? new Date(row.created_at).toISOString().replace('T', ' ').slice(0, 19) : new Date().toISOString().replace('T', ' ').slice(0, 19);
      const updatedAt = row.updated_at ? new Date(row.updated_at).toISOString().replace('T', ' ').slice(0, 19) : createdAt;
      
      // Determinar fase baseado nos dados do followup
      let phase = 'initial';
      if (row.recebeu_acesso && row.pago) phase = 'completed';
      else if (row.pago) phase = 'paid';
      else if (row.recebeu_acesso) phase = 'seq2_sent'; // Recebeu receitas mas não pagou
      else if (row.nivel_followup > 0) phase = 'seq1_sent';
      
      try {
        // 1. Criar contato
        await d1Execute(
          'INSERT OR IGNORE INTO contacts (id, phone, name, automation_id, created_at) VALUES (?, ?, ?, ?, ?)',
          [contactId, phone, row.nome || null, AUTOMATION_ID, createdAt]
        );
        
        // 2. Criar conversa
        await d1Execute(
          'INSERT INTO conversations (id, contact_id, automation_id, status, ai_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [conversationId, contactId, AUTOMATION_ID, row.finalizado ? 'resolved' : 'open', 1, createdAt, updatedAt]
        );
        
        // 3. Criar state
        await d1Execute(
          `INSERT INTO conversation_state (id, conversation_id, automation_slug, phase, seq1_called, seq2_called, payment_confirmed, total_paid, upsell_offered, client_name, client_email, access_delivered, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [stateId, conversationId, 'recheios', phase, 
           row.recebeu_acesso ? 1 : 0, // se recebeu acesso, mandou seq1
           row.recebeu_acesso ? 1 : 0, // se recebeu acesso, mandou seq2 
           row.pago ? 1 : 0,
           row.valor_pagamento || 0,
           0, // upsell
           row.nome || null,
           row.email || null,
           row.recebeu_acesso ? 1 : 0,
           createdAt, updatedAt]
        );
        
        // 4. Criar lead
        await d1Execute(
          'INSERT INTO automation_leads (id, automation_id, phone, nome, email, recebeu_acesso, valor_pago, pago, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [leadId, AUTOMATION_ID, phone, row.nome || null, row.email || null, row.recebeu_acesso ? 1 : 0, row.valor_pagamento || 0, row.pago ? 1 : 0, createdAt, updatedAt]
        );
        
        phoneToIds[phone] = { contactId, conversationId };
        total++;
        
      } catch (err) {
        console.error(`  ⚠️ Erro no lead ${phone}:`, err.message);
      }
    }
    
    offset += BATCH_SIZE;
    console.log(`  ✅ ${total} leads migrados (offset: ${offset})`);
  }
  
  console.log(`✅ Total de leads migrados: ${total}`);
  return phoneToIds;
}

// ── Step 2: Migrate memoria_recheios → messages ──

async function migrateMessages(phoneToIds) {
  console.log('\n💬 Migrando memoria_recheios...');
  
  const BATCH_SIZE = 200;
  let offset = 0;
  let total = 0;
  let skipped = 0;

  while (true) {
    const rows = await supabaseQuery(
      'memoria_recheios',
      `select=id,session_id,message&order=id.asc&limit=${BATCH_SIZE}&offset=${offset}`
    );
    
    if (rows.length === 0) break;
    
    for (const row of rows) {
      const phone = row.session_id;
      const ids = phoneToIds[phone];
      
      if (!ids) {
        skipped++;
        continue;
      }
      
      const msg = row.message;
      if (!msg || !msg.content) continue;
      
      const role = msg.type === 'human' ? 'user' : 'assistant';
      const content = msg.content;
      const msgId = uuid();
      
      try {
        await d1Execute(
          'INSERT INTO messages (id, conversation_id, content, role) VALUES (?, ?, ?, ?)',
          [msgId, ids.conversationId, content, role]
        );
        total++;
      } catch (err) {
        console.error(`  ⚠️ Erro msg ${row.id}:`, err.message);
      }
    }
    
    offset += BATCH_SIZE;
    if (offset % 5000 === 0) {
      console.log(`  ✅ ${total} mensagens migradas (offset: ${offset}, skipped: ${skipped})`);
    }
  }
  
  console.log(`✅ Total de mensagens migradas: ${total} (skipped: ${skipped})`);
}

// ── Main ──

async function main() {
  console.log('🚀 Iniciando migração Supabase → D1');
  console.log(`   Supabase: ${SUPABASE_URL}`);
  console.log(`   D1 Database: ${D1_DATABASE_ID}`);
  console.log(`   Automation ID: ${AUTOMATION_ID}`);
  console.log('');
  
  if (!SUPABASE_KEY) {
    console.error('❌ SUPABASE_SERVICE_KEY não definida. Execute:');
    console.error('   set SUPABASE_SERVICE_KEY=sua_key_aqui');
    process.exit(1);
  }
  
  const phoneToIds = await migrateFollowups();
  await migrateMessages(phoneToIds);
  
  console.log('\n🎉 Migração concluída!');
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
