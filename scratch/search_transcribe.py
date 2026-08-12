import os

search_dir = r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP"
search_term = "transcri"

for root, dirs, files in os.walk(search_dir):
    if "node_modules" in root or ".git" in root or "build" in root or ".wrangler" in root:
        continue
    for file in files:
        if file.endswith((".ts", ".tsx", ".js", ".jsx", ".json")):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    if search_term in content.lower():
                        print(f"Found '{search_term}' in {path}")
            except Exception as e:
                pass
