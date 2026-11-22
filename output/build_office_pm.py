from pathlib import Path
groups = [
('Project Intake Review Module',[
('The system makes pending intake assignments easy to find.',0),
('The system provides useful project details for reviewing an assignment.',2),
('The system clearly confirms acceptance of an intake assignment.',0),
('It is easy to explain requested intake corrections.',1)]),
('Personnel Assignment Monitoring Module',[
('The system clearly identifies the Site PM assigned to each phase.',0),
('The system clearly identifies the Lead Site PM.',0),
('The system distinguishes pending responses from confirmed assignments.',1),
('The system helps identify assignments needing follow-up.',1)]),
('Registered Project Documents Module',[
('The system clearly identifies the required project documents.',0),
('It is easy to upload a required document after accepting an assignment.',0),
('The system clearly shows which required uploads are complete.',0),
('The downloaded document matches the registered file selected.',0)]),
('Project Progress and Schedule Monitoring Module',[
('The system clearly identifies the current construction phase.',0),
('The system distinguishes approved activities from activities awaiting review.',1),
('It is easy to compare recorded progress with planned progress.',0),
('The system helps identify projects that have passed their target date.',0)]),
('Progress Review and Rework Module',[
('The system displays the evidence needed for a checklist review.',0),
('The system clearly shows the outcome of a checklist review.',0),
('It is easy to record a decision on a field report.',1),
('The system clearly identifies activities affected by a rework request.',0)]),
('System Access and Usability',[
("The system’s menu labels make information easy to find.",2),
('Overall, the system helps me perform my tasks effectively.',0),
('The system is easy for me to use.',0),
('I am satisfied with my overall experience using the system.',0)])]
expected=[a for _,items in groups for _,a in items]
def meaning(s):
 if s.startswith('Overall,'): return 'the system helps them perform their tasks effectively'
 if s.startswith('I am satisfied'): return 'they are satisfied with their overall experience using the system'
 if s=='The system is easy for me to use.': return 'the system is easy to use'
 return s[0].lower()+s[1:].rstrip('.')
groups=[(title,[(s,a,meaning(s)) for s,a in items]) for title,items in groups]
source=Path('output/build_clients.py').read_text(encoding='utf-8')
source=source[:source.index('groups = [')]+source[source.index('# Reuse'):]
source=source.replace('Client Evaluation Results','Office Project Manager Evaluation Results')
source=source.replace('Five clients participated','Five Office Project Managers participated')
source=source.replace('for Clients','for Office Project Managers')
source=source.replace('five client respondents','five Office Project Manager respondents')
source=source.replace('Client_Evaluation_Results.docx','Office_Project_Manager_Evaluation_Results.docx')
source=source.replace('len(check.tables)==20','len(check.tables)==24')
source=source.replace('[0,1,3,1,2,1,2,1,2,2,1,2,1,0,0,1,0,0,1,0]','expected')
source=source.replace('20 client tables','24 Office Project Manager tables')
exec(compile(source,'office_pm_builder','exec'))
