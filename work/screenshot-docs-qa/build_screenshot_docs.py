from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from PIL import Image
from zipfile import ZipFile
from hashlib import sha256
import json,re
base=Path('work/survey-photos')
out=Path('output/screenshot-documents')
roles=[
 ('Administrator','admin','606213430911350', ['1092','1090','1089','1088','1084','1095'],['1091','1093','1086','1094','1085','1087']),
 ('Office Project Manager','roles','606192826235244', ['6046','6044','6043','6042','6047','6045'],['6036','6040','6038','6035','6037','6039']),
 ('Site Project Manager','roles','606192826235244', ['6056','6058','6062','6059','6060','6061'],['6057','6051','6054','6052','6055','6053']),
 ('Client','roles','606192826235244', ['6069','6065','6072','6075','6073','6074'],['6064','6067','6070','6071','6068','6066']),
]
number=69
manifest=[]

def make_doc():
    d=Document()
    s=d.sections[0];s.page_width=Inches(8.5);s.page_height=Inches(11)
    s.top_margin=Inches(1);s.bottom_margin=Inches(1);s.left_margin=Inches(1.5);s.right_margin=Inches(1)
    st=d.styles['Normal'];st.font.name='Times New Roman';st.font.size=Pt(12);st.font.color.rgb=RGBColor(0,0,0)
    st.paragraph_format.space_after=Pt(0)
    return d

doc=make_doc();sources=[]
for ri,(role,folder,prefix,qs,rs) in enumerate(roles):
    if ri==1:doc=make_doc();sources=[]
    for oi,(qid,rid) in enumerate(zip(qs,rs)):
        label=f'Objective {oi+1}' if oi<5 else 'Overall Feedback'
        for kind,ident in [('Questionnaire',qid),('Survey Results',rid)]:
            path=base/folder/(prefix+ident+'.jpg')
            assert path.exists(),path
            p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            pf=p.paragraph_format;pf.keep_with_next=True;pf.keep_together=True
            pf.line_spacing=1;pf.space_before=Pt(0);pf.space_after=Pt(0)
            if kind=='Questionnaire' and len(doc.inline_shapes)>0:pf.page_break_before=True
            p.add_run().add_picture(str(path),width=Inches(6))
            caption=f'Figure {number}. {role} {kind} for {label}'
            p=doc.add_paragraph();p.alignment=WD_ALIGN_PARAGRAPH.CENTER
            pf=p.paragraph_format;pf.keep_together=True;pf.keep_with_next=False
            pf.line_spacing=1.5;pf.space_before=Pt(0);pf.space_after=Pt(10)
            run=p.add_run(caption);run.italic=True;run.font.name='Times New Roman';run.font.size=Pt(12)
            sources.append(path)
            manifest.append({'figure':number,'caption':caption,'source':str(path)})
            number+=1
    if ri in [0,3]:
        name='Administrator Survey Screenshots.docx' if ri==0 else 'OPM SPM Client Survey Screenshots.docx'
        target=out/name;doc.save(target)
        with ZipFile(target) as z:
            embedded=[sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith('word/media/')]
        assert sorted(embedded)==sorted(sha256(p.read_bytes()).hexdigest() for p in sources)
        assert len(Document(target).tables)==0
        print(target.resolve(), 'screenshots:',len(sources))
assert number==117
assert len(manifest)==48
(base.parent/'screenshot-docs-qa'/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
