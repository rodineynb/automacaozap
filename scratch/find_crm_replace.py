import sys
sys.stdout.reconfigure(encoding='utf-8')

with open("c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/routes/crm.ts", "r", encoding="utf-8") as f:
    lines = f.read().splitlines()

in_func = False
func_lines = []
for idx, line in enumerate(lines):
    if "processCrmScheduled" in line or "async function processCrmScheduled" in line or "const processCrmScheduled" in line:
        in_func = True
    if in_func:
        func_lines.append((idx + 1, line))
        # Keep capturing lines for some distance
        if len(func_lines) > 200:
            break

for num, l in func_lines:
    print(f"{num}: {l}")
