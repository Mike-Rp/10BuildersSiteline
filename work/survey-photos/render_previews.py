from pathlib import Path
from pdf2image import convert_from_path
from PIL import Image,ImageDraw
import subprocess
base=Path('work/survey-photos')
poppler=r'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
for name in ['Evaluation Questionnaires','Survey Results']:
    pdf=base/(name+'.pdf')
    if not pdf.exists():continue
    target=base/name; target.mkdir(exist_ok=True)
    pages=convert_from_path(str(pdf),dpi=110,poppler_path=poppler)
    for i,p in enumerate(pages):p.save(target/f'page-{i+1}.png')
    for offset in range(0,len(pages),4):
        canvas=Image.new('RGB',(1020,1360),'#ddd');draw=ImageDraw.Draw(canvas)
        for i,page in enumerate(pages[offset:offset+4]):
            im=page.copy();im.thumbnail((500,650));x=(i%2)*510;y=(i//2)*680
            canvas.paste(im,(x,y+22));draw.text((x+8,y+4),f'Page {offset+i+1}',fill='black')
        canvas.save(target/f'contact-{offset//4+1}.png')
    print(name,len(pages))
