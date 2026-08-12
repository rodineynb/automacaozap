with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\workers\automations\recheios\followups.ts", "r", encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        if "transcri" in line.lower():
            print(f"followups.ts:{i}: {line.strip()}")
