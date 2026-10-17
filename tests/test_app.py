import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app
from parser import parse_resume, extract_text, validate_profile, empty_profile

class ParserTests(unittest.TestCase):
    def test_chinese_contact_and_sections(self):
        text='童颜\n邮箱：student@example.com\n手机：13812345678\n学校：澳洲国立大学\n专业：软件工程\n技术栈\nJava / Spring Boot\n项目经历\n航运平台'
        p,raw=parse_resume('简历.txt',text.encode())
        self.assertEqual(p['fields']['name'],'童颜')
        self.assertEqual(p['fields']['email'],'student@example.com')
        self.assertEqual(p['fields']['school'],'澳洲国立大学')
        self.assertEqual(p['fields']['skills'],'Java / Spring Boot')
        self.assertEqual(p['fields']['projects'],'航运平台')
        self.assertEqual(p['fields']['degree'],'')
    def test_english_aus_phone(self):
        p,_=parse_resume('resume.txt',b'Yan Tong\n+61 412 345 678\nSummary\nSoftware student\nSkills\nPython')
        self.assertEqual(p['fields']['phone'],'+61 412 345 678')
        self.assertEqual(p['fields']['summary'],'Software student')
    def test_csv_and_chinese_encodings(self):
        text='姓名,张同学\n专业,软件工程'
        p,_=parse_resume('resume.csv',text.encode('gb18030'))
        self.assertEqual(p['fields']['name'],'张同学')
        p,_=parse_resume('resume.txt','姓名：张同学'.encode('utf-16'))
        self.assertEqual(p['fields']['name'],'张同学')
    def test_docx_paragraphs_and_tables(self):
        data=io.BytesIO()
        with zipfile.ZipFile(data,'w') as z:
            z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Yan Tong</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>student@example.com</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>')
        p,_=parse_resume('x.docx',data.getvalue())
        self.assertEqual(p['fields']['email'],'student@example.com')
    def test_html_ignores_script(self):
        self.assertNotIn('secret',extract_text('x.html',b'<script>secret</script><p>Name: Yan Tong</p>'))
    def test_json_roundtrip(self):
        p=empty_profile();p['custom']=[{'label':'Second company','value':'Example'}]
        self.assertEqual(parse_resume('x.json',json.dumps(p).encode())[0],p)
    def test_reject_invalid(self):
        for v in [None,{}, {'fields':{'name':123}}, {'fields':{},'custom':{}}]:
            with self.assertRaises(ValueError):validate_profile(v)
        with self.assertRaises(ValueError):extract_text('x.doc',b'x')
        with self.assertRaises(ValueError):extract_text('x.docx',b'invalid')
    def test_reject_truncation_and_empty_import(self):
        p=empty_profile();p['fields']['summary']='a'*30001
        with self.assertRaises(ValueError):validate_profile(p)
        p=empty_profile();p['custom']=[{'label':'x','value':'a'*30001}]
        with self.assertRaises(ValueError):validate_profile(p)
        p=empty_profile();p['title']='a'*101
        with self.assertRaises(ValueError):validate_profile(p)
        with self.assertRaises(ValueError):parse_resume('empty.txt',b' \n')

class BackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.old=app.DATA;app.DATA=Path(self.tmp.name)
    def tearDown(self):
        app.DATA=self.old;self.tmp.cleanup()
    def test_restore_and_keep_current_as_backup(self):
        p=empty_profile();p['title']='Version A';app.save_profile(p)
        p['title']='Version B';app.save_profile(p)
        backup=app.backup_list()[0]
        self.assertEqual(backup['title'],'Version A')
        restored=app.restore_profile(backup['id'])
        self.assertEqual(restored['title'],'Version A')
        self.assertEqual(app.read_profile()['title'],'Version A')
        self.assertIn('Version B',[x['title'] for x in app.backup_list()])
    def test_identical_save_no_backup_and_retention(self):
        p=empty_profile();app.save_profile(p);app.save_profile(p)
        self.assertEqual(app.backup_list(),[])
        for i in range(16):p['title']=str(i);app.save_profile(p)
        self.assertEqual(len(app.backup_list()),10)
        self.assertEqual(len(list((app.DATA/'backups').glob('*.json'))),10)
    def test_corrupt_original_preserved(self):
        (app.DATA/'profile.json').write_bytes(b'broken')
        app.save_profile(empty_profile())
        self.assertEqual(next((app.DATA/'backups').glob('*.broken')).read_bytes(),b'broken')
        self.assertEqual(app.read_profile(),empty_profile())
    def test_bad_backup_id_and_invalid_save_cannot_overwrite(self):
        app.save_profile(empty_profile());before=(app.DATA/'profile.json').read_bytes()
        for bad in ['../profile.json','x','a/b.json',None]:
            with self.assertRaises(ValueError):app.restore_profile(bad)
        with self.assertRaises(ValueError):app.save_profile({'fields':{'name':10}})
        self.assertEqual((app.DATA/'profile.json').read_bytes(),before)
    def test_atomic_failure_keeps_previous(self):
        from unittest.mock import patch
        p=empty_profile();app.save_profile(p);p['title']='New'
        with patch.object(app.os,'replace',side_effect=OSError('disk failure')):
            with self.assertRaises(OSError):app.save_profile(p)
        self.assertEqual(app.read_profile()['title'],empty_profile()['title'])
        self.assertEqual([x.name for x in app.DATA.iterdir() if x.is_file()],['profile.json'])
    def test_stale_revision_cannot_overwrite(self):
        p=empty_profile();app.save_profile(p);version=app.revision()
        p['title']='Updated';app.save_profile(p,version)
        p['title']='Stale edit'
        with self.assertRaises(app.RevisionConflict):app.save_profile(p,version)
        self.assertEqual(app.read_profile()['title'],'Updated')

