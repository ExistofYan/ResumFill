from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from parser import parse_resume

SAMPLE='''张 同学
可实习时长：6个月
student@example.com｜13812345678｜GitHub：https://github.com/example-student
教 育 背 景
软件工程｜硕士                 示例国立大学(QS50)                 2026年8月–至今
机械工程｜本科                 示例海洋大学                       2022年9月–2026年6月
专业技能
● 后端与数据库：Java、Spring Boot、PostgreSQL
● 部署与工具：Docker、Linux、Git
实习经历
Example Council              后端开发实习生             示例城市｜2026年7月–2026年9月
● 项目简介：面向社区的走访平台
● 我的职责：实现离线同步、并发任务认领和权限控制
开源项目
VESSEL—实时数据平台             2026年5月–2026年9月
● 技术栈：Spring Boot、Vue 3
● 查询优化：通过联合索引优化查询
科研经历
Python结构仿真与自动化分析
● 自动生成仿真结果
个人荣誉
● 英语成绩和奖学金
'''

class StructuredTests(unittest.TestCase):
    def test_multicolumn_chinese_resume(self):
        p,_=parse_resume('sample.txt',SAMPLE.encode());f=p['fields']
        self.assertEqual(f['name'],'张同学')
        self.assertEqual(f['email'],'student@example.com')
        self.assertEqual(f['phone'],'13812345678')
        self.assertIn('示例国立大学',f['school'])
        self.assertNotIn('海洋',f['school'])
        self.assertEqual(f['major'],'软件工程')
        self.assertEqual(f['degree'],'硕士')
        self.assertEqual(f['graduation'],'')
        self.assertEqual(f['company'],'Example Council')
        self.assertEqual(f['position'],'后端开发实习生')
        self.assertIn('联合索引',f['projects'])
        self.assertNotIn('自动生成仿真',f['projects'])
        self.assertIn('Java',f['skills'])
        self.assertEqual(f['availability'],'6个月')
        self.assertEqual([x['label'] for x in p['custom']],['科研经历','个人荣誉'])
    def test_completed_degree_date(self):
        text='李同学\n教育经历\n计算机科学｜本科      示例大学        2022年9月—2026年6月\n项目经历\nWeb app'
        f=parse_resume('x.txt',text.encode())[0]['fields']
        self.assertEqual(f['major'],'计算机科学');self.assertEqual(f['graduation'],'2026-06')
    def test_inline_headings_and_stop_at_awards(self):
        f=parse_resume('x.txt','王同学\n专业技能：Python、Java\n项目经历\nExample app\n个人荣誉\nScholarship'.encode())[0]['fields']
        self.assertEqual(f['skills'],'Python、Java');self.assertEqual(f['projects'],'Example app')
    def test_spaced_contacts_and_links(self):
        f=parse_resume('x.txt','姓名：王同学\nemail: student @ example . com\n手机：138 1234 5678\ngithub.com/example'.encode())[0]['fields']
        self.assertEqual(f['email'],'student@example.com');self.assertEqual(f['phone'],'13812345678');self.assertEqual(f['github'],'https://github.com/example')
    def test_english_education(self):
        text='Alex Smith\nEducation\nMaster of Software Engineering | Example University | 2024-02 - 2026-06\nSkills\nJava, Python\nExperience\nExample Ltd\nBackend Developer Intern\nBuilt APIs'
        f=parse_resume('x.txt',text.encode())[0]['fields']
        self.assertEqual(f['school'],'Example University');self.assertEqual(f['degree'],'硕士');self.assertEqual(f['major'],'Software Engineering');self.assertEqual(f['graduation'],'2026-06');self.assertEqual(f['company'],'Example Ltd')
    def test_pdf_pipeline_with_mock_reader_layout(self):
        calls=[]
        def extract(**kwargs):calls.append(kwargs);return SAMPLE
        reader=SimpleNamespace(is_encrypted=False,pages=[SimpleNamespace(extract_text=extract)])
        with patch.dict(sys.modules,{'pypdf':SimpleNamespace(PdfReader=lambda _:reader)}):p,_=parse_resume('sample.pdf',b'%PDF-fixture')
        self.assertEqual(p['fields']['major'],'软件工程');self.assertEqual(len(calls),2);self.assertEqual(calls[1]['extraction_mode'],'layout')
    def test_pdf_layout_failure_falls_back(self):
        def extract(**kwargs):
            if kwargs:raise ValueError('Layout failed')
            return SAMPLE
        reader=SimpleNamespace(is_encrypted=False,pages=[SimpleNamespace(extract_text=extract)])
        with patch.dict(sys.modules,{'pypdf':SimpleNamespace(PdfReader=lambda _:reader)}):p,_=parse_resume('sample.pdf',b'%PDF-fixture')
        self.assertEqual(p['fields']['email'],'student@example.com')

if __name__=='__main__':unittest.main()
