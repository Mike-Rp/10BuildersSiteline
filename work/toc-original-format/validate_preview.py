from pathlib import Path
from docx import Document
from pypdf import PdfReader
from pdf2image import convert_from_path
import json
base=Path('work/toc-original-format')
rows=json.loads((base/'page-map.json').read_text(encoding='utf-8-sig'))
fields={r['bookmark']:r['value'] for r in json.loads((base/'field-values.json').read_text(encoding='utf-8-sig'))}
def roman(n):
 s=''
 for k,v in [(1000,'m'),(900,'cm'),(500,'d'),(400,'cd'),(100,'c'),(90,'xc'),(50,'l'),(40,'xl'),(10,'x'),(9,'ix'),(5,'v'),(4,'iv'),(1,'i')]:
  while n>=k:s+=v;n-=k
 return s
intro=next(x['physicalPage'] for x in rows if x['bookmark']=='IndexContents0145')
for row in rows:
 expected=roman(row['pageNumber']) if row['physicalPage']<intro else str(row['pageNumber'])
 assert fields[row['bookmark']]==expected,(row['bookmark'],fields[row['bookmark']],expected)
original=Document('work/manuscript-fix/original-reference.docx');d=Document('output/Manuscript Original TOC Format.docx')
assert len(d.tables[1].rows)==37
assert [r.cells[0].text for r in d.tables[1].rows]==[r.cells[0].text for r in original.tables[1].rows]
assert [int(c.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}w')) for c in d.tables[1]._tbl.tblGrid]==[int(c.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}w')) for c in original.tables[1]._tbl.tblGrid]
assert len(d.inline_shapes)==302
assert [(s.page_width,s.page_height,s.orientation) for s in d.sections]==[(s.page_width,s.page_height,s.orientation) for s in original.sections]
guide=json.loads((base/'guide-pages.json').read_text(encoding='utf-8-sig'))
assert len(guide)==39 and all(x['startPage']==x['endPage'] for x in guide)
print('Validated',len(fields),'page references; 37 original TOC entries; 39 guide pages included; orientations preserved.')
start=next(x['physicalPage'] for x in rows if x['bookmark']=='IndexContents0139')
end=next(x['physicalPage'] for x in rows if x['bookmark']=='IndexContents0141')-1
pages=list(range(start,end+1))+[guide[x]['startPage'] for x in [0,11,21,38]]
poppler=r'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
for i in pages:
 convert_from_path(str(base/'review.pdf'),dpi=90,first_page=i,last_page=i,poppler_path=poppler)[0].save(base/f'page-{i}.png')
print('Preview pages',pages)
