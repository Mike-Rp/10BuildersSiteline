from docx import Document
from docx.shared import Inches, Pt
from copy import deepcopy
from pathlib import Path

groups=[
('Project Assignment Response Module',[
('The system clearly identifies the phases assigned to me.',[0,0,1,9]),
('The system explains requirements that prevent an assignment response.',[0,0,4,6]),
('The system clearly confirms acceptance of an assignment.',[0,0,3,7]),
('It is easy to record a reason for declining an assignment.',[0,1,2,7])]),
('Project and Phase Monitoring Module',[
('The system clearly identifies the phase currently in progress.',[0,0,3,7]),
('The system clearly shows my responsibilities for the assigned phase.',[0,0,6,4]),
('The system distinguishes approved activities from pending activities.',[0,0,3,7]),
('The system helps identify upcoming assignment deadlines.',[0,0,3,7])]),
('Checklist Evidence Submission Module',[
('The system clearly identifies activities requiring supporting evidence.',[0,0,4,6]),
('It is easy to attach evidence to an assigned activity.',[0,0,2,8]),
('The system clearly shows when evidence is awaiting review.',[0,0,4,6]),
('The review feedback explains corrections needed for rejected evidence.',[0,0,4,6])]),
('Field Updates and Site Issue Reporting Module',[
('It is easy to submit a field update for my active phase.',[0,0,3,7]),
('The system makes site issue categories understandable.',[0,0,7,3]),
('It is easy to identify activities affected by a reported issue.',[0,0,7,3]),
('The system clearly shows the review status of submitted field updates.',[0,0,3,7])]),
('Phase and Foreman Allocation Module Lead Site PM Only',[
('The suggested companies help me identify suitable options for the remaining phases.',[0,0,3,7]),
('It is easy to assign a company to each required phase.',[0,0,2,8]),
('It is easy to select the responsible foreman for each phase.',[0,0,8,2]),
('The system clearly confirms when an allocation proposal is saved.',[0,0,4,6])]),
('System Access and Usability',[
('The system makes signing in straightforward.',[0,0,4,6]),
("The system’s menu labels make assigned functions easy to find.",[0,0,5,5]),
('The system responds within an acceptable time during site reporting.',[0,0,5,5]),
('The system supports the completion of Site PM responsibilities.',[0,0,3,7])])]

doc=Document('output/Administrator_Evaluation_Results.docx')
template=deepcopy(doc.tables[0]._tbl)
body=doc._element.body
for child in list(body):
 if not child.tag.endswith('}sectPr'): body.remove(child)
doc.add_paragraph('Site Project Manager Evaluation Results','Title')
doc.add_paragraph('Ten Site Project Managers participated in the evaluation. Each response represents 10% of the respondents. Ratings are interpreted as 1 Strongly Disagree, 2 Disagree, 3 Agree, and 4 Strongly Agree.')
labels=['strongly disagreed','disagreed','agreed','strongly agreed']
for gi,(title,items) in enumerate(groups,1):
 if gi>1: doc.add_page_break()
 doc.add_paragraph(f'Objective {gi} {title}','Heading 1')
 for qi,(statement,counts) in enumerate(items,1):
  p=doc.add_paragraph(); p.paragraph_format.keep_with_next=True; p.add_run(statement).bold=True
  p=doc.add_paragraph(f'Table {(gi-1)*4+qi}. Summary of Results for Question No. {qi} for Site PMs','Caption')
  p.alignment=1; p.paragraph_format.keep_with_next=True
  body.insert(len(body)-1,deepcopy(template)); table=doc.tables[-1]
  values=[['Remarks','1','2','3','4'],['Number of Respondents']+list(map(str,counts)),['Percentage']+[f'{c*10}%' for c in counts]]
  for row,vals in zip(table.rows,values):
   for cell,value in zip(row.cells,vals):
    p=cell.paragraphs[0]; p.clear(); p.add_run(value)
  parts=[f'{counts[k]*10}% ({counts[k]}) {labels[k]}' for k in [3,2,1,0] if counts[k]]
  responses=', '.join(parts[:-1])+' and '+parts[-1] if len(parts)>1 else parts[0]
  meaning=statement[0].lower()+statement[1:].rstrip('.')
  meaning=meaning.replace('assigned to me','assigned to them').replace('help me identify','help them identify').replace('my responsibilities','their responsibilities').replace('my active phase','their active phase')
  if '[statement incomplete]' in statement:
   text=f'The table shows that out of the ten Site PM respondents, {responses} with this statement.'
  else: text=f'The table shows that out of the ten Site PM respondents, {responses} that {meaning}.'
  p=doc.add_paragraph(text); p.paragraph_format.first_line_indent=Inches(.5); p.paragraph_format.space_after=Pt(10)
out=Path('output/Site_Project_Manager_Evaluation_Results.docx'); doc.save(out)
check=Document(out)
assert len(check.tables)==24
for table,(_,expected) in zip(check.tables,[item for _,items in groups for item in items]):
 assert [int(c.text) for c in table.rows[1].cells[1:]]==expected
 assert sum(expected)==10
 assert sum(int(c.text[:-1]) for c in table.rows[2].cells[1:])==100
print('Validated 24 tables, including the rating 2 response in Objective 1 Question 4.')
print(out.resolve())
