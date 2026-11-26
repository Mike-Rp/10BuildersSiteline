from pathlib import Path
from pdf2image import convert_from_path
from PIL import Image,ImageDraw
from pypdf import PdfReader
import json
base=Path('work/manuscript-fix');folder=base/'final-front';folder.mkdir(exist_ok=True)
poppler=r'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
rows=json.loads((base/'final-page-map.json').read_text(encoding='utf-8-sig'))
end=next(x['physicalPage'] for x in rows if x['bookmark']=='IndexContents0145')-1
pages=convert_from_path(str(base/'final-manuscript.pdf'),dpi=90,first_page=1,last_page=end,poppler_path=poppler)
for i,im in enumerate(pages):im.save(folder/f'page-{i+1}.png')
for offset in range(0,len(pages),4):
 canvas=Image.new('RGB',(1240,1730),'#ddd');draw=ImageDraw.Draw(canvas)
 for j,im in enumerate(pages[offset:offset+4]):
  im=im.copy();im.thumbnail((610,825));x=(j%2)*620;y=(j//2)*865
  canvas.paste(im,(x,y+25));draw.text((x+5,y+5),f'Page {offset+j+1}',fill='black')
 canvas.save(folder/f'contact-{offset//4+1}.png')
print('Final front pages',end)
reader=PdfReader(base/'final-manuscript.pdf');guide=json.loads((base/'final-guide-pages.json').read_text(encoding='utf-8-sig'))
assert all(x['startPage']==x['endPage'] for x in guide)
assert all(reader.pages[x['startPage']-1].extract_text().count('Figure ')==1 for x in guide)
print('Guide: 39 single-page topics, one caption per page.')
# Full-resolution standalone preview pages for QA.
folder=base/'standalone-review';folder.mkdir(exist_ok=True)
pages=convert_from_path(str(base/'final-guide.pdf'),dpi=75,poppler_path=poppler)
for i,im in enumerate(pages):im.save(folder/f'page-{i+1}.png')
print('Standalone guide rendered',len(pages))
