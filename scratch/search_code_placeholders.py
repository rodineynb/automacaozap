import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

recheios_dir = "c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers/automations/recheios"

for file in os.listdir(recheios_dir):
    if file.endswith(('.ts', '.js')):
        path = os.path.join(recheios_dir, file)
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
            # find all {variable} or {{variable}} in string literals
            # let's find all occurrences of {...} or {{...}}
            matches = re.findall(r'{+[^}\n]+}+', content)
            if matches:
                print(f"\nFile: {file} - Found {len(matches)} braces:")
                for m in sorted(list(set(matches))):
                    # print brace matches that don't look like code blocks (e.g. JSON or object expansion)
                    if not any(char in m for char in [':', '=', '(', ')', ';', '[', ']']) and len(m) < 40:
                        print(f"  {m}")
