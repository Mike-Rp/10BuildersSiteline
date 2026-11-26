from pdf2image import convert_from_path
from pathlib import Path
from PIL import Image,ImageDraw
base=Path('work/guide-format-qa')
pages=convert_from_path(str(base/'final.pdf'),dpi=90,poppler_path=r'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin')
for i,p in enumerate(pages):p.save(base/f'page-{i+1}.png')
for offset in range(0,len(pages),6):
    canvas=Image.new('RGB',(1530,1440),'#ddd');draw=ImageDraw.Draw(canvas)
    for j,p in enumerate(pages[offset:offset+6]):
        im=p.copy();im.thumbnail((500,690));x=(j%3)*510;y=(j//3)*720
        canvas.paste(im,(x,y+24));draw.text((x+5,y+5),f'Page {offset+j+1}',fill='black')
    canvas.save(base/f'contact-{offset//6+1}.png')
print('Pages',len(pages))

