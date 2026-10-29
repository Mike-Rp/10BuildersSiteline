// Company policy, independent of the professional license's legal validity.
export const licensePolicyDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const number = day => Date.parse(String(day).slice(0, 10) + 'T00:00:00Z');
const shift = (day, amount) => new Date(number(day) + amount * 86400000).toISOString().slice(0, 10);
export function licenseAccessPolicy(expiry, today = licensePolicyDay()) {
  if (!expiry || !Number.isFinite(number(expiry))) return { mode: 'normal', prepareReplacement: false, newAssignmentsBlocked: true, daysToExpiry: null, noticeOn: null, disabledOn: null, viewingDaysLeft: null };
  const days = Math.round((number(expiry) - number(today)) / 86400000);
  const mode = days <= 23 ? 'disabled' : days <= 30 ? 'view_only' : 'normal';
  return { mode, prepareReplacement: days <= 33, newAssignmentsBlocked: days <= 30,
    daysToExpiry: days, noticeOn: shift(expiry, -30), disabledOn: shift(expiry, -23),
    viewingDaysLeft: mode === 'view_only' ? days - 23 : null };
}
export const LICENSE_ACCESS_DISABLED_MESSAGE = 'Workspace access is disabled under the company license policy after the seven-day viewing period. Contact your 10 Builders Administrator to verify your renewed PRC license.';
export const LICENSE_VIEW_ONLY_MESSAGE = 'Viewing-only access under the company license policy. Submissions, approvals and project changes are disabled until your renewed license is verified.';
