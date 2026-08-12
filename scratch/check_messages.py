import subprocess
import json
import re
import os
import sys

# Ensure UTF-8 output encoding for print statements to avoid UnicodeEncodeError in Windows terminal
sys.stdout.reconfigure(encoding='utf-8')

print("--- SCANNING FILES FOR ISSUES ---")

# Scan the workers/ directory for files containing {primeiro_nome} or **
workers_dir = "c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/workers"
file_matches = []

for root, dirs, files in os.walk(workers_dir):
    for file in files:
        if file.endswith(('.ts', '.js')):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    lines = content.split('\n')
                    for idx, line in enumerate(lines):
                        if 'primeiro_nome' in line:
                            file_matches.append({
                                'type': 'variable_name',
                                'file': path,
                                'line': idx + 1,
                                'content': line.strip()
                            })
                        if '**' in line and not line.strip().startswith(('//', '/*', '*')):
                            # Ignore markdown comments or block comment indicators
                            file_matches.append({
                                'type': 'double_asterisks',
                                'file': path,
                                'line': idx + 1,
                                'content': line.strip()
                            })
            except Exception as e:
                print(f"Error reading {path}: {e}")

print(f"Found {len(file_matches)} matches in files:")
for m in file_matches:
    print(f"[{m['type']}] {m['file']}:{m['line']} -> {m['content']}")


print("\n--- SCANNING D1 DATABASE TABLES ---")

tables_to_check = [
    {
        'name': 'automation_funnel_fields',
        'id_col': 'id',
        'text_cols': ['content'],
        'context_cols': ['stage_id']
    },
    {
        'name': 'automation_followup_stages',
        'id_col': 'id',
        'text_cols': ['message'],
        'context_cols': ['name', 'class', 'key']
    },
    {
        'name': 'automation_crm_stages',
        'id_col': 'id',
        'text_cols': ['message'],
        'context_cols': ['name', 'key']
    }
]

for table in tables_to_check:
    print(f"\nChecking table: {table['name']}...")
    cols_str = ", ".join([table['id_col']] + table['text_cols'] + table['context_cols'])
    query = f"SELECT {cols_str} FROM {table['name']};"
    
    cmd = [
        "npx", "wrangler", "d1", "execute", "whatsapp-platform", 
        "--remote", "--json", "--command", query
    ]
    
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True, shell=True)
        # Parse JSON output from wrangler
        # wrangler output might contain some headers before the actual JSON block
        output = res.stdout.strip()
        
        # Try to find the JSON array in the output
        json_start = output.find('[')
        if json_start != -1:
            json_str = output[json_start:]
            data = json.loads(json_str)
            
            # Since wrangler executes returning a list of results (one per query, or list of results)
            # Actually, wrangler returns a JSON object with query results, or a list of objects
            # Let's see what data looks like. If it's a list, it might be the list of result objects
            if isinstance(data, list) and len(data) > 0 and 'results' in data[0]:
                results = data[0]['results']
            else:
                results = data
                
            print(f"Fetched {len(results)} rows.")
            for row in results:
                for text_col in table['text_cols']:
                    val = row.get(text_col, "")
                    if not val:
                        continue
                    
                    # Scan for primeiro_nome (in braces) or double asterisks
                    issues = []
                    if 'primeiro_nome' in val:
                        issues.append(f"Contains 'primeiro_nome'")
                    if '**' in val:
                        issues.append(f"Contains double asterisks '**'")
                        
                    if issues:
                        context = " | ".join([f"{c}: {row.get(c)}" for c in table['context_cols']])
                        print(f"Row ID {row.get(table['id_col'])} ({context}):")
                        print(f"  Issues: {', '.join(issues)}")
                        print(f"  Content: {val}\n")
        else:
            print("Could not find JSON array in wrangler output.")
            print(output[:500])
    except Exception as e:
        print(f"Error querying table {table['name']}: {e}")
        if 'res' in locals():
            print(res.stderr)
