import urllib.request
import json
import time
import subprocess
import uuid
import sys

# Reconfigurar stdout/stderr para UTF-8 para evitar problemas de console no Windows
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

phone = "5521991164493"
url_text = "https://api-tbz.uazapi.com/send/text"
url_pix = "https://api-tbz.uazapi.com/send/pix-button"
token = "2c8c464c-7d5f-438c-9d4e-473d1583e74d"

text_message = (
    "*Maria*, seu pagamento de *R$ 10,00* foi confirmado com sucesso! 🎉😍\n\n"
    "*Maria*, tenho uma surpresa super especial pra você! 🎁\n\n"
    "Por apenas mais *R$ 5,00* você leva o nosso *Kit Completo de Confeitaria* (que custa R$ 25,00)!\n\n"
    "No kit completo você recebe:\n"
    "📹 Vídeo aulas passo a passo com o ponto certo dos recheios\n"
    "📚 Apostilas extras de brigadeiros premium, bolos no pote e geladinhos gourmet\n"
    "🍰 Método Como Ganhar Dinheiro com Fatias de Bolo\n"
    "E muito mais!\n\n"
    "É só fazer o PIX de *R$ 5,00* para o mesmo número celular:\n"
    "💰 *Chave PIX:* 61982277206\n\n"
    "Se preferir ficar apenas com as receitas que escolheu, basta digitar *\"não quero\"* ou *\"só as receitas\"* que já te peço os dados de acesso. O que você acha? 😊"
)

# 1. Enviar mensagem de texto
print("Enviando mensagem de texto...")
payload = json.dumps({"number": phone, "text": text_message}).encode('utf-8')
req_text = urllib.request.Request(
    url_text,
    data=payload,
    headers={"token": token, "Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(req_text) as response:
        res_data = response.read().decode('utf-8')
        print("Resposta do envio de texto:", res_data)
except Exception as e:
    print("Erro ao enviar texto:", e)

# 2. Registrar no banco D1 (apenas se o envio foi bem sucedido ou tentado)
print("Registrando no banco D1...")
msg_id = str(uuid.uuid4())
conversation_id = "55aba554-e4a5-4ef8-b308-40bfabf72e67"

escaped_text = text_message.replace("'", "''")
direct_sql = f"INSERT INTO messages (id, conversation_id, content, role, llm_used) VALUES ('{msg_id}', '{conversation_id}', '{escaped_text}', 'assistant', 'auto');"

try:
    result = subprocess.run(
        ["npx", "wrangler", "d1", "execute", "whatsapp-platform", "--remote", f"--command={direct_sql}"],
        capture_output=True,
        text=True,
        shell=True,
        encoding='utf-8' # Especifica decodificação UTF-8
    )
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)
except Exception as e:
    print("Erro ao executar D1:", e)
