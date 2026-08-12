import os

log_path = r'C:\Users\Note\.gemini\antigravity\brain\91b36432-2a9c-4d76-a4eb-8138bd49400f\.system_generated\tasks\task-9344.log'

with open(log_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

for line in lines:
    if 'worker-configuration.d.ts' in line:
        continue
    if 'build/client/assets' in line or 'build\\client\\assets' in line:
        continue
    if 'node_modules' in line:
        continue
    print(line.strip())
