// Company policy, independent of the professional license's legal validity.
export const licensePolicyDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);
const number = day => Date.parse(String(day).slice(0, 10) + 'T00:00:00Z');
const shift = (day, amount) => new Date(number(day) + amount * 86400000).toISOString().slice(0, 10);
// 30 days before expiry: new assignments are blocked and the Admin starts the replacement.
// At 30 days only renewal access remains. Self-service submission closes at 23 days.
export function licenseAccessPolicy(expiry, today = licensePolicyDay()) {
  if (!expiry || !Number.isFinite(number(expiry))) return { mode: 'normal', prepareReplacement: false, newAssignmentsBlocked: true, daysToExpiry: null, noticeOn: null, restrictedOn: null };
  const days = Math.round((number(expiry) - number(today)) / 86400000);
  return { mode: days <= 30 ? 'view_only' : 'normal', prepareReplacement: days <= 30, newAssignmentsBlocked: days <= 30,
    daysToExpiry: days, noticeOn: shift(expiry, -30), restrictedOn: shift(expiry, -23) };
}
export const LICENSE_VIEW_ONLY_MESSAGE = 'Renewal-only access: your license is within 30 days of expiry. Submit during the seven-day window or contact Admin after the submission deadline. Normal workspace access is blocked.';
