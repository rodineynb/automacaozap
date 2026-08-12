import os

for root, dirs, files in os.walk('app'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
                if 'Hoje' in content:
                    print(f"Found in {path}")
                    # Print lines
                    lines = content.split('\n')
                    for i, line in enumerate(lines):
                        if 'Hoje' in line:
                            print(f"  Line {i+1}: {line.strip()}")

