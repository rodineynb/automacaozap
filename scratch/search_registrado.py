import os

search_dir = "c:/Users/Note/Desktop/Antigravity/AutomacaoZAP"
search_term = "registrado"

for root, dirs, files in os.walk(search_dir):
    if "node_modules" in root or ".git" in root or ".react-router" in root:
        continue
    for file in files:
        if file.endswith((".ts", ".tsx", ".js", ".json", ".sql")):
            filepath = os.path.join(root, file)
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    content = f.read()
                    if search_term in content:
                        print(f"Found '{search_term}' in {filepath}")
                        # print the lines
                        lines = content.splitlines()
                        for i, line in enumerate(lines):
                            if search_term in line:
                                print(f"  Line {i+1}: {line}")
            except Exception as e:
                pass
