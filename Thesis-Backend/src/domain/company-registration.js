export const COMPANY_PHONE_PATTERN = "[0-9]{11}";
export const COMPANY_EMAIL_PATTERN = "[A-Za-z0-9][A-Za-z0-9._%+\\-]*@gmail\\.com";

export function companyRegistrationErrors(company) {
    const errors = {};
    if (typeof company?.name !== "string" || !company.name.trim() || company.name.trim().length > 150)
        errors.name = "Enter a company name using 150 characters or fewer.";
    if (typeof company?.phone !== "string" || !/^\d{11}$/.test(company.phone))
        errors.phone = "Enter an 11-digit contact number.";
    if (typeof company?.email !== "string" || company.email.trim().length > 254 || !/^[a-z0-9][a-z0-9._%+\-]*@gmail\.com$/i.test(company.email.trim()))
        errors.email = "Enter a valid @gmail.com email address.";
    return errors;
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
