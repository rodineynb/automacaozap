with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\app\routes\reports.tsx", "r", encoding="utf-8") as f:
    for i, line in enumerate(f, 1):
        if "export" in line:
            print(f"reports.tsx:{i}: {line.strip()}")
