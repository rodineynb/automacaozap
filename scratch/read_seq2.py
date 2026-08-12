with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\workers\automations\recheios\tools.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

start = -1
for i, line in enumerate(lines):
    if "async function executeSeq2" in line or "export async function executeSeq2" in line:
        start = i
        break

if start != -1:
    for j in range(start, min(start + 250, len(lines))):
        print(f"{j+1}: {lines[j]}", end="")
else:
    print("executeSeq2 not found")
