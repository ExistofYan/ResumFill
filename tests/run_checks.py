"""Developer-only checks; Node.js is not required to use ResumeFill."""
from pathlib import Path
import shutil
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
node=shutil.which('node')
if not node: raise SystemExit('Node.js required for developer JavaScript tests.')
commands=[[sys.executable,'-m','unittest','discover','-s','tests','-v']]
commands.extend([node,'--check',str(p.relative_to(root))] for folder in ('extension','static') for p in sorted((root/folder).glob('*.js')))
commands.extend([node,str(p.relative_to(root))] for p in sorted((root/'tests').glob('*.test.js')))
for command in commands:
    print('RUN:', ' '.join(command),flush=True)
    subprocess.run(command,cwd=root,check=True)
print('All checks passed.')
