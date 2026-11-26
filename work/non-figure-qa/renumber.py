from zipfile import ZipFile
from pathlib import Path
from lxml import etree
import re
source=Path(r'C:\Users\ADMIN\OneDrive\Desktop\Non.docx')
out=Path('output/Non Figure Numbers Corrected.docx')
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
changes=[]
with ZipFile(source) as src,ZipFile(out,'w') as dst:
    for item in src.infolist():
        data=src.read(item.filename)
        if item.filename=='word/document.xml':
            root=etree.fromstring(data)
            for p in root.findall('.//w:p',ns):
                nodes=p.findall('.//w:t',ns)
                text=''.join(n.text or '' for n in nodes)
                match=re.match(r'^Figure (\d+)\b',text)
                if not match:continue
                old=int(match.group(1));new=old-55
                start,end=match.span(1);offset=0
                for node in nodes:
                    original=node.text or '';a=max(start-offset,0);b=min(end-offset,len(original))
                    if a<b:
                        node.text=original[:a]+(str(new) if offset<=start<offset+len(original) else '')+original[b:]
                    offset+=len(original)
                changes.append((old,new))
            data=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
        dst.writestr(item,data)
assert sorted(set(a for a,b in changes))==list(range(172,195))
assert sorted(set(b for a,b in changes))==list(range(117,140))
with ZipFile(source) as a,ZipFile(out) as b:
    assert a.namelist()==b.namelist()
    for name in a.namelist():
        if name!='word/document.xml':assert a.read(name)==b.read(name),name
print('Updated captions:',len(changes),'distinct figures:',len(set(changes)),'range:117-139')
print(out.resolve())
