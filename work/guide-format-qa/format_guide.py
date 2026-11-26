from pathlib import Path
from docx import Document
from docx.shared import Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from zipfile import ZipFile
import re
source=Path(r'C:\Users\ADMIN\Downloads\10BuildLine Guide - Separate Desktop and Mobile Pages.docx')
out=Path('output/10BuildLine Guide Formatted.docx')
d=Document(source)
changed=[]
for p in d.paragraphs:
    match=re.match(r'^Figure (\d+)\.',p.text)
    if match:
        old=int(match[1]);new=old+139
        # Keep the title and its run formatting intact.
        offset=0;start,end=match.span(1)
        for node in p._p.xpath('.//w:t'):
            text=node.text or '';a=max(start-offset,0);b=min(end-offset,len(text))
            if a<b:node.text=text[:a]+(str(new) if offset<=start<offset+len(text) else '')+text[b:]
            offset+=len(text)
        changed.append((old,new))
for style in d.styles:
    if hasattr(style,'font'):
        style.font.name='Times New Roman';style.font.size=Pt(12)
# Explicit font settings cover text in tables, headers, and all body runs.
for root in [d.element,d.styles.element]:
    for rpr in root.xpath('.//w:rPr'):
        for tag in ['rFonts','sz','szCs']:
            elem=rpr.find(qn('w:'+tag))
            if elem is None:elem=OxmlElement('w:'+tag);rpr.append(elem)
            if tag=='rFonts':
                for attr in list(elem.attrib):del elem.attrib[attr]
                for attr in ['ascii','hAnsi','eastAsia','cs']:elem.set(qn('w:'+attr),'Times New Roman')
            else:elem.set(qn('w:val'),'24')
    for run in root.xpath('.//w:r'):
        rpr=run.find(qn('w:rPr'))
        if rpr is None:rpr=OxmlElement('w:rPr');run.insert(0,rpr)
        for tag,attrs in [('rFonts',{'ascii':'Times New Roman','hAnsi':'Times New Roman','eastAsia':'Times New Roman','cs':'Times New Roman'}),('sz',{'val':'24'}),('szCs',{'val':'24'})]:
            elem=rpr.find(qn('w:'+tag))
            if elem is None:elem=OxmlElement('w:'+tag);rpr.append(elem)
            for attr in list(elem.attrib):del elem.attrib[attr]
            for attr,value in attrs.items():elem.set(qn('w:'+attr),value)
# Remove all default, first-page and even-page footer references and parts.
for section in d.sections:
    for ref in list(section._sectPr.findall(qn('w:footerReference'))):section._sectPr.remove(ref)
for relid,rel in list(d.part.rels.items()):
    if rel.reltype.endswith('/footer'):d.part.drop_rel(relid)
assert changed==[(n,n+139) for n in range(1,40)]
d.save(out)
check=Document(out)
assert len(check.inline_shapes)==119
assert len(check.tables)==29
assert not check.element.xpath('.//w:footerReference')
with ZipFile(source) as a,ZipFile(out) as b:
    media=[n for n in a.namelist() if n.startswith('word/media/')]
    for name in media:assert a.read(name)==b.read(name),name
    assert not any(n.startswith('word/footer') for n in b.namelist())
for p in check.paragraphs:
    for run in p.runs:
        assert run.font.name=='Times New Roman' and run.font.size.pt==12
print('Figures 140-178; footers removed; Times New Roman 12 pt; 119 images unchanged')
print(out.resolve())
