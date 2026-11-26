from docx import Document
from docx.shared import Pt
from docx.oxml.ns import qn
from pathlib import Path
import json,re
path=Path('output/Manuscript Corrected.docx');d=Document(path);ps=d.paragraphs
# Remove obsolete spacer paragraphs so the front forms do not overflow at the requested font and spacing.
for a,b in [(0,39),(40,81),(82,114),(115,124),(125,138)]:
 active=[p for p in ps[a:b+1] if p.text.strip() or p._p.xpath('.//w:drawing')]
 for p in ps[a:b+1]:
  if not p.text.strip() and not p._p.xpath('.//w:drawing | ./w:pPr/w:sectPr | .//w:bookmarkStart'):
   p._p.getparent().remove(p._p)
 for i,p in enumerate(active):
  pf=p.paragraph_format;pf.line_spacing=1.5;pf.space_before=Pt(0);pf.space_after=Pt(0);pf.keep_together=True;pf.keep_with_next=i<len(active)-1
 if a==0:
  for i,pts in [(0,42),(7,42),(20,42),(33,30)]:ps[i].paragraph_format.space_after=Pt(pts)
 elif a==40:
  ps[40].paragraph_format.space_after=Pt(12)
  for i in [56,65,74]:ps[i].paragraph_format.space_before=Pt(12)
  for i in [60,69,77]:ps[i].paragraph_format.space_before=Pt(14)
  ps[81].paragraph_format.space_before=Pt(12)
 elif a==82:
  ps[82].paragraph_format.space_after=Pt(8)
  for i in [87,91,98,104,108,114]:ps[i].paragraph_format.space_before=Pt(8)
 elif a==115:ps[115].paragraph_format.space_after=Pt(8)
 elif a==125:ps[125].paragraph_format.space_after=Pt(4)
# Remove isolated typo artifacts from a heading and the figure caption, including their list entries.
for p in d.element.xpath('.//w:p'):
 nodes=p.xpath('.//w:t');text=''.join(n.text or '' for n in nodes)
 replacement=None
 if re.fullmatch(r'Resources\s*0',text.strip()):replacement='Resources'
 elif '10 f Builders' in text:replacement=text.replace('10 f Builders','10 Builders')
 if replacement is not None and nodes:
  nodes[0].text=replacement
  for node in nodes[1:]:node.text=''
# Preserve font consistency in the existing footer labels and page-number fields.
for part in d.part.package.parts:
 if str(part.partname).startswith('/word/footer'):
  root=part.element
  for p in root.xpath('.//w:p'):
   from docx.text.paragraph import Paragraph
   para=Paragraph(p,d);para.paragraph_format.line_spacing=1.5
   for run in para.runs:run.font.name='Times New Roman';run.font.size=Pt(12)
d.save(path)
m=Path('work/manuscript-fix/index-manifest.json');data=json.loads(m.read_text(encoding='utf-8'))
for row in data:
 row['text']=row['text'].replace('10 f Builders','10 Builders')
 if re.fullmatch(r'Resources\s*0',row['text'].strip()):row['text']='Resources'
m.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print('Front matter spacers cleaned; names corrected; footer text matches requested font.')
