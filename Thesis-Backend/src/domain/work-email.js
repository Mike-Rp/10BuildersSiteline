export const WORK_EMAIL_DOMAIN = "10builders.com";

// Accept the printed ID (10B-00168) and its email form (10B00168).
export function normalizeEmployeeId(value) {
  if (typeof value !== "string") return "";
  const match = /^10B-?(\d{5})$/i.exec(value.trim());
  return match ? `10B${match[1]}` : "";
}

export function employeeIdFromWorkEmail(email) {
  if (typeof email !== "string") return "";
  const match = /^[a-z0-9]+\.(10b\d{5})@10builders\.com$/i.exec(email.trim());
  return match ? normalizeEmployeeId(match[1]) : "";
}

export function workEmailFor(lastName, employeeId) {
  const id = normalizeEmployeeId(employeeId);
  const surname = lastName.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return surname && id ? `${surname}.${id}@${WORK_EMAIL_DOMAIN}` : "";
}
