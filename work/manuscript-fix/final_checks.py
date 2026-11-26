from docx import Document
from docx.oxml.ns import qn
from pathlib import Path
from collections import Counter
import json
p=Path('output/Manuscript Corrected.docx');d=Document(p)
manifest=json.loads(Path('work/manuscript-fix/index-manifest.json').read_text(encoding='utf-8'))
for kind,tableidx in [('contents',1),('figure',2),('table',3)]:
 expected=[r['text'] for r in manifest if r['kind']==kind]
 actual=[r.cells[0].text for r in d.tables[tableidx].rows]
 assert actual==expected,(kind,len(expected),len(actual))
print('All index names and numbers match their target captions and headings.')
print('Text sizes',Counter(r.get(qn('w:val')) for r in d.element.xpath('.//w:r[w:t]/w:rPr/w:sz')))
print('Editable paragraph line spacing',Counter(n.get(qn('w:line')) for n in d.element.xpath('.//w:pPr/w:spacing')))
for name in ['Manuscript Corrected.docx','10BuildLine Guide Letter Size.docx']:
 f=Path('output')/name;print(name,f.stat().st_size)
