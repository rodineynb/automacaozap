with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\workers\services\llm-service.ts", "r", encoding="utf-8") as f:
    lines = f.readlines()

start = -1
for i, line in enumerate(lines):
    if "export async function callLLM" in line:
        start = i
        break

with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\scratch\call_llm_code.txt", "w", encoding="utf-8") as f_out:
    if start != -1:
        for j in range(start, min(start + 150, len(lines))):
            f_out.write(f"{j+1}: {lines[j]}")
    else:
        f_out.write("callLLM not found")
