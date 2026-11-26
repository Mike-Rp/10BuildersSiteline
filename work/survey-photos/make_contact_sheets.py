from zipfile import ZipFile
from pathlib import Path
from PIL import Image,ImageOps,ImageDraw
out=Path('work/survey-photos')
for name,fn in [('roles','opmspmclient.zip'),('admin','admin survey and result.zip')]:
    target=out/name; target.mkdir(exist_ok=True)
    with ZipFile(Path(r'C:\Users\ADMIN\Downloads')/fn) as z:
        for member in z.infolist():
            if member.filename.lower().endswith('.jpg'):
                (target/Path(member.filename).name).write_bytes(z.read(member))
    paths=sorted(target.glob('*.jpg'))
    for batch in range(0,len(paths),6):
        canvas=Image.new('RGB',(1500,2100),'#ddd')
        draw=ImageDraw.Draw(canvas)
        for i,p in enumerate(paths[batch:batch+6]):
            im=ImageOps.exif_transpose(Image.open(p)); im.thumbnail((490,1000))
            x=(i%3)*500;y=(i//3)*1050
            canvas.paste(im,(x,y+30));draw.text((x+5,y+5),p.stem,fill='black')
        canvas.save(out/f'{name}-contact-{batch//6+1}.jpg')
    print(name,len(paths))
