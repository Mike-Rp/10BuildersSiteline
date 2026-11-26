from pathlib import Path
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
import re,json
out=Path('output/survey-documents'); out.mkdir(exist_ok=True)
q=Document('output/10BuildLine Evaluation Questionnaires Formatted.docx')
r=Document('output/10BuildLine Survey Results Formatted.docx')
# Align the reusable transcription with the supplied questionnaire screenshots.
corrections={
 (1,3):'The system shows which engineer is assigned to each project phase.',
 (1,4):'The system shows whether assigned engineers have accepted their work.',
 (2,3):"It is easy to review a project's previous progress updates.",
 (23,3):'Overall, the system helps me stay informed about my project.'
}
for (table,row),text in corrections.items():
    q.tables[table].rows[row].cells[0].text=text
feedback=[row.cells[0].text for row in q.tables[17].rows[1:]]
t=q.tables[16]
while len(t.rows)>1:
    t._tbl.remove(t.rows[-1]._tr)
for text in feedback:
    t.add_row().cells[0].text=text

def prop(parent,tag,attrs):
    el=parent.find(qn('w:'+tag))
    if el is None: el=OxmlElement('w:'+tag);parent.append(el)
    for k,v in attrs.items(): el.set(qn('w:'+k),str(v))
    return el

def font(run):
    run.font.name='Times New Roman';run.font.size=Pt(12);run.font.color.rgb=RGBColor(0,0,0)

def format_doc(doc,is_results):
    for name in ['Normal','Title','Heading 1','Heading 2','Caption']:
        s=doc.styles[name];s.font.name='Times New Roman';s.font.size=Pt(12);s.font.color.rgb=RGBColor(0,0,0)
    for p in doc.paragraphs:
        text=p.text
        if not text: continue
        p.paragraph_format.keep_together=True
        p.paragraph_format.line_spacing=1.5
        for run in p.runs: font(run)
        if text.startswith('Table '):
            if not is_results:
                for run in p.runs: run.text=re.sub(r'^(Table \d+):',r'\1.',run.text)
            p.style=doc.styles['Caption'];p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.keep_with_next=True
            p.paragraph_format.space_before=Pt(0);p.paragraph_format.space_after=Pt(4)
            for run in p.runs: run.italic=True;run.bold=False
        elif text.startswith('Objective ') or text=='Overall Feedback':
            p.style=doc.styles['Heading 2'];p.alignment=WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.keep_with_next=True
            p.paragraph_format.space_before=Pt(10);p.paragraph_format.space_after=Pt(4)
            for run in p.runs:run.bold=True;run.italic=False
        elif text.startswith('Survey Questionnaires for ') or text.startswith('Results of the Survey Questionnaire for '):
            p.style=doc.styles['Heading 1'];p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.keep_with_next=True
            p.paragraph_format.space_before=Pt(0);p.paragraph_format.space_after=Pt(10)
            for run in p.runs:run.bold=True;run.italic=False
        elif text=='Implementation Results':
            p.style=doc.styles['Title'];p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.keep_with_next=True
            for run in p.runs:run.bold=True;run.italic=False
        elif text.startswith('Question '):
            p.alignment=WD_ALIGN_PARAGRAPH.LEFT
            p.paragraph_format.keep_with_next=True
            p.paragraph_format.first_line_indent=Pt(0)
            p.paragraph_format.space_before=Pt(8);p.paragraph_format.space_after=Pt(4)
            for run in p.runs:run.bold=False
        elif is_results:
            p.alignment=WD_ALIGN_PARAGRAPH.JUSTIFY
            p.paragraph_format.keep_with_next=False
            p.paragraph_format.first_line_indent=Inches(.5)
            p.paragraph_format.space_after=Pt(8)
    for table in doc.tables:
        table.alignment=WD_TABLE_ALIGNMENT.CENTER;table.autofit=False
        widths=[1.8,1.05,1.05,1.05,1.05] if is_results else [4,.5,.5,.5,.5]
        for column,w in zip(table.columns,widths):column.width=Inches(w)
        borders=prop(table._tbl.tblPr,'tblBorders',{})
        for side in ['top','left','bottom','right','insideH','insideV']:
            prop(borders,side,{'val':'single','sz':'6','color':'D9D9D9'})
        margins=prop(table._tbl.tblPr,'tblCellMar',{})
        for side,value in [('top',65),('bottom',65),('left',90),('right',90)]:prop(margins,side,{'w':value,'type':'dxa'})
        for ri,row in enumerate(table.rows):
            row.height=None
            prop(row._tr.get_or_add_trPr(),'cantSplit',{})
            if ri==0:prop(row._tr.get_or_add_trPr(),'tblHeader',{})
            for ci,cell in enumerate(row.cells):
                cell.width=Inches(widths[ci]);cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
                prop(cell._tc.get_or_add_tcPr(),'shd',{'fill':'E7E6E6' if ri==0 else 'FFFFFF','val':'clear'})
                for p in cell.paragraphs:
                    p.alignment=WD_ALIGN_PARAGRAPH.LEFT if ci==0 and ri>0 else WD_ALIGN_PARAGRAPH.CENTER
                    p.paragraph_format.line_spacing=1
                    p.paragraph_format.space_before=Pt(0);p.paragraph_format.space_after=Pt(0)
                    p.paragraph_format.first_line_indent=Pt(0)
                    p.paragraph_format.keep_together=True
                    p.paragraph_format.keep_with_next=is_results or ri<len(table.rows)-1
                    for run in p.runs:font(run);run.bold=ri==0;run.italic=False
    # Clean unused template decorations from titles and headings.
    for p in doc.paragraphs:
        ppr=p._p.pPr
        if ppr is not None:
            for border in list(ppr.findall(qn('w:pBdr'))):ppr.remove(border)
    for name in ['Title','Heading 1','Heading 2']:
        ppr=doc.styles[name].element.find(qn('w:pPr'))
        if ppr is not None:
            for border in list(ppr.findall(qn('w:pBdr'))):ppr.remove(border)
format_doc(q,False);format_doc(r,True)
assert len(q.tables)==24 and sum(len(t.rows)-1 for t in q.tables)==84
assert len(r.tables)==84
# The source repeats the SPM feedback items under Objective 5 and Overall Feedback.
# Retain both sections faithfully, including all 22 SPM responses.
expected=[(1,21),(11,21),(23,22),(7,20)]
index=0
for total,count in expected:
    for t in r.tables[index:index+count]:
        vals=[int(c.text) for c in t.rows[1].cells[1:]]
        assert sum(vals)==total
        assert abs(sum(float(c.text.rstrip('%')) for c in t.rows[2].cells[1:])-100)<.02
    index+=count
for doc,filename in [(q,'Evaluation Questionnaires.docx'),(r,'Survey Results.docx')]:
    doc.save(out/filename)
    print((out/filename).resolve())

