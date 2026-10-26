export const COMPANY_PHONE_PATTERN: string
export const COMPANY_EMAIL_PATTERN: string
export type CompanyRegistrationErrors = Partial<Record<"name" | "phone" | "email", string>>
export function companyRegistrationErrors(company: { name?: unknown; phone?: unknown; email?: unknown }): CompanyRegistrationErrors
export function manpowerRows(sheets: { name: string; rows: unknown[][] }[]): { workerId: string; name: string }[]
