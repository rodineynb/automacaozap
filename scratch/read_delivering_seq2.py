import os

search_dir = r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP"
search_term = "is_delivering_seq2"

for root, dirs, files in os.walk(search_dir):
    if "node_modules" in root or ".git" in root or "build" in root:
        continue
    for file in files:
        if file.endswith(".ts"):
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                if search_term in content:
                    print(f"Found in {path}")
                    # Write lines around it to scratch/delivering_seq2_code.txt
                    lines = content.splitlines()
                    start = -1
                    for idx, line in enumerate(lines):
                        if search_term in line:
                            start = idx
                            break
                    if start != -1:
                        with open(r"c:\Users\Note\Desktop\Antigravity\AutomacaoZAP\scratch\delivering_seq2_code.txt", "w", encoding="utf-8") as f_out:
                            for j in range(max(0, start - 10), min(start + 100, len(lines))):
                                f_out.write(f"{j+1}: {lines[j]}\n")
