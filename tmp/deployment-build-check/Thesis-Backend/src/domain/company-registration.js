export const COMPANY_PHONE_PATTERN = "[0-9]{11}";
export const COMPANY_EMAIL_PATTERN = "[A-Za-z0-9][A-Za-z0-9._%+\\-]*@gmail\\.com";

export function companyRegistrationErrors(company) {
    const errors = {};
    if (typeof company?.name !== "string" || !company.name.trim() || company.name.trim().length > 150)
        errors.name = "Enter a company name using 150 characters or fewer.";
    if (company?.foremen === undefined) {
        if (typeof company?.phone !== "string" || !/^\d{11}$/.test(company.phone))
            errors.phone = "Enter an 11-digit contact number.";
    } else if (!Array.isArray(company.foremen) || company.foremen.length < 1 || company.foremen.length > 2) {
        errors.foremen = "Provide one primary foreman and at most one backup foreman.";
    } else {
        company.foremen.forEach((foreman, index) => {
            if (!foreman || typeof foreman !== "object" || Array.isArray(foreman)) { errors.foremen = "Enter a name and mobile number for each foreman contact."; return; }
            const name = typeof foreman?.name === "string" ? foreman.name.trim() : "";
            const phone = typeof foreman?.phone === "string" ? foreman.phone : "";
            if (index === 1 && !name && !phone && (typeof foreman.name === "string" || foreman.name === undefined) && (typeof foreman.phone === "string" || foreman.phone === undefined)) return;
            const label = index === 0 ? "primary" : "backup";
            if (!name || name.length > 150) errors[`foreman${index + 1}Name`] = `Enter the ${label} foreman's full name using 150 characters or fewer.`;
            if (!/^\d{11}$/.test(phone)) errors[`foreman${index + 1}Phone`] = `Enter an 11-digit mobile number for the ${label} foreman.`;
        });
    }
    if (typeof company?.email !== "string" || company.email.trim().length > 254 || !/^[a-z0-9][a-z0-9._%+\-]*@gmail\.com$/i.test(company.email.trim()))
        errors.email = "Enter a valid @gmail.com email address.";
    return errors;
}

/** Call after validation. An unused backup is omitted; legacy contacts keep their original meaning. */
export function normalizeCompanyForemen(company) {
    if (company.foremen === undefined) return undefined;
    return company.foremen.filter((foreman, index) => index === 0 || foreman?.name?.trim() || foreman?.phone)
        .map(foreman => ({ name: foreman.name.trim(), phone: foreman.phone }));
}

const heading = value => String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
const idHeadings = new Set(["workerid", "laborerid", "id"]);
const nameHeadings = new Set(["laborername", "laborersname", "workername", "fullname", "name"]);

/** A new company's list contains available laborers only, one ID and name per row. */
export function manpowerRows(sheets) {
    const workers = [], ids = new Set();
    for (const sheet of sheets) {
        const rows = sheet.rows;
        const headerIndex = rows.slice(0, 20).findIndex(row => row.some(value => idHeadings.has(heading(value)) || nameHeadings.has(heading(value))));
        if (headerIndex === -1) continue;
        const headers = rows[headerIndex].map(heading);
        const idColumns = headers.flatMap((value, i) => idHeadings.has(value) ? [i] : []);
        const nameColumns = headers.flatMap((value, i) => nameHeadings.has(value) ? [i] : []);
        if (idColumns.length !== 1 || nameColumns.length !== 1)
            throw new Error(`Sheet "${sheet.name}" needs one Worker ID column and one Laborer Name column.`);
        for (let i = headerIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row.some(value => String(value ?? "").trim())) continue;
            const workerId = String(row[idColumns[0]] ?? "").trim();
            const name = String(row[nameColumns[0]] ?? "").trim().replace(/\s+/g, " ");
            if (!workerId || workerId.length > 100 || !name || name.length > 150)
                throw new Error(`Sheet "${sheet.name}", row ${i + 1}: enter a Worker ID and a Laborer Name (up to 100 and 150 characters).`);
            const key = workerId.toLocaleLowerCase();
            if (ids.has(key)) throw new Error(`Worker ID "${workerId}" appears more than once. Give each laborer a unique ID.`);
            ids.add(key);
            workers.push({ workerId, name });
            if (workers.length > 5000) throw new Error("Use a manpower list with 5,000 laborers or fewer.");
        }
    }
    if (!workers.length) throw new Error("Add Worker ID and Laborer Name columns with at least one laborer.");
    return workers;
}
