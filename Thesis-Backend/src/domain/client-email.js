export const CLIENT_EMAIL_PATTERN = "[A-Za-z0-9][A-Za-z0-9._%+\\-]*@[Gg][Mm][Aa][Ii][Ll]\\.[Cc][Oo][Mm]"
export function clientEmailError(email) {
  return typeof email !== "string" || email.trim().length > 254 || !/^[a-z0-9][a-z0-9._%+\-]*@gmail\.com$/i.test(email.trim())
    ? "Enter a valid @gmail.com email address."
    : ""
}
