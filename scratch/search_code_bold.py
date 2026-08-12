import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

recheios_dir = "c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios"
found = 0

for file in os.listdir(recheios_dir):
    if file.endswith(('.ts', '.js')):
        path = os.path.join(recheios_dir, file)
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            lines = content.split('\n')
            for idx, line in enumerate(lines):
                if '**' in line and not line.strip().startswith(('//', '/*', '*')):
                    print(f"[{file}:{idx+1}] {line.strip()}")
                    found += 1

print(f"Total double asterisks found in recheios code: {found}")
