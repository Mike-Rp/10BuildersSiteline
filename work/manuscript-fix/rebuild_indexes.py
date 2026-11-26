from pathlib import Path
from docx import Document
from docx.shared import Inches,Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
import re,json
path=Path('output/Manuscript Corrected.docx')
d=Document(path);ps=d.paragraphs
# Repair the repeated 2 and 3: all table references from the testing section onward shift by 2.
for p in ps[620:]:
 for node in p._p.xpath('.//w:t'):
  if node.text:node.text=re.sub(r'\bTable\s+(\d+)\b',lambda m:f'Table {int(m[1])+2}',node.text)
# Normalize missing separators in three actual table captions.
for p in ps:
 if re.match(r'^Table \d+ Test Cases',p.text):
  for node in p._p.xpath('.//w:t'):
   if node.text:node.text=re.sub(r'^(Table \d+) (?=Test Cases)',r'\1. ',node.text)
# Correct the visible section label's trailing artifact.
for run in ps[259].runs:
 if 'Resources' in run.text:run.text='Resources'

bookmark_id=71000
manifest=[]
def bookmark(p,name):
 global bookmark_id
 b=OxmlElement('w:bookmarkStart');b.set(qn('w:id'),str(bookmark_id));b.set(qn('w:name'),name)
 e=OxmlElement('w:bookmarkEnd');e.set(qn('w:id'),str(bookmark_id));bookmark_id+=1
 p._p.insert(1 if p._p.pPr is not None else 0,b);p._p.append(e)
 return name

figs=[];tables=[];seen=set()
for i,p in enumerate(ps):
 text=p.text.strip()
 m=re.match(r'^Figure\s+(\d+)(?:\s*\(continued\))?[.:]',text,re.I)
 if m and int(m[1]) not in seen:
  n=int(m[1]);seen.add(n);name=bookmark(p,f'IndexFigure{n:03d}')
  figs.append((text,name));manifest.append({'kind':'figure','number':n,'text':text,'bookmark':name})
 m=re.match(r'^Table\s+(\d+)[.:]\s*',text)
 if m:
  n=int(m[1]);name=bookmark(p,f'IndexTable{n:03d}')
  tables.append((text,name));manifest.append({'kind':'table','number':n,'text':text,'bookmark':name})
assert len(figs)==178,len(figs)
assert [int(re.match(r'Table (\d+)',t)[1]) for t,n in tables]==list(range(1,150))
# Selected chapter/appendix headings use their exact body labels, including real subsections.
toc_spec=[(0,'Title Page',0),(40,None,0),(82,None,0),(115,None,0),(125,None,0),(139,'Table of Contents',0),(141,'List of Figures',0),(143,'List of Tables',0),
(145,None,0),(146,None,1),(153,None,1),(163,None,1),(164,None,2),(167,None,2),(174,None,1),(175,None,2),(187,None,2),(194,None,1),(195,None,2),(220,None,2),(237,None,1),
(242,None,0),(243,None,1),(244,None,2),(251,None,1),(259,None,1),(260,None,2),(263,None,2),(266,None,1),(270,None,2),(283,None,2),(347,None,2),(373,None,1),
(617,None,0),(618,None,1),(705,None,1),(710,None,1),(715,None,2),(736,None,2),(756,None,2),(776,None,2),(796,None,1),(797,None,2),(878,None,2),(960,None,2),(1046,None,2),
(1125,None,0),(1131,None,0),(1145,None,0),(1162,None,0),(1163,None,1),(1170,None,1),(1188,None,1),(1286,None,2),(1581,None,2),(1661,None,1),(1920,None,1)]
toc=[]
for i,label,level in toc_spec:
 text=label or ps[i].text.strip()
 name=bookmark(ps[i],f'IndexContents{i:04d}')
 toc.append((text,name,level));manifest.append({'kind':'contents','text':text,'bookmark':name,'level':level})

def el(parent,tag,attrs):
 node=parent.find(qn('w:'+tag))
 if node is None:node=OxmlElement('w:'+tag);parent.append(node)
 for k,v in attrs.items():node.set(qn('w:'+k),str(v))
 return node

def page_field(p,name):
 run=p.add_run();begin=OxmlElement('w:fldChar');begin.set(qn('w:fldCharType'),'begin');run._r.append(begin)
 run=p.add_run();instr=OxmlElement('w:instrText');instr.set(qn('xml:space'),'preserve');instr.text=f' PAGEREF {name} \\h ';run._r.append(instr)
 run=p.add_run();sep=OxmlElement('w:fldChar');sep.set(qn('w:fldCharType'),'separate');run._r.append(sep)
 p.add_run('000')
 run=p.add_run();end=OxmlElement('w:fldChar');end.set(qn('w:fldCharType'),'end');run._r.append(end)

old_tables=[d.tables[i]._tbl for i in [1,2,3]]
for old,entries in zip(old_tables,[toc,figs,tables]):
 t=d.add_table(rows=0,cols=2);t.autofit=False;t.alignment=WD_TABLE_ALIGNMENT.CENTER
 t.columns[0].width=Inches(5.35);t.columns[1].width=Inches(.65)
 borders=el(t._tbl.tblPr,'tblBorders',{})
 for side in ['top','left','bottom','right','insideH','insideV']:el(borders,side,{'val':'nil'})
 margins=el(t._tbl.tblPr,'tblCellMar',{})
 for side in ['top','left','bottom','right']:el(margins,side,{'w':'0','type':'dxa'})
 for entry in entries:
  text,name=entry[:2];level=entry[2] if len(entry)>2 else 0
  row=t.add_row();el(row._tr.get_or_add_trPr(),'cantSplit',{})
  for c,w in zip(row.cells,[5.35,.65]):c.width=Inches(w);c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP
  p=row.cells[0].paragraphs[0];p.style=d.styles['Normal'];p.add_run(text)
  p.paragraph_format.left_indent=Inches(level*.2)
  p=row.cells[1].paragraphs[0];p.style=d.styles['Normal'];p.alignment=WD_ALIGN_PARAGRAPH.RIGHT;page_field(p,name)
  for c in row.cells:
   for p in c.paragraphs:
    pf=p.paragraph_format;pf.line_spacing=1.5;pf.space_before=Pt(0);pf.space_after=Pt(0);pf.keep_together=True;pf.keep_with_next=False
    for run in p.runs:run.font.name='Times New Roman';run.font.size=Pt(12);run.bold=False;run.italic=False
 old.getparent().replace(old,t._tbl)
# Enforce no stale update-on-open request; cached page fields will be refreshed in Word.
for flag in d.settings.element.findall(qn('w:updateFields')):d.settings.element.remove(flag)
d.save(path)
Path('work/manuscript-fix/index-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Contents entries:',len(toc),'Figures:',len(figs),'Tables:',len(tables))
print('All 302 images retained:',len(d.inline_shapes)==302)
