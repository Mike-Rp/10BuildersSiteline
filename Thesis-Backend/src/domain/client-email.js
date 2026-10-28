export const CLIENT_EMAIL_PATTERN = "[A-Za-z0-9][A-Za-z0-9._%+\\-]*@10[Bb][Uu][Ii][Ll][Dd][Ee][Rr][Ss]\\.[Cc][Oo][Mm]"
export function clientEmailError(email) {
  return typeof email !== "string" || email.trim().length > 254 || !/^[a-z0-9][a-z0-9._%+\-]*@10builders\.com$/i.test(email.trim())
    ? "Enter a valid @10builders.com email address."
    : ""
}
