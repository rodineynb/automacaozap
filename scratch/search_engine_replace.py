import os
import re

print("--- SCANNING FOR REPLACE LOGIC FOR VARIABLES IN WORKERS ---")
workers_dir = "c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers"

for root, dirs, files in os.walk(workers_dir):
    for file in files:
        if file.endswith(('.ts', '.js')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                # Find occurrences of .replace( or replace( with '{' or '}' or variables
                lines = content.split('\n')
                for idx, line in enumerate(lines):
                    if '.replace(' in line and ('{' in line or '}' in line or 'nome' in line or 'valor' in line or 'preco' in line):
                        print(f"{file}:{idx+1} -> {line.strip()}")
