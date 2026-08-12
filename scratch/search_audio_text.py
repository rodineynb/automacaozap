import os

search_dir = r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP"
search_terms = ["audio1", "audio2", "200 receitas de recheios", "vi que você veio"]

for root, dirs, files in os.walk(search_dir):
    if "node_modules" in root or ".git" in root or "build" in root or ".wrangler" in root:
        continue
    for file in files:
        if file.endswith((".ts", ".tsx", ".js", ".jsx", ".json", ".txt", ".md")):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                    for term in search_terms:
                        if term in content:
                            print(f"Found '{term}' in {path}")
            except Exception as e:
                pass
