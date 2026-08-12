import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

dumps = [
    "raw_automation_funnel_fields.txt",
    "raw_automation_followup_stages.txt",
    "raw_automation_crm_stages.txt"
]

# Write results to output file
out_path = "c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/scratch/analysis_result.txt"
with open(out_path, "w", encoding="utf-8") as out_f:
    out_f.write("Analyzing database dumps for formatting issues...\n")
    for dump in dumps:
        path = f"c:/Users/Note/Desktop/Antigravity/AutomacaoZAP/scratch/{dump}"
        if not os.path.exists(path):
            out_f.write(f"File not found: {path}\n")
            continue
            
        out_f.write(f"\n========================================\nFile: {dump}\n========================================\n")
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
            
        lines = content.splitlines()
        for idx, line in enumerate(lines):
            # Scan for **
            if "**" in line:
                out_f.write(f"[DOUBLE ASTERISKS] Line {idx}: {line.strip()}\n")
                
            # Scan for any placeholder in curly braces (both single {name} and double {{name}} formats)
            braces = re.findall(r'{+[^}]+}+', line)
            if braces:
                for b in braces:
                    # Normal variables
                    clean_b = b.replace('{', '').replace('}', '')
                    if clean_b not in ['primeiro_nome', 'nome', 'nome_cliente', 'email_cliente', 'valor_pago', 'valor', 'preco', 'PRICE', 'produto']:
                        out_f.write(f"[UNKNOWN PLACEHOLDER] Line {idx}: {b} in line: {line.strip()}\n")
                    else:
                        out_f.write(f"[VALID PLACEHOLDER] Line {idx}: {b} in line: {line.strip()}\n")

print("Done writing analysis_result.txt.")

