from pathlib import Path
from pdf2image import convert_from_path
base=Path('work/screenshot-docs-qa')
poppler=r'C:\Users\ADMIN\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
for name in ['Administrator Survey Screenshots','OPM SPM Client Survey Screenshots']:
    target=base/name;target.mkdir(exist_ok=True)
    pages=convert_from_path(str(base/(name+'.pdf')),dpi=100,poppler_path=poppler)
    for i,page in enumerate(pages):page.save(target/f'page-{i+1}.png')
    print(name,len(pages))
