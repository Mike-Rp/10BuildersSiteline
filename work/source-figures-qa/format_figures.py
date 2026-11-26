from docx import Document
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH
from pathlib import Path
import re
source=Path(r'C:\Users\ADMIN\Downloads\Source Code Figures (1).docx')
output=Path('output/Source Code Figures Formatted.docx')
doc=Document(source)
count=0
for p in doc.paragraphs:
    p.alignment=WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.keep_together=True
    if p._p.xpath('.//w:drawing'):
        p.paragraph_format.keep_with_next=True
        p.paragraph_format.line_spacing=1
        p.paragraph_format.space_before=Pt(0)
        p.paragraph_format.space_after=Pt(0)
    if re.match(r'^Figure \d+\.', p.text):
        n=61+count
        for run in p.runs:
            run.text=re.sub(r'Figure \d+\.',f'Figure {n}.',run.text)
            run.font.name='Times New Roman'
            run.font.size=Pt(12)
            run.italic=True
        p.paragraph_format.keep_with_next=False
        p.paragraph_format.line_spacing=1.5
        p.paragraph_format.space_before=Pt(0)
        p.paragraph_format.space_after=Pt(5)
        count+=1
assert count==8
assert len(doc.inline_shapes)==8
doc.save(output)
check=Document(output)
assert [int(re.match(r'Figure (\d+)',p.text)[1]) for p in check.paragraphs if p.text.startswith('Figure ')]==list(range(61,69))
from zipfile import ZipFile
with ZipFile(source) as a, ZipFile(output) as b:
    for name in a.namelist():
        if name.startswith('word/media/'):
            assert a.read(name)==b.read(name)
print(output.resolve())
