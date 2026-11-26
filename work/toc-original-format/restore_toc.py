from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from copy import deepcopy
from pathlib import Path
import json,re
original=Document('work/manuscript-fix/original-reference.docx')
d=Document('work/toc-original-format/corrected-base.docx')
toc=deepcopy(original.tables[1]._tbl)
indices=[0,40,82,115,125,139,141,143,145,146,153,163,164,167,174,194,237,242,243,244,270,283,347,373,617,618,705,710,796,1125,1145,1162,1163,1170,1188,1661,1920]
assert len(indices)==len(original.tables[1].rows)==37
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
new_manifest=[]
for row,index,oldrow in zip(toc.findall(qn('w:tr')),indices,original.tables[1].rows):
 name=f'IndexContents{index:04d}'
 assert any(b.get(qn('w:name'))==name for b in d.element.xpath('.//w:bookmarkStart'))
 cell=row.findall(qn('w:tc'))[1]
 p=cell.find(qn('w:p'))
 sample=p.find('.//'+qn('w:rPr'))
 rpr=deepcopy(sample) if sample is not None else None
 for child in list(p):
  if child.tag!=qn('w:pPr'):p.remove(child)
 # Keep the exact original cell, paragraph and run formatting, changing only its displayed page number.
 def run():
  r=OxmlElement('w:r')
  if rpr is not None:r.append(deepcopy(rpr))
  p.append(r);return r
 e=OxmlElement('w:fldChar');e.set(qn('w:fldCharType'),'begin');run().append(e)
 e=OxmlElement('w:instrText');e.set(qn('xml:space'),'preserve');e.text=f' PAGEREF {name} \\h ';run().append(e)
 e=OxmlElement('w:fldChar');e.set(qn('w:fldCharType'),'separate');run().append(e)
 e=OxmlElement('w:t');e.text='000';run().append(e)
 e=OxmlElement('w:fldChar');e.set(qn('w:fldCharType'),'end');run().append(e)
 new_manifest.append({'kind':'contents','text':oldrow.cells[0].text,'bookmark':name})
old=d.tables[1]._tbl;old.getparent().replace(old,toc)
old_manifest=json.loads(Path('work/manuscript-fix/index-manifest.json').read_text(encoding='utf-8'))
new_manifest += [x for x in old_manifest if x['kind']!='contents']
# The corrected user guide is already embedded in Appendix D: confirm every figure and all 39 topics.
assert len(d.inline_shapes)==302
assert len(d.element.xpath('.//w:bookmarkStart[starts-with(@w:name,"Guide") and contains(@w:name,"Start")]'))==39
figures=[int(re.match(r'^Figure (\d+)',p.text)[1]) for p in d.paragraphs if re.match(r'^Figure (\d+)',p.text)]
assert all(n in figures for n in range(140,179))
out=Path('output/Manuscript Original TOC Format.docx');d.save(out)
# Check original left-hand labels and table geometry are unmodified.
check=Document(out)
assert [r.cells[0].text for r in check.tables[1].rows]==[r.cells[0].text for r in original.tables[1].rows]
assert check.tables[1]._tbl.tblPr.xml==original.tables[1]._tbl.tblPr.xml
Path('work/toc-original-format/index-manifest.json').write_text(json.dumps(new_manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print('Original TOC layout and all 37 original entries restored. User guide: 39 topics included.')
print(out.resolve())

