import os
import re

root_dir = "c:/Users/Note/Desktop/Antigravity/AutomacaoZAP"

def search_text(pattern, target_path):
    print(f"Searching for '{pattern}' in {target_path}...")
    
    def check_file(path):
        if path.endswith((".ts", ".tsx", ".js", ".jsx", ".json")):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for i, line in enumerate(f, 1):
                        if re.search(pattern, line, re.IGNORECASE):
                            print(f"{path}:{i} - {line.strip()}")
            except Exception as e:
                pass

    if os.path.isfile(target_path):
        check_file(target_path)
    else:
        for root, dirs, files in os.walk(target_path):
            if "node_modules" in root or ".git" in root or ".wrangler" in root or ".react-router" in root:
                continue
            for file in files:
                check_file(os.path.join(root, file))

search_text("maquina|grok|h3gqbu|completo|sdr", os.path.join(root_dir, "workers/automations/recheios/prompts.ts"))