class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory();cls.old=app.DATA;app.DATA=Path(cls.tmp.name)
        cls.server=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();app.DATA=cls.old;cls.tmp.cleanup()
    def post(self,path,body,token=app.TOKEN,**headers):
        request=urllib.request.Request(self.base+path,data=body,headers={'X-ResumeFill-Token':token,**headers})
        return urllib.request.urlopen(request)
    def test_save_and_read(self):
        p=empty_profile();p['fields']['name']='测试姓名'
        with self.post('/api/save',json.dumps(p).encode()) as r:self.assertEqual(r.status,200)
        with urllib.request.urlopen(self.base+'/api/profile') as r:self.assertEqual(json.load(r)['profile']['fields']['name'],'测试姓名')
    def test_csrf_and_origin_and_host(self):
        for token,headers in [('',{}),(app.TOKEN,{'Origin':'https://evil.invalid'}),(app.TOKEN,{'Host':'evil.invalid'})]:
            with self.assertRaises(urllib.error.HTTPError) as caught:self.post('/api/save',b'{}',token,**headers)
            self.assertEqual(caught.exception.code,403)
    def test_import_does_not_save(self):
        before=app.read_profile()
        with self.post('/api/import',b'Name: Alice Smith',**{'X-Filename':'resume.txt'}) as r:self.assertEqual(json.load(r)['profile']['fields']['name'],'Alice Smith')
        self.assertEqual(app.read_profile(),before)
    def test_static_and_traversal(self):
        for route in ['/', '/app.js','/style.css','/demo']:
            with urllib.request.urlopen(self.base+route) as r:self.assertEqual(r.status,200)
        with self.assertRaises(urllib.error.HTTPError):urllib.request.urlopen(self.base+'/../app.py')
    def test_backup_endpoints_and_reject_traversal(self):
        p=empty_profile();p['title']='Endpoint A'
        with self.post('/api/save',json.dumps(p).encode()):pass
        p['title']='Endpoint B'
        with self.post('/api/save',json.dumps(p).encode()):pass
        with urllib.request.urlopen(self.base+'/api/backups') as r:backups=json.load(r)['backups']
        target=next(x for x in backups if x['title']=='Endpoint A')
        with self.post('/api/restore',json.dumps({'id':target['id']}).encode()) as r:self.assertEqual(json.load(r)['profile']['title'],'Endpoint A')
        with self.assertRaises(urllib.error.HTTPError) as caught:self.post('/api/restore',b'{"id":"../profile.json"}')
        self.assertEqual(caught.exception.code,400)
    def test_conflict_http_status(self):
        with urllib.request.urlopen(self.base+'/api/profile') as r:version=json.load(r)['revision']
        p=empty_profile();p['title']='New edit'
        with self.post('/api/save',json.dumps(p).encode(),**{'X-ResumeFill-Revision':version}):pass
        p['title']='Stale edit'
        with self.assertRaises(urllib.error.HTTPError) as caught:self.post('/api/save',json.dumps(p).encode(),**{'X-ResumeFill-Revision':version})
        self.assertEqual(caught.exception.code,409)
    def test_import_feedback_and_paste_endpoint(self):
        with self.post('/api/import',b'Name: Alex Smith\nEmail: alex@example.com',**{'X-Filename':'resume.txt'}) as r:
            result=json.load(r)
        self.assertGreaterEqual(result['field_count'],2)
        self.assertGreater(result['text_length'],0)
        with self.post('/api/parse-text',json.dumps({'text':'Name: Alex Smith\nSkills: Python'}).encode()) as r:
            result=json.load(r)
        self.assertEqual(result['profile']['fields']['skills'],'Python')
        self.assertGreaterEqual(result['field_count'],2)
        with self.assertRaises(urllib.error.HTTPError) as caught:self.post('/api/parse-text',b'{"text":null}')
        self.assertEqual(caught.exception.code,400)

if __name__=='__main__':unittest.main()
