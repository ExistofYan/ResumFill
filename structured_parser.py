"""Conservative extraction from resume sections, including common multi-column layouts."""
import re
import unicodedata

SECTION_ALIASES = {
    'summary': ('自我评价','个人简介','自我介绍','个人总结','summary','profile','professional summary','personal statement','about me'),
    'skills': ('专业技能','技术技能','技术栈','技能清单','个人技能','技能','skills','technical skills','key skills'),
    'education_text': ('教育背景','教育经历','学历背景','education','educational background','education background'),
    'experience_text': ('实习经历','工作经历','工作经验','实践经历','工作与实习经历','experience','work experience','internship experience','employment','employment history'),
    'projects': ('项目经历','项目经验','开源项目','个人项目','projects','project experience','selected projects','open source projects'),
    'research': ('科研经历','研究经历','research','research experience'),
    'honors': ('个人荣誉','荣誉奖项','获奖情况','奖项荣誉','荣誉证书','awards','honors','achievements'),
    'other': ('兴趣爱好','其他信息','语言能力','语言成绩','hobbies','interests','languages','references','certifications'),
}

def normalized(text):
    text=unicodedata.normalize('NFKC',text).replace('\r\n','\n').replace('\r','\n')
    text=re.sub(r'[\u200b-\u200f\u202a-\u202e\ufeff]', '', text)
    return text.replace('\xa0',' ')

def heading(text):
    clean=text.strip(' \t#*●•·-—:：|｜0123456789.、()（）').lower()
    compact=re.sub(r'\s+', '', clean)
    for key,names in SECTION_ALIASES.items():
        if any(compact==re.sub(r'\s+','',n) for n in names):return key
    return None

def sections(text):
    result={k:[] for k in SECTION_ALIASES};current=None
    for line in text.splitlines():
        if not line.strip():continue
        bulleted=line.lstrip().startswith(('●','•','·','- '))
        key=heading(line)
        if key and not bulleted:current=key;continue
        # Inline headings such as "专业技能：Java、Python".
        m=re.match(r'^\s*([^:：]{2,40})[:：]\s*(.+)$',line)
        if m and not bulleted and heading(m.group(1)):
            current=heading(m.group(1));result[current].append(m.group(2));continue
        if current:result[current].append(line.strip())
    return {k:'\n'.join(v) for k,v in result.items()}

DEGREE=re.compile(r'博士研究生|硕士研究生|本科|博士|硕士|学士|大专|专科|Ph\.?D\.?|Doctor(?:ate|al)?|Master(?:[’\']?s)?(?:\s+of\s+[A-Za-z ]+)?|MSc|MEng|Bachelor(?:[’\']?s)?(?:\s+of\s+[A-Za-z ]+)?|BSc|BEng',re.I)
SCHOOL=re.compile(r'[\u4e00-\u9fffA-Za-z· -]{2,45}(?:大学|学院|学校)(?:\([^)]*\))?|(?:[A-Z][\w&.-]*[ \t]+){0,8}(?:University|College|Institute)(?:[ \t]+of[ \t]+(?:[A-Z][\w&.-]*[ \t]*){1,5})?|(?:Australian National University|ANU)',re.I)
DATES=re.compile(r'(?<!\d)((?:19|20)\d{2})\s*(?:年\s*|[-./]\s*)(0?[1-9]|1[0-2])\s*月?|(?<!\d)((?:19|20)\d{2})(?!\d)')

def date_strings(text):
    result=[]
    for m in DATES.finditer(text):result.append(f'{m.group(1)}-{int(m.group(2)):02d}' if m.group(1) else m.group(3))
    return result

def clean_piece(value):
    return value.strip(' \t|｜,，;；:：-—●•·')

