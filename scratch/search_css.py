with open('app/app.css', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    for i, line in enumerate(lines):
        if 'date-input' in line or 'toggle-btn' in line:
            print(f"Line {i+1}: {line.strip()}")
