// Office schedule uses Philippine local time (UTC+8), Monday-Friday, 08:00-17:00.
export function normalInquiryDeadline(submittedAt) {
  const instant = new Date(submittedAt);
  if (!Number.isFinite(instant.getTime())) throw new Error("Invalid submission date.");
  const local = new Date(instant.getTime() + 8 * 60 * 60 * 1000);
  let remaining = 9 * 60 * 60 * 1000;
  while (remaining > 0) {
    const day = local.getUTCDay();
    const opening = new Date(local); opening.setUTCHours(8, 0, 0, 0);
    const closing = new Date(local); closing.setUTCHours(17, 0, 0, 0);
    if (day === 0 || day === 6 || local >= closing) {
      local.setUTCDate(local.getUTCDate() + 1); local.setUTCHours(8, 0, 0, 0); continue;
    }
    if (local < opening) local.setTime(opening.getTime());
    const used = Math.min(remaining, closing.getTime() - local.getTime());
    local.setTime(local.getTime() + used); remaining -= used;
  }
  return new Date(local.getTime() - 8 * 60 * 60 * 1000).toISOString();
}
