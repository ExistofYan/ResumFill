"""Create an isolated environment and start the editor."""
import os
from pathlib import Path
import subprocess
import sys
import venv

if sys.version_info < (3, 10):
    print('Please install Python 3.10 or newer.')
    raise SystemExit(1)

root = Path(__file__).resolve().parent
os.chdir(root)
env = root / '.venv'
python = env / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
if not python.exists():
    print('Creating local Python environment...')
    venv.EnvBuilder(with_pip=True).create(env)
ready = subprocess.run([str(python), '-c', 'import pypdf'], capture_output=True).returncode == 0
if not ready:
    print('Installing PDF reader (internet needed on first launch)...')
    installed = subprocess.run([str(python), '-m', 'pip', 'install', '-r', 'requirements.txt']).returncode
    if installed: print('PDF reader installation failed. DOCX/TXT/JSON remain available. Retry later for PDF.')
raise SystemExit(subprocess.call([str(python), 'app.py', *sys.argv[1:]]))
