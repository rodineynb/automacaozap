import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/crm.ts", "r", encoding="utf-8") as f:
    lines = f.read().splitlines()

for idx in range(1048, min(1250, len(lines))):
    print(f"{idx + 1}: {lines[idx]}")
