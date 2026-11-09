// Which old backups to delete. Pure functions so the rule can be tested without touching disk.
// Only files and folders that match our own naming are ever considered, so nothing else in the folder is removed.

const pad = (n) => String(n).padStart(2, "0");

/** Local calendar date as YYYY-MM-DD. */
export function dateStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function stampToUtcDay(stamp) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stamp);
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? time : undefined;
}

const DAY_MS = 86_400_000;
const DATABASE_FILE = /^database-(\d{4}-\d{2}-\d{2})\.dump\.enc$/;
const DATED_FOLDER = /^(\d{4}-\d{2}-\d{2})$/;

function expired(stamp, today, keepDays) {
  const day = stampToUtcDay(stamp);
  const now = stampToUtcDay(today);
  if (day === undefined || now === undefined) return false;
  return day < now - keepDays * DAY_MS;
}

/** Database backups older than `keepDays` days. Today plus the previous `keepDays` days are always kept. */
export function expiredDatabaseBackups(names, today, keepDays) {
  return names.filter((name) => {
    const match = DATABASE_FILE.exec(name);
    return match && expired(match[1], today, keepDays);
  });
}

/** Dated folders of replaced or deleted files that are older than `keepDays` days. */
export function expiredRemovedFolders(names, today, keepDays) {
  return names.filter((name) => {
    const match = DATED_FOLDER.exec(name);
    return match && expired(match[1], today, keepDays);
  });
}

export function validRetentionDays(value) {
  return Number.isInteger(value) && value >= 7 && value <= 3650;
}