def infer_education(body,fields):
    if not body:return
    # Use the first education entry, never a lower entry's date or school.
    rows=[x.strip() for x in body.splitlines() if x.strip()]
    stop=next((i for i,x in enumerate(rows[1:],1) if SCHOOL.search(x)),len(rows))
    chunk='\n'.join(rows[:max(1,stop)])
    # If degree/major precede school on a separate line, include that first school.
    if not SCHOOL.search(chunk):
        index=next((i for i,x in enumerate(rows[:5]) if SCHOOL.search(x)),None)
        if index is not None:chunk='\n'.join(rows[:index+1])
    school=SCHOOL.search(chunk)
    degree=DEGREE.search(chunk)
    if school and not fields['school']:
        value=school.group().strip()
        # Remove major/degree text accidentally captured before the institution.
        parts=re.split(r'[|｜\t]| {2,}',value);value=clean_piece(parts[-1])
        value=re.sub(r'^.*?(?:硕士|本科|学士|博士)\s*','',value).strip()
        fields['school']=re.sub(r'\(\s*QS\s*\d+\s*\)', '', value, flags=re.I).strip()
    if degree and not fields['degree']:
        value=degree.group();low=value.lower()
        fields['degree']='硕士' if re.search(r'硕士|master|msc|meng',low) else '博士' if re.search(r'博士|ph\.?d|doctor',low) else '本科' if re.search(r'本科|学士|bachelor|bsc|beng',low) else value
    if not fields['major']:
        # Common Chinese layouts: 软件工程 | 硕士 | 某大学 | 日期.
        if degree:
            before=chunk[:degree.start()].split('\n')[-1]
            before=clean_piece(before)
            if before and not SCHOOL.search(before) and len(before)<=50 and not DATES.search(before):fields['major']=before
        if not fields['major']:
            major=re.search(r'(?:专业|Major|Field of Study)\s*[:：]\s*([^\n|｜]+)',chunk,re.I)
            if major:fields['major']=clean_piece(major.group(1))
        if not fields['major']:
            major=re.search(r'(?:Master|Bachelor)(?:[’\']?s)?\s+of\s+([^\n|｜]+)',chunk,re.I)
            if major:fields['major']=clean_piece(major.group(1))
    # Only a completed range is treated as graduation; "至今" is not a graduation date.
    dates=date_strings(chunk)
    if len(dates)>=2 and not re.search(r'至今|present|current|ongoing',chunk,re.I) and not fields['graduation']:fields['graduation']=dates[-1]

def infer_work(body,fields):
    if not body:return
    rows=[x.strip() for x in body.splitlines() if x.strip()]
    head='\n'.join(rows[:3]);first=rows[0]
    role=re.search(r'[\u4e00-\u9fffA-Za-z/ +.-]{0,18}(?:实习生|工程师|研究助理|开发人员|经理)|(?:[A-Za-z][A-Za-z /-]*\s)?(?:Developer|Engineer|Intern|Assistant|Analyst)(?:\s+Intern)?',head,re.I)
    if role and not fields['position']:fields['position']=clean_piece(re.split(r'[|｜\t]| {2,}',role.group())[-1])
    if not fields['company']:
        parts=re.split(r'\s{2,}|\t|[|｜]',first)
        first_part=clean_piece(parts[0])
        if len(parts)>1 and first_part and not DATES.search(first_part):fields['company']=first_part
        elif not role or role.start()>=len(first):
            if 1<len(first_part)<=70 and not DATES.search(first_part) and not first_part.startswith(('●','•')):fields['company']=first_part
    if not fields['work_description']:
        body_rows=rows[1:]
        # End at an unbulleted next employer header; keep the complete section separately.
        for i,line in enumerate(body_rows):
            if i and DATES.search(line) and len(re.split(r'\s{2,}|[|｜]',line))>=3 and not line.startswith(('●','•','-')):body_rows=body_rows[:i];break
        fields['work_description']='\n'.join(body_rows)

def enrich(text,fields,custom):
    text=normalized(text);parts=sections(text)
    for key in ('summary','skills','education_text','experience_text','projects'):
        if parts[key]:fields[key]=parts[key]
    # Most PDF resumes place contacts on a single line with pipes. Do not require labels.
    email=re.search(r'[A-Za-z0-9._%+\-]+\s*@\s*[A-Za-z0-9-]+(?:\s*\.\s*[A-Za-z0-9-]+)+',text)
    if email:fields['email']=re.sub(r'\s+','',email.group())
    phone=re.search(r'(?<!\d)(?:\+?86[ \-]?)?1[3-9](?:[ \-]*\d){9}(?!\d)',text)
    if phone:fields['phone']=re.sub(r'[ \-]','',phone.group())
    if not fields['name']:
        for line in text.splitlines()[:5]:
            compact=re.sub(r'\s+','',line)
            if re.fullmatch(r'[\u4e00-\u9fff]{2,4}',compact) and not heading(compact) and compact not in ('个人简历','求职简历','基本信息'):
                fields['name']=compact;break
    infer_education(parts['education_text'],fields)
    infer_work(parts['experience_text'],fields)
    # Availability is only taken from an explicitly labelled statement.
    match=re.search(r'(?:可实习时长|实习时长|可实习时间|到岗时间|最早到岗时间|Availability)\s*[:：]\s*([^\n|｜]+)',text,re.I)
    if match and not fields['availability']:fields['availability']=match.group(1).strip()
    # Links should also work with native URL inputs.
    for key in ('github','linkedin','website'):
        if fields[key] and not re.match(r'^https?://',fields[key],re.I):fields[key]='https://'+fields[key]
    for key,label in (('research','科研经历'),('honors','个人荣誉')):
        if parts[key] and not any(x['label']==label for x in custom):custom.append({'label':label,'value':parts[key]})
    return parts
