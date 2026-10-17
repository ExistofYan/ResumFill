"""Local resume extraction. No network or LLM services are used."""
import csv
import io
import json
import re
import zipfile
from structured_parser import enrich, normalized
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET

FIELDS = {
    'name': '姓名 / Full name', 'first_name': '英文名 / First name',
    'last_name': '英文姓 / Last name', 'email': '邮箱', 'phone': '手机',
    'city': '现居城市', 'address': '详细地址', 'postcode': '邮编',
    'linkedin': 'LinkedIn', 'github': 'GitHub', 'website': '个人网站',
    'job_title': '意向职位', 'availability': '到岗时间',
    'summary': '自我评价 / 简介', 'skills': '技能',
    'school': '学校（首项）', 'degree': '学历（首项）', 'major': '专业（首项）',
    'graduation': '毕业时间（首项）', 'company': '公司（首项）',
    'position': '任职职位（首项）', 'work_description': '工作职责（首项）',
    'education_text': '完整教育经历', 'experience_text': '完整工作经历',
    'projects': '项目经历', 'cover_letter': '求职信',
}

def empty_profile():
    return {'version': 1, 'title': '我的简历', 'fields': {k: '' for k in FIELDS}, 'custom': []}

class TextHTML(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []; self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'): self.hidden += 1
        if tag in ('p', 'br', 'div', 'li', 'tr', 'h1', 'h2'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script', 'style'): self.hidden = max(0, self.hidden - 1)
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)

def decode_text(data):
    if data.startswith((b'\xff\xfe', b'\xfe\xff')): return data.decode('utf-16')
    if b'\x00' in data[:200]:
        try: return data.decode('utf-16-le')
        except UnicodeError: pass
    for enc in ('utf-8-sig', 'gb18030'):
        try: return data.decode(enc)
        except UnicodeError: pass
    raise ValueError('无法识别文本编码，请另存为 UTF-8。')

def extract_text(filename, data):
    suffix = Path(filename).suffix.lower()
    if suffix in ('.txt', '.md', '.csv'):
        text = decode_text(data)
        if suffix == '.csv': text = '\n'.join('：'.join(r) for r in csv.reader(io.StringIO(text)))
        return text
    if suffix in ('.html', '.htm'):
        parser = TextHTML(); parser.feed(decode_text(data)); return ''.join(parser.parts)
    if suffix == '.docx':
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                member = z.getinfo('word/document.xml')
                if member.file_size > 20 * 1024 * 1024: raise ValueError('Word 文档内容过大。')
                root = ET.fromstring(z.read(member))
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            return '\n'.join(''.join(t.text or '' for t in p.findall('.//w:t', ns)) for p in root.findall('.//w:p', ns))
        except (zipfile.BadZipFile, KeyError, ET.ParseError) as exc:
            raise ValueError('无法读取 DOCX，请用 Word 重新另存为 .docx。') from exc
    if suffix == '.pdf':
        try: from pypdf import PdfReader
        except ImportError as exc: raise ValueError('PDF 需要安装依赖：python -m pip install -r requirements.txt') from exc
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(''): raise ValueError('请先移除 PDF 密码。')
        if len(reader.pages) > 100: raise ValueError('请上传不超过 100 页的简历。')
        chunks=[]
        for page in reader.pages:
            plain=page.extract_text() or ''
            try: layout=page.extract_text(extraction_mode='layout',layout_mode_space_vertically=False) or ''
            except Exception: layout=''
            # Layout preserves columns useful for institution/role extraction. Fall back
            # when that extractor loses much of the actual text.
            chunks.append(layout if len(re.sub(r'\s','',layout))>=len(re.sub(r'\s','',plain))*.75 else plain)
        text='\n'.join(chunks)
        if not text.strip(): raise ValueError('这是扫描/图片型 PDF，当前版本没有 OCR。请上传可复制文字的 PDF、DOCX 或 TXT。')
        return text
    raise ValueError('支持 PDF、DOCX、TXT、Markdown、HTML、CSV，以及本工具导出的 JSON。旧版 DOC 请先另存为 DOCX。')

def validate_profile(value):
    if not isinstance(value, dict) or not isinstance(value.get('fields'), dict):
        raise ValueError('资料 JSON 必须包含 fields 对象。')
    p = empty_profile()
    title = value.get('title', '我的简历')
    if not isinstance(title, str) or len(title) > 100: raise ValueError('资料名称必须是 100 字以内的文本。')
    p['title'] = title
    for k in FIELDS:
        v = value['fields'].get(k, '')
        if not isinstance(v, str): raise ValueError(f'{k} 必须是文本。')
        if len(v) > 30000: raise ValueError(f'{FIELDS[k]} 超过 30000 字，请缩短后重试；不会自动截断。')
        p['fields'][k] = v
    custom = value.get('custom', [])
    if not isinstance(custom, list) or len(custom) > 100: raise ValueError('自定义字段最多 100 个。')
    for item in custom:
        if not isinstance(item, dict) or not all(isinstance(item.get(k), str) for k in ('label', 'value')):
            raise ValueError('自定义字段需要 label 和 value 文本。')
        if len(item['label']) > 100 or len(item['value']) > 30000: raise ValueError('自定义字段名称最多 100 字，内容最多 30000 字。')
        p['custom'].append({'label': item['label'], 'value': item['value']})
    return p

def parse_resume(filename, data):
    if Path(filename).suffix.lower() == '.json':
        return validate_profile(json.loads(decode_text(data))), '已导入结构化资料。'
    text = normalized(extract_text(filename, data))
    if not text.strip(): raise ValueError('文件中没有可读取的文字，请换一份文字版简历。')
    if len(text) > 500000: raise ValueError('文字内容过长，请只上传简历。')
    p = empty_profile(); p['title'] = Path(filename).stem[:100]
    f = p['fields']; lines = [x.strip() for x in text.splitlines() if x.strip()]
    patterns = {
        'email': r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
        'github': r'(?:https?://)?(?:www\.)?github\.com/[\w\-]+',
        'linkedin': r'(?:https?://)?(?:www\.)?linkedin\.com/in/[\w%\-]+',
    }
    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.I)
        if match: f[key] = match.group(0)
    phone = re.search(r'(?<!\d)(?:\+?86[ \-]?)?1[3-9]\d{9}(?!\d)|(?<!\d)(?:\+61[ \-]?|0)[23478](?:[ ()\-]*\d){8}(?!\d)', text)
    if phone: f['phone'] = phone.group(0)
    aliases = {
        'name': ['姓名', 'full name', 'name'], 'city': ['现居城市', '现居地', 'city'],
        'address': ['详细地址', 'address'], 'job_title': ['求职意向', '意向职位', 'desired position'],
        'school': ['学校', '院校', 'university', 'school'], 'degree': ['学历', 'degree'],
        'major': ['专业', 'major'], 'availability': ['到岗时间', 'availability'],
        'graduation': ['毕业时间', 'graduation'], 'company': ['公司', 'company'],
        'position': ['任职职位', '职位', 'job title'],
    }
    for key, labels in aliases.items():
        for label in labels:
            m = re.search(r'(?:^|\n)\s*' + re.escape(label) + r'\s*[:：]\s*([^\n]+)', text, re.I)
            if m: f[key] = m.group(1).strip(); break
    if not f['name'] and lines:
        first = lines[0]
        if re.fullmatch(r'[\u4e00-\u9fff]{2,4}', first): f['name'] = first
        elif re.fullmatch(r'[A-Za-z]+(?:[ \-][A-Za-z]+){1,3}', first) and first.lower() not in ('curriculum vitae', 'resume profile'):
            f['name'] = first
    sections = {
        'summary': ['自我评价', '个人简介', '自我介绍', 'profile', 'summary', 'professional summary'],
        'skills': ['专业技能', '技术栈', '技能', 'skills', 'technical skills'],
        'education_text': ['教育背景', '教育经历', 'education'],
        'experience_text': ['实习经历', '工作经历', 'experience', 'work experience', 'employment'],
        'projects': ['项目经历', '开源项目', 'projects', 'project experience'],
    }
    current = None; pieces = {k: [] for k in sections}
    for line in lines:
        clean = line.strip('# *:：').lower()
        found = next((k for k, names in sections.items() if clean in names), None)
        if found: current = found
        elif current: pieces[current].append(line)
    for k, parts in pieces.items():
        if parts: f[k] = '\n'.join(parts)
    enrich(text, f, p['custom'])
    return p, text
