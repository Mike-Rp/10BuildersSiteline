// Company policy, independent of the professional license's legal validity.
export const licensePolicyDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const number = day => Date.parse(String(day).slice(0, 10) + 'T00:00:00Z');
const shift = (day, amount) => new Date(number(day) + amount * 86400000).toISOString().slice(0, 10);
// 30 days before expiry: new assignments are blocked and the Admin starts the replacement.
// Once expired: submissions, approvals and project changes are blocked; records stay viewable and renewal can be requested.
export function licenseAccessPolicy(expiry, today = licensePolicyDay()) {
  if (!expiry || !Number.isFinite(number(expiry))) return { mode: 'normal', prepareReplacement: false, newAssignmentsBlocked: true, daysToExpiry: null, noticeOn: null, restrictedOn: null };
  const days = Math.round((number(expiry) - number(today)) / 86400000);
  return { mode: days < 0 ? 'view_only' : 'normal', prepareReplacement: days <= 30, newAssignmentsBlocked: days <= 30,
    daysToExpiry: days, noticeOn: shift(expiry, -30), restrictedOn: shift(expiry, 1) };
}
export const LICENSE_VIEW_ONLY_MESSAGE = 'Viewing-only access: your PRC license has expired. Submissions, approvals and project changes are disabled until your renewed license is verified. You can still view records and submit your renewal.';
