"""ResumeFill: localhost-only resume editor, Python 3.10+."""
import argparse
import json
import hashlib
import os
import secrets
import re
import tempfile
import threading
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from parser import FIELDS, empty_profile, parse_resume, validate_profile

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
MAX_BYTES = 12 * 1024 * 1024
TOKEN = secrets.token_urlsafe(32)
APP_VERSION = '2.1.0'
LOCK = threading.RLock()

class RevisionConflict(ValueError): pass

def revision():
    path = DATA / 'profile.json'
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else 'new'

def backup_list():
    with LOCK:
        folder = DATA / 'backups'
        if not folder.exists(): return []
        result = []
        for path in sorted(folder.glob('*.json'), reverse=True):
            try:
                p = validate_profile(json.loads(path.read_text('utf-8')))
                result.append({'id': path.name, 'title': p['title'], 'time': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()})
            except (ValueError, OSError): continue
        return result[:10]

def read_profile():
    with LOCK:
        path = DATA / 'profile.json'
        return validate_profile(json.loads(path.read_text('utf-8'))) if path.exists() else empty_profile()

def save_profile(profile, expected_revision=None):
    profile = validate_profile(profile)
    DATA.mkdir(parents=True, exist_ok=True)
    with LOCK:
        if expected_revision is not None and expected_revision != revision():
            raise RevisionConflict('资料已在其他窗口更新。请先下载当前草稿，再刷新页面并重新核对，避免覆盖其他修改。')
        dest = DATA / 'profile.json'
        if dest.exists():
            previous = dest.read_bytes()
            if previous == json.dumps(profile, ensure_ascii=False, indent=2).encode('utf-8'): return
            folder = DATA / 'backups'; folder.mkdir(exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%f') + '-' + secrets.token_hex(3)
            try: validate_profile(json.loads(previous))
            except (ValueError, UnicodeError): suffix = '.broken'
            else: suffix = '.json'
            (folder / (stamp + suffix)).write_bytes(previous)
            for old in sorted(folder.glob('*.json'), reverse=True)[10:]: old.unlink()
        tmp = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=DATA, delete=False, newline='\n') as fp:
                json.dump(profile, fp, ensure_ascii=False, indent=2); tmp = fp.name
                fp.flush(); os.fsync(fp.fileno())
            os.replace(tmp, dest)
        finally:
            if tmp and Path(tmp).exists(): Path(tmp).unlink()

def restore_profile(backup_id, expected_revision=None):
    if not isinstance(backup_id, str) or not re.fullmatch(r'[0-9T]+-[0-9a-f]{6}\.json', backup_id):
        raise ValueError('备份编号无效。')
    with LOCK:
        path = DATA / 'backups' / backup_id
        p = validate_profile(json.loads(path.read_text('utf-8')))
        save_profile(p, expected_revision)
        return p

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): pass
    def respond(self, status, value, mime='application/json; charset=utf-8'):
        raw = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'")
        self.end_headers(); self.wfile.write(raw)
    def host_ok(self):
        return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')
    def do_GET(self):
        if not self.host_ok(): return self.respond(403, {'error': 'Invalid host'})
        route = urlparse(self.path).path
        if route == '/api/profile':
            with LOCK:
                try: p = read_profile(); warning = ''
                except (ValueError, OSError): p = empty_profile(); warning = '当前资料文件损坏，原文件已保留。请从下方备份恢复，或重新导入。'
                return self.respond(200, {'profile': p, 'labels': FIELDS, 'csrf': TOKEN, 'warning': warning, 'revision': revision()})
        if route == '/api/backups': return self.respond(200, {'backups': backup_list()})
        if route == '/api/health': return self.respond(200, {'ok': True, 'version': APP_VERSION})
        files = {'/': ('index.html', 'text/html; charset=utf-8'), '/app.js': ('app.js', 'text/javascript; charset=utf-8'), '/style.css': ('style.css', 'text/css; charset=utf-8'), '/demo': ('demo.html', 'text/html; charset=utf-8')}
        if route not in files: return self.respond(404, {'error': '页面不存在'})
        name, mime = files[route]; self.respond(200, (ROOT / 'static' / name).read_bytes(), mime)
    def do_POST(self):
        if not self.host_ok(): return self.respond(403, {'error': 'Invalid host'})
        origin = self.headers.get('Origin')
        allowed = (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}')
        if (origin and origin not in allowed) or not secrets.compare_digest(self.headers.get('X-ResumeFill-Token', ''), TOKEN):
            return self.respond(403, {'error': '请刷新本地管理页面后重试。'})
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= MAX_BYTES: return self.respond(413, {'error': '文件须小于 12 MB。'})
            route = urlparse(self.path).path
            body = self.rfile.read(size)
            if route == '/api/import':
                from urllib.parse import unquote
                profile, text = parse_resume(unquote(self.headers.get('X-Filename', 'resume.txt')), body)
                count=sum(bool(v.strip()) for v in profile['fields'].values())+sum(bool(v['value'].strip()) for v in profile['custom'])
                return self.respond(200, {'profile': profile, 'text': text, 'field_count': count, 'text_length': len(text), 'notice': f'文件读取成功，提取 {len(text)} 字，识别 {count} 项资料。请核对后保存。'})
            if route == '/api/save':
                with LOCK:
                    profile = validate_profile(json.loads(body)); save_profile(profile, self.headers.get('X-ResumeFill-Revision'))
                    return self.respond(200, {'ok': True, 'profile': profile, 'revision': revision()})
            if route == '/api/restore':
                request = json.loads(body)
                if not isinstance(request, dict): raise ValueError('请求格式错误。')
                with LOCK:
                    return self.respond(200, {'profile': restore_profile(request.get('id'), self.headers.get('X-ResumeFill-Revision')), 'revision': revision()})
            if route == '/api/parse-text':
                request=json.loads(body)
                if not isinstance(request,dict) or not isinstance(request.get('text'),str): raise ValueError('请提供文本。')
                profile,text=parse_resume('粘贴的简历.txt',request['text'].encode('utf-8'))
                count=sum(bool(v.strip()) for v in profile['fields'].values())+sum(bool(v['value'].strip()) for v in profile['custom'])
                return self.respond(200,{'profile':profile,'text':text,'field_count':count,'notice':f'已从粘贴文字识别 {count} 项资料。请核对后保存。'})
            return self.respond(404, {'error': '接口不存在'})
        except RevisionConflict as exc:
            self.respond(409, {'error': str(exc)})
        except Exception as exc:
            self.respond(400, {'error': str(exc)[:300]})

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=8765); ap.add_argument('--no-browser', action='store_true')
    args = ap.parse_args()
    try: server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    except OSError:
        print('Port occupied. Close the OLD ResumeFill terminal window first, then run again.\nOr run: python app.py --port 8766'); return 1
    server.daemon_threads = True
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'ResumeFill ready: {url}\nKeep this window open while editing. Ctrl+C to stop.')
    if not args.no_browser: threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

if __name__ == '__main__': raise SystemExit(main())
