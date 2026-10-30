export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_WARNING_MS = 5 * 60 * 1000;
export function sessionTiming(payload, activity, now = Date.now()) {
  const fallback = Number(payload.iat) * 1000;
  const last = activity?.sessionId === payload.jti ? Date.parse(activity.lastActivityAt) : fallback;
  const lastActivityAt = Number.isFinite(last) ? last : 0;
  const expiresAt = Math.min(lastActivityAt + SESSION_IDLE_MS, Number(payload.exp) * 1000);
  return { lastActivityAt, expiresAt, warningAt: expiresAt - SESSION_WARNING_MS, expired: !Number.isFinite(expiresAt) || now >= expiresAt };
}
