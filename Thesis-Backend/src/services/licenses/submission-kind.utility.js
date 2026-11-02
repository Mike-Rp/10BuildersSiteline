// Classify the process using server records, never a client-provided label.
export const SUBMISSION_KIND_SQL = `case when q.submitted_by<>q.user_id and q.replaces_license_id is null
 and not exists(select 1 from user_licenses prior where prior.user_id=q.user_id
   and prior.profession=q.profession and prior.created_at<=q.submitted_at
   and prior.id is distinct from q.resulting_license_id)
 then 'initial' else 'renewal' end`;
