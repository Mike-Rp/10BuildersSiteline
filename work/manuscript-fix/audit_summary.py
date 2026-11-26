from docx import Document
from collections import Counter
import re,json
from pathlib import Path
d=Document(r'C:\Users\ADMIN\OneDrive\Desktop\MANUSCRIPT 2 - NOV 20.docx')
print('CONTENTS',[[c.text for c in r.cells] for r in d.tables[1].rows])
figs=[];tabs=[]
for i,p in enumerate(d.paragraphs):
 t=p.text.strip()
 m=re.match(r'^Figure\s+(\d+)(?:\s*\(continued\))?[.:]',t,re.I)
 if m:figs.append((i,int(m[1]),t))
 m=re.match(r'^Table\s+(\d+)(?:[.:]\s*|\s+(?=Test Cases))',t)
 if m:tabs.append((i,int(m[1]),t))
print('FIG COUNT',len(figs),'NUMBERS',Counter(n for i,n,t in figs)); print('FIG CAPTIONS',[(i,t) for i,n,t in figs[:70]])
print('TABLE COUNT',len(tabs),'DUPLICATES',[(n,c) for n,c in Counter(n for i,n,t in tabs).items() if c>1])
print('BOUNDARIES')
for i in [139,140,141,142,143,144,145,1660,1661,1662,1663,1667,1668,1918,1919,1920]:
 p=d.paragraphs[i];sec=p._p.xpath('./w:pPr/w:sectPr'); print(i,p.text[:90], 'section',sec[0].xml[-1300:] if sec else '', 'break',p.paragraph_format.page_break_before)
Path('work/manuscript-fix/captions.json').write_text(json.dumps({'figures':figs,'tables':tabs},indent=2),encoding='utf-8')
