with open('app/app.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'badge' in line:
        print(f"app/app.css:{i+1}: {line.strip()}")
