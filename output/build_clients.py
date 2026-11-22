from docx import Document
from docx.shared import Inches, Pt
from pathlib import Path

groups = [
('Project Access and Overview Module', [
('The system makes signing in straightforward.',0,'signing in is straightforward'),
('It is easy to find the project linked to my account.',1,'finding the project linked to their account is easy'),
('The system provides a clear overview of my project’s current status.',3,'the system provides a clear overview of their project’s current status'),
('The system makes project contact information easy to find.',1,'the system makes project contact information easy to find')]),
('Project Progress Viewing Module', [
('The system presents overall project progress in an understandable way.',2,'the system presents overall project progress in an understandable way'),
('The system clearly identifies the current construction phase.',1,'the system clearly identifies the current construction phase'),
('It is easy to find shared updates in the project history.',2,'finding shared updates in the project history is easy'),
('The system clearly displays the date of each shared update.',1,'the system clearly displays the date of each shared update')]),
('Project Schedule Monitoring Module', [
('The system clearly displays the planned project start date.',2,'the system clearly displays the planned project start date'),
('The system clearly displays the target completion date when recorded.',2,'the system clearly displays the target completion date when recorded'),
('The system makes the project’s schedule status easy to understand.',1,'the system makes the project’s schedule status easy to understand'),
('The system clearly identifies when the target completion date has passed.',2,'the system clearly identifies when the target completion date has passed')]),
('Shared Documents and Site Photographs Module', [
('It is easy to find documents shared with my account.',1,'finding documents shared with their account is easy'),
('The system displays supported document previews clearly.',0,'the system displays supported document previews clearly'),
('The downloaded document matches the shared file selected.',0,'the downloaded document matches the shared file selected'),
('It is easy to view site photographs released for my project.',1,'viewing site photographs released for their project is easy')]),
('Usability and Overall Effectiveness', [
('The system’s menu labels make information easy to find.',0,'the system’s menu labels make information easy to find'),
('Overall, the system helps me stay informed about my project.',0,'the system helps them stay informed about their project'),
('The system is easy for me to use.',1,'the system is easy to use'),
('I am satisfied with my overall experience using the system.',0,'they are satisfied with their overall experience using the system')])]

# Reuse the previously delivered document's typography and table formatting.
doc = Document('output/Administrator_Evaluation_Results.docx')
from copy import deepcopy
table_template = deepcopy(doc.tables[0]._tbl)
body=doc._element.body
for child in list(body):
 if child.tag.endswith('}sectPr'): continue
 body.remove(child)
doc.add_paragraph('Client Evaluation Results','Title')
doc.add_paragraph('Five clients participated in the evaluation. Each response represents 20% of the respondents. The following tables present the response counts and percentages for each statement, where rating 3 means Agree and rating 4 means Strongly Agree.')
for gi,(title,items) in enumerate(groups,1):
 if gi>1: doc.add_page_break()
 doc.add_paragraph(f'Objective {gi} {title}','Heading 1')
 for qi,(statement,agree,meaning) in enumerate(items,1):
  strong=5-agree
  p=doc.add_paragraph(); p.paragraph_format.keep_with_next=True; p.add_run(statement).bold=True
  p=doc.add_paragraph(f'Table {(gi-1)*4+qi}. Summary of Results for Question No. {qi} for Clients','Caption')
  p.alignment=1; p.paragraph_format.keep_with_next=True
  element=deepcopy(table_template); body.insert(len(body)-1,element)
  table=doc.tables[-1]
  values=[['Remarks','1','2','3','4'],['Number of Respondents','0','0',str(agree),str(strong)],['Percentage','0%','0%',f'{agree*20}%',f'{strong*20}%']]
  for row,vals in zip(table.rows,values):
   for cell,value in zip(row.cells,vals):
    p=cell.paragraphs[0]
    p.clear(); p.add_run(value)
  if agree:
   response=f'{strong*20}% ({strong}) strongly agreed and {agree*20}% ({agree}) agreed'
  else: response='100% (5) strongly agreed'
  p=doc.add_paragraph(f'The table shows that out of the five client respondents, {response} that {meaning}.')
  p.paragraph_format.first_line_indent=Inches(.5); p.paragraph_format.space_after=Pt(10)
out=Path('output/Client_Evaluation_Results.docx'); doc.save(out)
check=Document(out)
assert len(check.tables)==20
for table in check.tables:
 assert sum(int(c.text) for c in table.rows[1].cells[1:])==5
 assert sum(int(c.text.rstrip('%')) for c in table.rows[2].cells[1:])==100
assert [int(t.cell(1,3).text) for t in check.tables]==[0,1,3,1,2,1,2,1,2,2,1,2,1,0,0,1,0,0,1,0]
print('Validated all 20 client tables, counts and percentages.')
print(out.resolve())
