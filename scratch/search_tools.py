import os

filepath = 'workers/services/llm-service.ts'
with open(filepath, 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f, 1):
        if 'fetchWithTimeout' in line:
            print(f"{idx}: {line.strip()}")
