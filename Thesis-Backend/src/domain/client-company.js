import { companyRegistrationErrors, normalizeCompanyForemen } from "./company-registration.js";

export function normalizeClientCompany(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.foremen))
        throw new Error("Provide the client subcontractor's company details and primary foreman.");
    const errors = companyRegistrationErrors(value);
    if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
    if (value.note !== undefined && (typeof value.note !== "string" || value.note.length > 5000))
        throw new Error("Use company notes of 5,000 characters or fewer.");
    if (value.documents !== undefined && (!Array.isArray(value.documents) || value.documents.length > 20 || value.documents.some(doc => !doc || typeof doc.id !== "string" || doc.uploaded !== true)))
        throw new Error("Use 20 uploaded company supporting documents or fewer.");
    const foremen = normalizeCompanyForemen(value);
    return { name: value.name.trim(), email: value.email.trim().toLowerCase(), foremen,
        contact: foremen[0].name, phone: foremen[0].phone, availability: "available",
        note: value.note?.trim() || "", documents: value.documents || [] };
}
