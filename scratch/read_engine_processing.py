with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\workers\automation-engine.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

start = -1
for i, line in enumerate(lines):
    if "processing:" in line:
        start = i
        break

with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\scratch\processing_lock_engine.txt", "w", encoding="utf-8") as f_out:
    if start != -1:
        for j in range(max(0, start - 20), min(start + 80, len(lines))):
            f_out.write(f"{j+1}: {lines[j]}")
    else:
        f_out.write("processing: not found in engine")
