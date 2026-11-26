from docx import Document
from pathlib import Path
import re,json
p=Path(r'C:\Users\ADMIN\OneDrive\Desktop\MANUSCRIPT 2 - NOV 20.docx')
d=Document(p)
print('COUNTS',len(d.paragraphs),len(d.tables),len(d.inline_shapes),len(d.sections))
print('SECTIONS',[(s.page_width/914400,s.page_height/914400,s.left_margin/914400,s.right_margin/914400,s.top_margin/914400,s.bottom_margin/914400) for s in d.sections])
print('FRONT')
for i,p in enumerate(d.paragraphs[:240]):
 if p.text:print(i,p.style.name,repr(p.text[:230]))
print('HEADINGS AND GUIDE')
for i,p in enumerate(d.paragraphs):
 if p.style.name.startswith('Heading') or re.search(r'user.?s? guide|user manual|table of contents|list of figures|list of tables|appendix',p.text,re.I):print(i,p.style.name,repr(p.text[:220]))
print('LAST')
for i,p in list(enumerate(d.paragraphs))[-130:]:
 if p.text:print(i,p.style.name,repr(p.text[:150]))
text='\n'.join(f'{i}\t{p.style.name}\t{p.text}' for i,p in enumerate(d.paragraphs))
Path('work/manuscript-fix/paragraphs.txt').write_text(text,encoding='utf-8')
print('FIELDS',[(x.text) for x in d.element.xpath('.//w:instrText')][:40])
