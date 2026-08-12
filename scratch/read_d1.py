import subprocess
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

tables = [
    "automation_funnel_fields",
    "automation_followup_stages",
    "automation_crm_stages"
]

print("Fetching data from D1...")

for table in tables:
    print(f"\n--- TABLE: {table} ---")
    
    # We can select key text columns and print them
    if table == "automation_funnel_fields":
        query = "SELECT id, type, content FROM automation_funnel_fields;"
    elif table == "automation_followup_stages":
        query = "SELECT id, name, key, message FROM automation_followup_stages;"
    else:
        query = "SELECT id, name, key, message FROM automation_crm_stages;"
        
    cmd = [
        "npx", "wrangler", "d1", "execute", "whatsapp-platform",
        "--remote", "--command", query
    ]
    
    res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace', shell=True)
    
    output_lines = res.stdout.splitlines()
    print(f"Total lines returned: {len(output_lines)}")
    
    # Search for issue patterns in output
    for idx, line in enumerate(output_lines):
        if "primeiro_nome" in line or "primeiro_name" in line:
            print(f"Line {idx}: {line}")
        if "**" in line:
            print(f"Line {idx}: {line}")
            
    # Also write raw output to a file for manual review
    with open(f"c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/scratch/raw_{table}.txt", "w", encoding="utf-8") as f:
        f.write(res.stdout)
        f.write("\n\nSTDERR:\n")
        f.write(res.stderr)
        
print("\nDone writing raw tables to scratch folder.")
