import XLSX from "xlsx";
import { locationError, normalizeLocation } from "../../domain/operating-location.js";
import { companyRegistrationErrors, manpowerRows, normalizeCompanyForemen } from "../../domain/company-registration.js";
import { HttpError, isUuid } from "../../common/utilities/access.utility.js";

export function readManpowerFile(file) {
    try {
        const workbook = XLSX.read(file.buffer || file.content, { type: "buffer", cellFormula: true, sheetRows: 5021 });
        if (workbook.SheetNames.length > 20) throw new Error("Use a workbook with 20 sheets or fewer.");
        const sheets = workbook.SheetNames.map(name => {
            const sheet = workbook.Sheets[name];
            if (Object.values(sheet).some(cell => cell && typeof cell === "object" && cell.f))
                throw new Error(`Sheet "${name}": enter worker details as text or numbers, without formulas.`);
            if (sheet["!fullref"] && XLSX.utils.decode_range(sheet["!fullref"]).e.r >= 5020)
                throw new Error("Use a manpower list with 5,000 laborers or fewer.");
            return { name, rows: XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: true }) };
        });
        return manpowerRows(sheets);
    } catch (error) {
        throw new HttpError(400, error instanceof Error ? error.message : "Use a valid Excel file with Worker ID and Laborer Name columns.");
    }
}

/** Values are read from stored file bytes; form-supplied headcounts are never used. */
export async function registerCompany(db, user, company, loadFile, projectId = "") {
    if (company?.operatingLocation !== undefined && locationError(company.operatingLocation)) throw new HttpError(400, locationError(company.operatingLocation));
    const errors = companyRegistrationErrors(company);
    if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0]);
    const foremen = normalizeCompanyForemen(company);
    let proposedDisciplines;
    if (company.proposedDisciplines !== undefined) {
        if (user.role !== "spm") throw new HttpError(403, "Only Site PMs can propose company trades.");
        const catalog = (await db.query("select code from disciplines")).rows.map(row => row.code);
        if (!Array.isArray(company.proposedDisciplines) || new Set(company.proposedDisciplines).size !== company.proposedDisciplines.length || company.proposedDisciplines.some(value => typeof value !== "string" || !catalog.includes(value)))
            throw new HttpError(400, "Choose proposed trades from the configured discipline catalog.");
        proposedDisciplines = company.proposedDisciplines;
    }
    if (!Array.isArray(company.manpowerDocuments || []) || (company.manpowerDocuments || []).length > 1)
        throw new HttpError(400, "Upload one current manpower list for this company.");
    if (!Array.isArray(company.documents || []) || (company.documents || []).length > 20)
        throw new HttpError(400, "Use 20 supporting documents or fewer.");
    const documents = [], manpowerDocuments = [];
    let workers = [];
    for (const [docs, purpose, target] of [[company.documents || [], "document", documents], [company.manpowerDocuments || [], "manpower", manpowerDocuments]]) {
        for (const doc of docs) {
            if (!doc?.uploaded) throw new HttpError(400, "Confirm each selected file before submitting.");
            if (!isUuid(doc.id)) throw new HttpError(400, "Upload a valid file before submitting.");
            const stored = await loadFile(db, user, doc.id, purpose);
            const locked = (await db.query("select purpose from stored_files where id=$1 for update", [stored.id])).rows[0];
            if (locked?.purpose === "company") throw new HttpError(409, "This file already belongs to a company. Upload the list for the new company.");
            if (purpose === "manpower") workers = readManpowerFile(stored);
            target.push({ id: stored.id, label: purpose === "manpower" ? "Company Manpower List" : "Company supporting document", name: stored.original_name,
                uploaded: true, clientVisible: false, owner: user.full_name, date: new Date().toISOString().slice(0, 10), size: stored.byte_size, mime: stored.content_type,
                ...(purpose === "manpower" ? { manpowerCount: workers.length } : {}) });
        }
    }
    if (company.id !== undefined && !isUuid(company.id)) throw new HttpError(400, "Invalid company ID. Reopen the company form and try again.");
    const companyId = company.id || crypto.randomUUID();
    if ((await db.query("select id from subcontractors where id=$1", [companyId])).rowCount)
        throw new HttpError(409, "This company request has already been submitted. Refresh the directory to view it.");
    const trade = (await db.query("select id from trades where code='Structural / Rebar'", [])).rows[0];
    if (!trade) throw new HttpError(422, "The company trade is not configured. Contact your Administrator.");
    const status = user.role === "admin" ? (company.status === "pending" ? "pending" : "approved") : "pending";
    const inserted = await db.query(`insert into subcontractors(id,company_name,trade_id,contact_email,source,directory_status,created_by,updated_by)
        values($1,$2,$3,$4,'directory',$5,$6,$6) on conflict(id) do nothing returning id`, [companyId, company.name.trim(), trade.id, company.email.trim().toLowerCase(), status, user.id]);
    if (!inserted.rowCount) throw new HttpError(409, "This company request has already been submitted. Refresh the directory to view it.");
    const roster = workers.map(worker => ({ ...worker, id: crypto.randomUUID() }));
    if (roster.length) await db.query(`insert into subcontractor_workers(id,subcontractor_id,full_name,status,availability_status,created_by,updated_by)
        select x.id,$1,x.name,'active','available',$3,$3 from jsonb_to_recordset($2::jsonb) as x(id uuid,name text)`, [companyId, JSON.stringify(roster), user.id]);
    await db.query("insert into workspace_company_metadata(subcontractor_id,metadata) values($1,$2)", [companyId, JSON.stringify({
        contact: foremen?.[0].name ?? (typeof company.contact === "string" ? company.contact.trim() : ""), phone: foremen?.[0].phone ?? company.phone,
        ...(foremen === undefined ? {} : { foremen }),
        ...(company.operatingLocation === undefined ? {} : { operatingLocation: normalizeLocation(company.operatingLocation) }),
        documents, manpowerDocuments, manpowerRoster: roster, note: typeof company.note === "string" ? company.note.trim() : "",
        projectId, submittedById: user.id, submittedBy: user.full_name, availability: "available", activeProjectIds: [], manpowerCount: workers.length,
        ...(proposedDisciplines === undefined ? {} : { proposedDisciplines }),
    })]);
    for (const doc of [...documents, ...manpowerDocuments]) await db.query("update stored_files set purpose='company' where id=$1", [doc.id]);
    return { id: companyId, status, manpowerCount: workers.length };
}

export async function withdrawCompanyRequest(db, user, id, projectId) {
    if (!isUuid(id)) throw new HttpError(400, "Invalid company ID.");
    const found = (await db.query(`select s.id,s.company_name,s.directory_status,m.metadata from subcontractors s
        join workspace_company_metadata m on m.subcontractor_id=s.id where s.id=$1 for update of s`, [id])).rows[0];
    if (!found || found.metadata.submittedById !== user.id || (projectId && found.metadata.projectId !== projectId))
        throw new HttpError(404, "Your company request was not found.");
    if (found.directory_status !== "pending") throw new HttpError(409, "Only pending company requests can be withdrawn.");
    // The directory schema supports approved/pending/declined; retain the archive state in workspace metadata.
    await db.query("update subcontractors set directory_status='declined',updated_by=$2,updated_at=now() where id=$1", [id, user.id]);
    await db.query("update workspace_company_metadata set metadata=metadata||$2::jsonb where subcontractor_id=$1", [id,
        JSON.stringify({ status: "archived", archivedAt: new Date().toISOString(), archivedBy: user.id })]);
    return found;
}
