from pathlib import Path
from pypdf import PdfReader
from pdf2image import convert_from_path
from PIL import Image,ImageDraw
import json
base=Path('work/manuscript-fix');pdf=base/'final-manuscript.pdf'
r=PdfReader(pdf)
landscape=[i+1 for i,p in enumerate(r.pages) if float(p.mediabox.width)>float(p.mediabox.height)]
print('Landscape PDF pages',landscape)
manifest=json.loads((base/'final-guide-pages.json').read_text(encoding='utf-8-sig'))
selected=list(range(1,24))+list(range(manifest[0]['startPage'],manifest[-1]['endPage']+1))+landscape
# Inspect long test tables as well as the two landscape sections.
maprows=json.loads((base/'final-page-map.json').read_text(encoding='utf-8-sig'))
selected+= [x['physicalPage'] for x in maprows if x['kind']=='table' and x.get('number') in [1,2,3,4,12,20,30,40,41,42,65,100,149]]
selected=sorted(set(selected))
folder=base/'review';folder.mkdir(exist_ok=True)
poppler=r'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
for number in selected:
 image=convert_from_path(str(pdf),dpi=90,first_page=number,last_page=number,poppler_path=poppler)[0]
 image.save(folder/f'page-{number}.png')
for offset in range(0,len(selected),4):
 canvas=Image.new('RGB',(1240,1730),'#ddd');draw=ImageDraw.Draw(canvas)
 for j,n in enumerate(selected[offset:offset+4]):
  im=Image.open(folder/f'page-{n}.png');im.thumbnail((610,825));x=(j%2)*620;y=(j//2)*865
  canvas.paste(im,(x,y+25));draw.text((x+5,y+5),f'PDF page {n}',fill='black')
 canvas.save(folder/f'contact-{offset//4+1}.png')
print('Reviewed page candidates:',len(selected),'contact sheets:',(len(selected)+3)//4)
# Guide page-content audit: exactly one figure and its instructions per page.
problems=[]
for item in manifest:
 text=r.pages[item['startPage']-1].extract_text()
 if text.count('Figure ')!=1:problems.append((item['topic'],text.count('Figure ')))
print('Guide figure count issues',problems)
assert not problems
