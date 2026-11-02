// Classify the process using server records, never a client-provided label.
export const SUBMISSION_KIND_SQL = `case when q.submitted_by<>q.user_id and q.replaces_license_id is null
 and not exists(select 1 from user_licenses prior where prior.user_id=q.user_id
   and (prior.profession=q.profession or prior.profession is null) and prior.created_at<=q.submitted_at
   and prior.id is distinct from q.resulting_license_id)
 then 'initial' else 'renewal' end`;

export const PENDING_RENEWAL_SQL = `select exists(select 1 from license_renewal_requests q
 where q.user_id=$1 and q.status='under_review' and (${SUBMISSION_KIND_SQL})='renewal') as pending`;
