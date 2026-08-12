import json
import urllib.request
import subprocess
import uuid
import sys

# Set stdout encoding to utf-8 if possible
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

phone = "5516991872580"
token = "2c8c464c-7d5f-438c-9d4e-473d1583e74d"
automation_id = "3805b688-0967-4e96-86da-6936c10c5d58"
conversation_id = "8d5f27a7-85fb-4ca6-9dee-efcd8f29ac28"

message_text = (
    "*Rita*, seu pagamento de *R$ 10,00* foi confirmado com sucesso! 🎉\n\n"
    "E olha só, preparei um presente incrível para você: por apenas mais *R$ 5,00*, "
    "eu consigo liberar o seu upgrade para o *Kit Completo de Confeitaria*!\n\n"
    "No kit completo você recebe:\n"
    "📹 Vídeo aulas passo a passo com o ponto certo dos recheios\n"
    "📚 Apostilas extras de brigadeiros premium, bolos no pote e geladinhos gourmet\n"
    "🍰 Método Como Ganhar Dinheiro com Fatias de Bolo\n"
    "E muito mais!\n\n"
    "Para aproveitar, faça o Pix de *R$ 5,00* na mesma chave celular:\n"
    "💰 *Chave Pix (Celular):* 61982277206\n\n"
    "Se preferir ficar apenas com as receitas que escolheu, basta digitar *\"não quero\"* ou *\"só as receitas\"* "
    "que já te peço os dados de acesso. O que você acha? 😊"
)

# 1. Gerar o arquivo SQL
print("Gerando arquivo SQL de inserções...")
sql_filepath = "scratch/inserts.sql"

# Escapar aspas simples no formato SQLite (duplicando as aspas)
safe_msg_text = message_text.replace("'", "''")
text_msg_id = str(uuid.uuid4())
text_log_id = str(uuid.uuid4())
pix_log_id = str(uuid.uuid4())
pix_content = "[Botão PIX] Chave Celular: 61982277206 (R G FEITOSA 153DF)"

sql_content = f"""
INSERT INTO messages (id, conversation_id, content, role, llm_used) 
VALUES ('{text_msg_id}', '{conversation_id}', '{safe_msg_text}', 'assistant', 'auto');

INSERT INTO dispatch_logs (id, automation_id, phone, message_type, message_content, status, error_message, sent_at) 
VALUES ('{text_log_id}', '{automation_id}', '{phone}', 'text', '{safe_msg_text[:900]}', 'success', NULL, datetime('now'));

INSERT INTO dispatch_logs (id, automation_id, phone, message_type, message_content, status, error_message, sent_at) 
VALUES ('{pix_log_id}', '{automation_id}', '{phone}', 'pix_button', '{pix_content}', 'success', NULL, datetime('now'));
"""

with open(sql_filepath, "w", encoding="utf-8") as f:
    f.write(sql_content)

# 2. Executar no D1 remoto via wrangler --file
print("Executando arquivo SQL no D1 remoto...")
wrangler_cmd = [
    "npx", "wrangler", "d1", "execute", "whatsapp-platform", "--remote", f"--file={sql_filepath}"
]

try:
    res = subprocess.run(wrangler_cmd, capture_output=True, check=True, shell=True)
    # Exibir a saída convertendo bytes de forma segura
    stdout_str = res.stdout.decode('utf-8', errors='replace')
    print("Registros concluídos no D1 remoto!")
    print(stdout_str)
except Exception as err:
    stderr_str = getattr(err, 'stderr', b'').decode('utf-8', errors='replace') if hasattr(err, 'stderr') else str(err)
    print("Erro ao rodar comandos do D1 no wrangler:", stderr_str)
