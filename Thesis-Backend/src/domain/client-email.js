export const CLIENT_EMAIL_PATTERN = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+"
const clientEmailPattern = new RegExp(`^(?:${CLIENT_EMAIL_PATTERN})$`)
export function clientEmailError(email) {
  return typeof email !== "string" || email.trim().length > 254 || !clientEmailPattern.test(email.trim())
    ? "Enter a valid client email address, such as name@gmail.com."
    : ""
}
