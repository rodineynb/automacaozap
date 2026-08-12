import sys

with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\workers\automations\recheios\tools.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

start = -1
for i, line in enumerate(lines):
    if "async function executeSeq2" in line or "export async function executeSeq2" in line:
        start = i
        break

with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\scratch\seq2_code.txt", "w", encoding="utf-8") as f_out:
    if start != -1:
        for j in range(start, min(start + 250, len(lines))):
            f_out.write(f"{j+1}: {lines[j]}")
    else:
        f_out.write("executeSeq2 not found")
