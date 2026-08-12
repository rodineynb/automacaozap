with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\workers\automations\recheios\index.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

start = -1
for i, line in enumerate(lines):
    if "async function processAudioWithFallback" in line:
        start = i
        break

with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\scratch\process_audio_def.txt", "w", encoding="utf-8") as f_out:
    if start != -1:
        for j in range(start, min(start + 100, len(lines))):
            f_out.write(f"{j+1}: {lines[j]}")
    else:
        f_out.write("processAudioWithFallback not found")
