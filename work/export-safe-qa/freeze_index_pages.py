from pathlib import Path
from zipfile import ZipFile
from lxml import etree
from copy import deepcopy
import json,re
base=Path('work/export-safe-qa')
source=base/'input.docx'
out=Path('output/Manuscript Export Safe.docx')
values={r['bookmark']:r['value'] for r in json.loads(Path('work/toc-original-format/field-values.json').read_text(encoding='utf-8-sig'))}
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
w=lambda tag:'{'+ns['w']+'}'+tag
changed=0
with ZipFile(source) as a,ZipFile(out,'w') as b:
 for item in a.infolist():
  data=a.read(item.filename)
  if item.filename=='word/document.xml':
   root=etree.fromstring(data)
   # Change only page-number cells in the three existing lists.
   body=root.find(w('body'))
   lists=body.findall(w('tbl'))[1:4]
   assert len(lists)==3
   for table in lists:
    for row in table.findall(w('tr')):
     cell=row.findall(w('tc'))[1]
     for p in cell.findall(w('p')):
      code=''.join(p.xpath('.//w:instrText/text()',namespaces=ns))
      match=re.search(r'PAGEREF\s+(Index\w+)',code)
      if not match:continue
      name=match[1];expected=values[name]
      visible=''.join(p.xpath('.//w:t/text()',namespaces=ns))
      assert visible==expected,(name,visible,expected)
      # Carry over the displayed number's run formatting exactly.
      runs=p.xpath('./w:r[w:t]',namespaces=ns)
      rpr=deepcopy(runs[0].find(w('rPr'))) if runs and runs[0].find(w('rPr')) is not None else None
      for child in list(p):
       if child.tag!=w('pPr'):p.remove(child)
      run=etree.SubElement(p,w('r'))
      if rpr is not None:run.append(rpr)
      etree.SubElement(run,w('t')).text=expected
      changed+=1
   assert changed==364,changed
   assert not any('PAGEREF Index' in (e.text or '') for e in root.findall('.//'+w('instrText')))
   data=etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
  b.writestr(item,data)
with ZipFile(source) as a,ZipFile(out) as b:
 for n in a.namelist():
  if n!='word/document.xml':assert a.read(n)==b.read(n),n
print('Converted 364 verified index page numbers to regular text. All other document parts unchanged.')
print(out.resolve())
