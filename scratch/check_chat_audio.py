with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\app\routes\chat.tsx", "r", encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        if "audio1" in line or "audio2" in line:
            print(f"chat.tsx:{i}: {line.strip()}")
