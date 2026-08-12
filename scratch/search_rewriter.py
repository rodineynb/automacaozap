import os

def search_files(dir_path, query):
    for root, dirs, files in os.walk(dir_path):
        for file in files:
            if file.endswith('.ts') or file.endswith('.js'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        for line_num, line in enumerate(f, 1):
                            if query in line:
                                print(f"{path}:{line_num}: {line.strip()}")
                except Exception as e:
                    pass

search_files('workers', 'rewriteMessageViaLLM')
