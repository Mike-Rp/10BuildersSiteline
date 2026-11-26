from docx import Document
from docx.shared import Inches,Pt
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph
from pathlib import Path
# Continue Arabic page numbers across all imported appendices.
p=Path('output/Manuscript Corrected.docx');d=Document(p)
for i,s in enumerate(d.sections):
 n=s._sectPr.find(qn('w:pgNumType'))
 if i>=7:
  if n is None:n=OxmlElement('w:pgNumType');s._sectPr.append(n)
  n.set(qn('w:fmt'),'decimal')
  if i==7:n.set(qn('w:start'),'1')
  else:n.attrib.pop(qn('w:start'),None)
d.save(p)
# Standalone guide uses the same page fitting rules as its manuscript copy.
d=Document('output/10BuildLine Guide Final.docx')
for s in d.sections:
 s.page_width=Inches(8.5);s.page_height=Inches(11);s.left_margin=Inches(1.5);s.right_margin=Inches(1);s.top_margin=Inches(1);s.bottom_margin=Inches(1)
body=list(d.element.body);body=[x for x in body if x.tag!=qn('w:sectPr')]
starts=[0]+[i for i,n in enumerate(body) if i and n.tag==qn('w:p') and Paragraph(n,d).paragraph_format.page_break_before]
assert len(starts)==39
for g,a in enumerate(starts):
 group=body[a:starts[g+1] if g+1<len(starts) else len(body)]
 paras=[p for n in group for p in ([n] if n.tag==qn('w:p') else n.xpath('.//w:p'))]
 for i,n in enumerate(paras):
  p=Paragraph(n,d);p.style=d.styles['Normal'];pf=p.paragraph_format
  pf.line_spacing=1.5;pf.space_before=Pt(0);pf.space_after=Pt(0);pf.keep_together=True;pf.keep_with_next=i<len(paras)-1
  for r in p.runs:r.font.name='Times New Roman';r.font.size=Pt(12)
 for n in group:
  for inline in n.xpath('.//wp:inline'):
   for e in [inline.find(qn('wp:extent'))]+inline.xpath('.//a:xfrm/a:ext'):
    if e is not None:
     for attr in ['cx','cy']:e.set(attr,str(round(int(e.get(attr))*.94)))
d.save('output/10BuildLine Guide Letter Size.docx')
print('Page-number restarts removed; standalone guide fitted to Letter size.')
