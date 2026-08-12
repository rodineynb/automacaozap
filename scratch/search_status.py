import os

keywords = ['finalizado_com_sucesso', 'finalizado_sem_sucesso', 'open', 'pending', 'resolved', 'reaberto']
root_dir = 'c:/Users/Note/Desktop/Antigravity/AutomacaoZAP'

for dirpath, _, filenames in os.walk(root_dir):
    if 'node_modules' in dirpath or '.git' in dirpath or '.wrangler' in dirpath or '.react-router' in dirpath:
        continue
    for filename in filenames:
        if filename.endswith(('.ts', '.tsx', '.js', '.jsx', '.sql')):
            filepath = os.path.join(dirpath, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                for i, line in enumerate(lines):
                    for kw in keywords:
                        if kw in line:
                            print(f"{filepath}:{i+1}: {line.strip()}")
            except Exception as e:
                pass
