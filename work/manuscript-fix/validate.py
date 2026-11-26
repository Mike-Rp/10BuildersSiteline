from pathlib import Path
import json,re,importlib.util
from docx import Document
from zipfile import ZipFile
base=Path('work/manuscript-fix')
rows=json.loads((base/'final-page-map.json').read_text(encoding='utf-8-sig'))
fields=json.loads((base/'final-field-values.json').read_text(encoding='utf-8-sig'))
values={x['bookmark']:x['value'] for x in fields}
def roman(n):
 out=''
 for k,v in [(1000,'m'),(900,'cm'),(500,'d'),(400,'cd'),(100,'c'),(90,'xc'),(50,'l'),(40,'xl'),(10,'x'),(9,'ix'),(5,'v'),(4,'iv'),(1,'i')]:
  while n>=k:out+=v;n-=k
 return out
intro=next(x for x in rows if x['bookmark']=='IndexContents0145')['physicalPage']
errors=[]
for row in rows:
 expected=roman(row['pageNumber']) if row['physicalPage']<intro else str(row['pageNumber'])
 if values.get(row['bookmark'])!=expected:errors.append((row['bookmark'],expected,values.get(row['bookmark'])))
print('PAGE FIELDS',len(fields),'TARGETS',len(rows),'MISMATCHES',errors)
assert not errors
assert len(rows)==384 and len(fields)==384
original=Document(r'C:\Users\ADMIN\OneDrive\Desktop\MANUSCRIPT 2 - NOV 20.docx')
final=Document('output/Manuscript Corrected.docx')
assert [(s.page_width,s.page_height,s.orientation) for s in original.sections]==[(s.page_width,s.page_height,s.orientation) for s in final.sections]
assert all(abs(s.left_margin/914400-1.5)<.001 and all(abs(v/914400-1)<.001 for v in [s.top_margin,s.bottom_margin,s.right_margin]) for s in final.sections)
assert len(original.inline_shapes)==len(final.inline_shapes)==302
with ZipFile(r'C:\Users\ADMIN\OneDrive\Desktop\MANUSCRIPT 2 - NOV 20.docx') as a,ZipFile('output/Manuscript Corrected.docx') as b:
 for n in a.namelist():
  if n.startswith('word/media/'):assert a.read(n)==b.read(n),n
print('All images and page orientations preserved. Required margins verified.')
print('FRONT PAGE RANGE',intro-1)
print('GUIDE PAGE RANGE',json.loads((base/'final-guide-pages.json').read_text(encoding='utf-8-sig'))[0],json.loads((base/'final-guide-pages.json').read_text(encoding='utf-8-sig'))[-1])
print('PYPDF',bool(importlib.util.find_spec('pypdf')))
