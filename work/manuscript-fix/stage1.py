from docx import Document
from docx.shared import Pt, Inches
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
from pathlib import Path
import re,json
work=Path('work/manuscript-fix')
d=Document(r'C:\Users\ADMIN\OneDrive\Desktop\MANUSCRIPT 2 - NOV 20.docx')
paras=d.paragraphs
start=paras[1662]._p;end=paras[1919]._p
body=d.element.body
nodes=list(body);guide=nodes[nodes.index(start):nodes.index(end)]
# Group each desktop or mobile topic, preserving all words and images.
starts=[0]+[i for i,n in enumerate(guide) if i and n.tag==qn('w:p') and Paragraph(n,d).paragraph_format.page_break_before]
assert len(starts)==39,len(starts)
# A page's full sequence stays together; only pictures may shrink if necessary.
for gi,a in enumerate(starts):
 group=guide[a:starts[gi+1] if gi+1<len(starts) else len(guide)]
 allps=[p for node in group for p in ([node] if node.tag==qn('w:p') else node.xpath('.//w:p'))]
 for pi,p in enumerate(allps):
  para=Paragraph(p,d);pf=para.paragraph_format
  pf.line_spacing=1.5;pf.space_before=Pt(0);pf.space_after=Pt(0)
  pf.keep_together=True;pf.keep_with_next=pi<len(allps)-1
  para.style=d.styles['Normal']
  for run in para.runs:run.font.name='Times New Roman';run.font.size=Pt(12)
 # A small reduction leaves room for instructions on Letter pages.
 for node in group:
  for inline in node.xpath('.//wp:inline'):
   extent=inline.find(qn('wp:extent'))
   if extent is None:continue
   for attr in ['cx','cy']:extent.set(attr,str(round(int(extent.get(attr))*.94)))
   for ext in inline.xpath('.//a:xfrm/a:ext'):
    for attr in ['cx','cy']:ext.set(attr,str(round(int(ext.get(attr))*.94)))
 # Mark the first and last paragraph for Word's page audit.
 for suffix,p in [('Start',allps[0]),('End',allps[-1])]:
  bookmark=OxmlElement('w:bookmarkStart');bookmark.set(qn('w:id'),str(70000+gi*2+(suffix=='End')));bookmark.set(qn('w:name'),f'Guide{gi+1:02d}{suffix}')
  close=OxmlElement('w:bookmarkEnd');close.set(qn('w:id'),bookmark.get(qn('w:id')))
  p.insert(1 if p.find(qn('w:pPr')) is not None else 0,bookmark);p.append(close)
# Required margins throughout, retaining portrait/landscape orientation.
for s in d.sections:
 # Preserve the original Letter page orientation.
 s.left_margin=Inches(1.5);s.right_margin=Inches(1);s.top_margin=Inches(1);s.bottom_margin=Inches(1)
# Preserve Normal paragraph styles and establish requested font and spacing globally.
for st in d.styles:
 if hasattr(st,'font'):st.font.name='Times New Roman';st.font.size=Pt(12)
 if hasattr(st,'paragraph_format'):st.paragraph_format.line_spacing=1.5
for p in d.element.xpath('.//w:p'):
 pp=Paragraph(p,d);pp.paragraph_format.line_spacing=1.5
 for run in pp.runs:run.font.name='Times New Roman';run.font.size=Pt(12)
# User guide section must align from the top, not inherit a centered divider page.
for idx in [135]:
 pass
# Correct explicit appendix spelling for index entries and body consistency.
for p in d.paragraphs:
 for run in p.runs:
  if 'APPENDIC A:' in run.text or 'PERSONAL TENCHNICAL VITAE' in run.text:run.text=run.text.replace('APPENDIC A:', 'APPENDIX A:').replace('PERSONAL TENCHNICAL VITAE','PERSONAL TECHNICAL VITAE')
# DO NOT assign run.text on picture-only runs: the loop above must preserve drawings.
# This source uses no inline image combined with visible text in corrected heading runs.
assert len(d.inline_shapes)==302,len(d.inline_shapes)
out=Path('output/Manuscript Corrected.docx');d.save(out)
print(out.resolve())
print('39 guide topics prepared; 302 images preserved')


