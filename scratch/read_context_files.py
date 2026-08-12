import os
import sys

# Reconfigure stdout to use utf-8 to avoid encoding errors on Windows
if sys.version_info >= (3, 7):
    sys.stdout.reconfigure(encoding='utf-8')

root_dir = "c:/Users/Note/Desktop/Antigravity/AutomacaoZAP"

def read_tail(filename, num_lines=50):
    path = os.path.join(root_dir, filename)
    if not os.path.exists(path):
        print(f"File {filename} does not exist.")
        return
    print(f"\n=== Tail of {filename} ({num_lines} lines) ===")
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        for line in lines[-num_lines:]:
            # Clean non-printable/dangerous chars or write directly to sys.stdout
            sys.stdout.write(line)

def read_full(filename):
    path = os.path.join(root_dir, filename)
    if not os.path.exists(path):
        print(f"File {filename} does not exist.")
        return
    print(f"\n=== Full content of {filename} ===")
    with open(path, "r", encoding="utf-8") as f:
        sys.stdout.write(f.read())

read_tail("PROGRESS.md", 60)
read_full("STACK.md")
read_tail("ARCHITECTURE.md", 50)
