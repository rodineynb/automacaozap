import requests
import json

url = "https://zapgo.promentor21.top/api/webhook/recheios"

payload = {
  "BaseUrl": "https://api-tbz.uazapi.com",
  "EventType": "messages",
  "chat": {
    "phone": "+55 11 91650-7919",
    "name": "Delane Oliveira",
    "wa_chatid": "5511916507919@s.whatsapp.net",
    "owner": "5522981678365"
  },
  "message": {
    "fromMe": False,
    "text": "Vou fazer o Pix",
    "content": "Vou fazer o Pix",
    "type": "chat",
    "messageType": "conversation",
    "senderName": "Delane Oliveira",
    "wasSentByApi": False
  },
  "owner": "5522981678365"
}

headers = {
    "Content-Type": "application/json"
}

print(f"POST {url}...")
try:
    response = requests.post(url, headers=headers, json=payload, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(response.text)
except Exception as e:
    print(f"Error: {e}")
