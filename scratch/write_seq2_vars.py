with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\workers\automations\recheios\tools.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\scratch\seq2_variations.txt", "w", encoding="utf-8") as f_out:
    for j in range(690, min(760, len(lines))):
        f_out.write(f"{j+1}: {lines[j]}")
