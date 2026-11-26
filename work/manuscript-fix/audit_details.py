from docx import Document
from docx.oxml.ns import qn
from pathlib import Path
import re,collections,json
from lxml import etree
d=Document(r'C:\Users\ADMIN\OneDrive\Desktop\MANUSCRIPT 2 - NOV 20.docx')
print('FIRST TABLES')
for i,t in enumerate(d.tables[:8]):
 print(i,len(t.rows),len(t.columns),[[c.text for c in r.cells] for r in t.rows[:5]])
print('STYLE COUNTS',collections.Counter(p.style.name for p in d.paragraphs))
print('HEADING CANDIDATES')
for i,p in enumerate(d.paragraphs):
 text=p.text.strip()
 if text and len(text)<135 and not re.match(r'^(Figure|Table|Question|\d+[.\t])',text) and not (1662<=i<1920) and (p.style.name.lower().find('heading')>=0 or any(r.bold for r in p.runs)):
  print(i,p.style.name,repr(text))
print('FIGURES')
for i,p in enumerate(d.paragraphs):
 if re.match(r'^Figure\s+\d+',p.text.strip()):print(i,repr(p.text))
print('TABLE CAPTIONS')
for i,p in enumerate(d.paragraphs):
 if re.match(r'^Table\s+\d+',p.text.strip()):print(i,repr(p.text))
print('GUIDE SECTION')
for i in range(1657,1685):
 p=d.paragraphs[i];print(i,repr(p.text),p._p.xml[:1000] if p._p.xpath('./w:pPr/w:sectPr') else '')
