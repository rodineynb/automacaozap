import subprocess
import sys

# Set encoding for console output on Windows
if sys.version_info >= (3, 7):
    sys.stdout.reconfigure(encoding='utf-8')

def run_query(query):
    print(f"\n========================================\nQuery: {query}\n========================================")
    cmd = ["npx", "wrangler", "d1", "execute", "whatsapp-platform", "--remote", f"--command={query}"]
    try:
        res = subprocess.run(cmd, capture_output=True, encoding='utf-8', errors='replace', shell=True)
        print("STDOUT:")
        print(res.stdout)
        print("STDERR:")
        print(res.stderr)
        print(f"Exit code: {res.returncode}")
    except Exception as e:
        print(f"Error: {e}")

# Run queries
run_query("SELECT name FROM sqlite_master WHERE type='table'")
run_query("SELECT * FROM products")
run_query("SELECT * FROM product_delivery_links")
run_query("SELECT * FROM product_upsells")
