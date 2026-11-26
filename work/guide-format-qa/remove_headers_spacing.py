from docx import Document
from docx.shared import Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path
from zipfile import ZipFile
source=Path('output/10BuildLine Guide Formatted.docx')
out=Path('output/10BuildLine Guide Final.docx')
d=Document(source)
for section in d.sections:
    for tag in ['headerReference','footerReference']:
        for ref in list(section._sectPr.findall(qn('w:'+tag))):section._sectPr.remove(ref)
for relid,rel in list(d.part.rels.items()):
    if rel.reltype.endswith('/header') or rel.reltype.endswith('/footer'):d.part.drop_rel(relid)
for p in d.element.xpath('.//w:p'):
    ppr=p.get_or_add_pPr()
    spacing=ppr.find(qn('w:spacing'))
    if spacing is None:spacing=OxmlElement('w:spacing');ppr.append(spacing)
    spacing.set(qn('w:line'),'360');spacing.set(qn('w:lineRule'),'auto')
for style in d.styles:
    if hasattr(style,'paragraph_format'):style.paragraph_format.line_spacing=1.5
    if hasattr(style,'font'):style.font.name='Times New Roman';style.font.size=Pt(12)
d.save(out)
check=Document(out)
assert not check.element.xpath('.//w:headerReference | .//w:footerReference')
assert len(check.inline_shapes)==119
assert all(p.xpath('./w:pPr/w:spacing[@w:line="360"][@w:lineRule="auto"]') for p in check.element.xpath('.//w:p'))
with ZipFile(source) as a,ZipFile(out) as b:
    for name in a.namelist():
        if name.startswith('word/media/'):assert a.read(name)==b.read(name)
print(out.resolve())
print('119 images preserved; all paragraphs explicitly use 1.5 spacing; no header/footer references')
