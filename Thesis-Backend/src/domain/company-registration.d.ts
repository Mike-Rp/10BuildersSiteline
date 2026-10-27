export const COMPANY_PHONE_PATTERN: string
export const COMPANY_EMAIL_PATTERN: string
export type CompanyRegistrationErrors = Partial<Record<"name" | "phone" | "email" | "foremen" | "foreman1Name" | "foreman1Phone" | "foreman2Name" | "foreman2Phone", string>>
export type CompanyRegistrationInput = { name?: unknown; phone?: unknown; email?: unknown; foremen?: unknown }
export function companyRegistrationErrors(company: CompanyRegistrationInput): CompanyRegistrationErrors
export function normalizeCompanyForemen(company: CompanyRegistrationInput): { name: string; phone: string }[] | undefined
export function manpowerRows(sheets: { name: string; rows: unknown[][] }[]): { workerId: string; name: string }[]
