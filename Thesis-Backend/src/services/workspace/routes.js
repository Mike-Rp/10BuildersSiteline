import { sessionStatus } from "../auth/controller.js";
import { linkProjectFile } from "./project-upload-budget.utility.js";
import { getProjectData, reconcilePhaseHandoffs } from "./project-data.controller.js";
import { workspaceReferences } from "./reference-cache.utility.js";
import { projectWorkflowSql } from "../projects/project-workflow.utility.js";
import { normalizeMixedUseScope } from "../../domain/mixed-use-scope.js";
import { locationError, normalizeLocation, sameLocationRecord } from "../../domain/operating-location.js";
import { companyRegistrationErrors, normalizeCompanyForemen } from "../../domain/company-registration.js";
import { normalizeClientCompany } from "../../domain/client-company.js";
import { COMMITMENTS_SQL, allocationCommand, saveCapabilityReview, usesTradeAllocation, validateAllocationActivation } from "./subcontractor-allocation.utility.js";
import { updateNotificationPreferences } from "./notification-preferences.utility.js";
import { validateEngineerExperience, saveEngineerExperience } from "../accounts/experience.utility.js";
import { mirrorLegacyNotifications, mirrorLegacyReads } from "../notifications/notification.utility.js";
import { monthlyReport, exportMonthlyReport, monthlySummary, exportMonthlySummary } from "../reports/controller.js";
import { snapshotProjectChecklists } from "../progress/verified.utility.js";
import { validateUpload } from "./upload-policy.utility.js";
import { readManpowerFile, registerCompany, withdrawCompanyRequest } from "./manpower-import.utility.js";
import { Router } from "express";
import multer from "multer";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { requireUser, requireLogin, hasProjectAccess, HttpError, handleError, sendOk, isUuid, paging } from "../../common/utilities/access.utility.js";
import { login, staffLogin, adminLogin, logout, reset } from "../auth/controller.js";
import { getSubcontractors, createSubcontractor } from "../subcontractors/controller.js";
import subcontractors from "../subcontractors/routes.js";
import phases from "../progress/phase.routes.js";
import progress from "../progress/routes.js";
import { assertLicenseActive } from "../../common/utilities/license-gate.utility.js";
import { sweepLicensesThrottled } from "../licenses/sweep.js";
import { sweepLicenses, sweepLicensesIfDue } from "../accounts/license-sweep.utility.js";
const router = Router();
router.get("/projects/:id/monthly-report", monthlyReport);
router.post("/projects/:id/monthly-report/export", exportMonthlyReport);
router.get("/reports/monthly-summary", monthlySummary);
router.post("/reports/monthly-summary/export", exportMonthlySummary);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
// Commands an Office PM or Site PM signs, submits or approves. Blocked while their license is expired.
const LICENSE_COMMANDS = new Set(["upload_registered", "contact_company", "respond_company", "archive_company", "request_company", "archive_company_request",
    "save_allocation_plan", "auto_allocate_company", "release_allocation_company", "set_allocation_location",
    "acknowledge_client_subcon", "report_client_subcon_issue", "upload_agreement", "activate_project"]);
const parseUpload = (req, res, next) => upload.single("file")(req, res, error => {
    if (error) return handleError(res, new HttpError(400, error.code === "LIMIT_FILE_SIZE" ? "The file must be 15 MB or smaller. Documents have a 10 MB limit." : error.message));
    return next();
});
const codes = ["notice_to_proceed", "building_permit", "owner_contract", "registered_plans", "environmental_certificate", "budget_boq", "subcontractor_agreement"];
const endpoint = (roles, fn) => async (req, res) => {
    try {
        const user = await requireUser(req, res, roles);
        if (!user)
            return;
        const data = await withTransaction(async (db) => {
            await db.query("select set_config('app.current_user_id',$1,true)", [user.id]);
            return fn(db, user, req);
        });
        return sendOk(res, "Saved.", Array.isArray(data) ? data.length : 1, data);
    }
    catch (error) {
        return handleError(res, error);
    }
};
async function project(db, user, id, write = false) {
    if (!isUuid(id))
        throw new HttpError(400, "Invalid project ID.");
    if (!await hasProjectAccess(user, id, db))
        throw new HttpError(404, "Project not found.");
    const found = await db.query("select * from projects where id=$1 and not coalesce(is_deleted,false)" + (write ? " for update" : ""), [id]);
    const p = found.rows[0];
    if (!p)
        throw new HttpError(404, "Project not found.");
    if (user.role === "client" && !["active", "archived"].includes(p.lifecycle_status))
        throw new HttpError(404, "Project not found.");
    if (write && p.lifecycle_status === "archived")
        throw new HttpError(409, "Completed projects are read-only.");
    return p;
}
async function file(db, user, id, purpose = "document") {
    const row = (await db.query("select * from stored_files where id=$1", [id])).rows[0];
    if (!row || !(user.role === "admin" || row.uploaded_by === user.id))
        throw new HttpError(404, "Uploaded file not found.");
    await validateUpload(row, purpose);
    return row;
}
async function linkDocument(db, user, p, code, fileId) {
    if (!codes.includes(code))
        throw new HttpError(400, "Unknown document type.");
    const bytes = await file(db, user, fileId);
    const type = (await db.query("select id from document_types where code=$1", [code])).rows[0];
    if (!type)
        throw new HttpError(422, "Document type is not configured.");
    await linkProjectFile(db, p.id, bytes.id);
    return (await db.query(`insert into project_documents(project_id,document_type_id,status,file_ref,uploaded_by,uploaded_at)
 values($1,$2,'uploaded',$3,$4,now()) on conflict(project_id,document_type_id) do update
 set status='uploaded',file_ref=excluded.file_ref,uploaded_by=excluded.uploaded_by,uploaded_at=now() returning id`, [p.id, type.id, "db://" + bytes.id, user.id])).rows[0];
}
async function event(db, user, p, title, detail = "") {
    const result = await db.query(`insert into activity_log(activity_type_id,title,detail,actor_user_id,related_project_id)
 select id,$1,$2,$3,$4 from activity_types where code='notice' returning id`, [title, detail, user.id, p?.id || null]);
    if (result.rowCount) {
        await db.query(`insert into notification_recipients(activity_log_id,recipient_user_id)
 select $1,id from users where id=$2 or id=$3 or role_id=(select id from roles where code='admin')
 on conflict do nothing`, [result.rows[0].id, user.id, p?.suggested_opm_id || null]);
        await mirrorLegacyNotifications(db, [result.rows[0].id]);
    }
}
const normalizeResetName = value => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
async function findResetAccounts(db, body) {
    const { firstName, middleName = "", lastName } = body || {};
    if ([firstName, lastName].some(value => typeof value !== "string" || !value.trim() || value.length > 100) || typeof middleName !== "string" || middleName.length > 100)
        throw new HttpError(400, "Enter your first and last name. Middle name is optional.");
    const first = normalizeResetName(firstName), middle = normalizeResetName(middleName), last = normalizeResetName(lastName);
    const result = await db.query("select id,full_name,email from users where not coalesce(is_deleted,false)");
    const matches = result.rows.filter(user => {
        const name = normalizeResetName(user.full_name.replace(/\s*\([^)]*\)/g, ""));
        if (middle) return name === `${first} ${middle} ${last}`;
        return name === `${first} ${last}` || (name.startsWith(first + " ") && name.endsWith(" " + last) && name.length > first.length + last.length + 2);
    });
    return matches;
}
router.post("/auth/password-reset-lookup", async (req, res) => {
    try {
        const matches = await withTransaction(db => findResetAccounts(db, req.body));
        return sendOk(res, "Account lookup complete.", 1, { accounts: matches.map(user => ({ name: user.full_name, email: user.email })) });
    } catch (error) { return handleError(res, error); }
});
router.post("/auth/password-reset-request", async (req, res) => {
    try {
        const { email } = req.body || {};
        if (typeof email !== "string" || email.length > 254) throw new HttpError(400, "Confirm your work email.");
        await withTransaction(async db => {
            const matches = await findResetAccounts(db, req.body);
            const match = matches.find(user => user.email.toLowerCase() === email.trim().toLowerCase());
            if (!match) throw new HttpError(409, "Your account details have changed. Please look up your name again or contact your administrator.");
            const found = await db.query("select id,full_name from users where id=$1 and lower(email::text)=$2 and not coalesce(is_deleted,false) for update", [match.id, email.trim().toLowerCase()]);
            const user = found.rows[0];
            if (!user) throw new HttpError(409, "Your account details have changed. Please look up your name again.");
            const pending = await db.query("select 1 from workspace_account_metadata where user_id=$1 and metadata->>'passwordResetRequestedAt' is not null", [user.id]);
            if (pending.rowCount) return;
            await db.query("insert into workspace_account_metadata(user_id,metadata) values($1,jsonb_build_object('passwordResetRequestedAt',now()::text,'passwordResetReadBy','{}'::jsonb)) on conflict(user_id) do update set metadata=workspace_account_metadata.metadata||excluded.metadata", [user.id]);
            await event(db, user, null, "Password reset requested", user.full_name + " requested a password reset. Review Password reset requests on the dashboard.");
        });
        return sendOk(res, "Your request has been sent to the administrator.", 1, {});
    } catch (error) { return handleError(res, error); }
});
router.get("/accounts/password-reset-requests", endpoint(["admin"], async (db,user,req) => {
    const rows=(await db.query(`select u.id,u.full_name,u.email,r.code as role,m.metadata from users u join roles r on r.id=u.role_id
      join workspace_account_metadata m on m.user_id=u.id where not coalesce(u.is_deleted,false)
      and (m.metadata->>'passwordResetRequestedAt' is not null or (m.metadata->'passwordResetHistory') is not null)`)).rows;
    const pending=rows.filter(r=>r.metadata.passwordResetRequestedAt).map(r=>({id:r.id,full_name:r.full_name,email:r.email,role:r.role,status:'pending',
      requested_at:r.metadata.passwordResetRequestedAt,read_at:r.metadata.passwordResetReadBy?.[user.id]?.requestedAt === r.metadata.passwordResetRequestedAt ? r.metadata.passwordResetReadBy[user.id].readAt : null}));
    pending.sort((a,b)=>b.requested_at.localeCompare(a.requested_at));
    if(req.query.include_completed !== 'true') return pending;
    const completed=rows.flatMap(r=>(r.metadata.passwordResetHistory || []).map(h=>({id:r.id,full_name:r.full_name,email:r.email,role:r.role,status:'completed',requested_at:h.requestedAt,completed_at:h.completedAt,completed_by:h.completedBy,read_at:h.completedAt}))).sort((a,b)=>b.completed_at.localeCompare(a.completed_at)).slice(0,20);
    return [...pending,...completed];
}));
router.post("/accounts/:id/password-reset-requests/read", endpoint(["admin"], async(db,user,req)=>{
    if(!isUuid(req.params.id) || typeof req.body?.requestedAt !== 'string') throw new HttpError(400,'Invalid reset request.');
    await db.query('select id from users where id=$1 for update',[req.params.id]);
    const meta=(await db.query('select metadata from workspace_account_metadata where user_id=$1',[req.params.id])).rows[0]?.metadata;
    if(!meta?.passwordResetRequestedAt || meta.passwordResetRequestedAt !== req.body.requestedAt) throw new HttpError(409,'This request has changed or was completed. Refresh the requests.');
    const readAt=new Date().toISOString();
    await db.query(`update workspace_account_metadata set metadata=jsonb_set(metadata,'{passwordResetReadBy}',coalesce(metadata->'passwordResetReadBy','{}'::jsonb)||$2::jsonb) where user_id=$1`,[req.params.id,JSON.stringify({[user.id]:{requestedAt:req.body.requestedAt,readAt}})]);
    return {read_at:readAt};
}));
router.post("/auth/login", login);
router.post("/auth/staff/login", staffLogin);
router.post("/auth/admin/login", adminLogin);
router.post("/auth/logout", logout);
router.get("/auth/session", sessionStatus);
router.post("/auth/activity", sessionStatus);
router.post("/auth/reset-password", requireLogin, reset);
router.get("/auth/me", endpoint(null, async (db, user) => (await db.query("select u.id,u.full_name,u.email,r.code as role,u.status,u.temp_password_issued from users u join roles r on r.id=u.role_id where u.id=$1", [user.id])).rows[0]));
router.get("/subcontractors", getSubcontractors);
router.post("/subcontractors", createSubcontractor);
router.use(phases);
router.use(progress);
router.use(subcontractors);
router.get("/workspace/project-data",getProjectData);
router.post("/workspace/reconcile-phase-handoffs",reconcilePhaseHandoffs);
router.get("/workspace", endpoint(null, async (db, user) => {
    await db.query(`update users u set status='suspended',updated_at=now() from workspace_account_metadata m
 where m.user_id=u.id and m.metadata->>'assignmentHold'='true' and m.metadata->'resignation'->>'status'='notice'
 and (m.metadata->'resignation'->>'effectiveDate')::timestamptz<=now()`);
    await db.query(`delete from users_token t using workspace_account_metadata m where m.user_id=t.user_id and m.metadata->>'assignmentHold'='true'
 and m.metadata->'resignation'->>'status'='notice' and (m.metadata->'resignation'->>'effectiveDate')::timestamptz<=now()`);
    await db.query(`update workspace_account_metadata set metadata=metadata||jsonb_build_object('status','deactivated',
 'resignation',(metadata->'resignation')||jsonb_build_object('status','deactivated','deactivatedAt',now()))
 where metadata->>'assignmentHold'='true' and metadata->'resignation'->>'status'='notice' and (metadata->'resignation'->>'effectiveDate')::timestamptz<=now()`);
    await sweepLicensesThrottled(db);
    const allowed = (await db.query(`select p.id from projects p where not coalesce(p.is_deleted,false) and
 ($1='admin' or p.suggested_opm_id=$2 or exists(select 1 from project_phase_team t where t.project_id=p.id and t.spm_user_id=$2)
 or exists(select 1 from project_engineers e where e.project_id=p.id and e.user_id=$2 and e.unassigned_at is null)
 or exists(select 1 from engineer_assignment_history h where h.project_id=p.id and h.user_id=$2 and h.ended_at is not null)
 or exists(select 1 from user_client_project_links l where l.project_id=p.id and l.user_id=$2))`, [user.role, user.id])).rows.map(r => r.id);
    const projectMeta = user.role === "client" ? [] : (await db.query("select project_id as id,metadata from workspace_project_metadata where project_id=any($1::uuid[])", [allowed])).rows;
    const accountMeta = (await db.query("select user_id as id,metadata from workspace_account_metadata where $1='admin' or user_id=$2", [user.role, user.id])).rows;
    const companyMeta = user.role === "client" ? [] : (await db.query("select subcontractor_id as id,metadata from workspace_company_metadata")).rows;
    const selections = user.role === "client" ? [] : (await db.query("select * from project_subcontractor_selections where project_id=any($1::uuid[])", [allowed])).rows;
    const map = rows => Object.fromEntries(rows.map(r => [r.id, r.metadata]));
    const { backendPhases, referenceDisciplines } = await workspaceReferences.get(db);
    const accountDetails = user.role === "admin" ? (await db.query(`select u.id,
 (select to_jsonb(l) from user_licenses l where l.user_id=u.id and l.superseded_at is null order by l.created_at desc limit 1) as license,
 array(select c.code from user_certifications x join certification_types c on c.id=x.certification_type_id where x.user_id=u.id) as certifications
 from users u where not coalesce(u.is_deleted,false)`)).rows : [];
    const tradeAllocationAvailable = (await db.query("select exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='subcontractor_allocation_version') as ready")).rows[0].ready;
    return { backendPhases, referenceDisciplines, tradeAllocationAvailable, accountDetails: Object.fromEntries(accountDetails.map(a => [a.id, a])),
        rules: (await db.query("select rules from workspace_settings where singleton")).rows[0]?.rules,
        preferences: accountMeta.find(a => a.id === user.id)?.metadata?.preferences,
        projects: map(projectMeta), accounts: map(accountMeta), companies: map(companyMeta), selections };
}));
router.post("/workspace/preferences", endpoint(null, async (db, user, req) => {
    if (!Array.isArray(req.body.muted) || req.body.muted.length > 4 || req.body.muted.some(t => !["request", "approval", "progress", "notice"].includes(t)))
        throw new HttpError(400, "Invalid notification preferences.");
    return updateNotificationPreferences(db, user.id, { muted: [...new Set(req.body.muted)] });
}));
router.put("/workspace/settings", endpoint(["admin"], async (db, user, req) => {
    // Merge, so settings this screen does not send (such as the reminder days) are kept.
    const current = (await db.query("select rules from workspace_settings where singleton")).rows[0]?.rules || {};
    const rules = { ...current, ...req.body };
    for (const k of ["grace", "cap", "response", "idle"])
        if (!Number.isInteger(rules[k]) || rules[k] < 1 || rules[k] > 365)
            throw new HttpError(400, "Invalid rule value.");
    if (rules.reminderDays !== undefined && (!Array.isArray(rules.reminderDays) || !rules.reminderDays.length || rules.reminderDays.length > 12
        || rules.reminderDays.some(d => !Number.isInteger(d) || d < 0 || d > 365)))
        throw new HttpError(400, "Reminder days must be whole numbers from 0 to 365.");
    await db.query("update workspace_settings set rules=$1 where singleton", [JSON.stringify(rules)]);
    await event(db, user, null, "Workspace rules updated");
    return rules;
}));
router.get("/notifications", endpoint(null, async (db, user, req) => {
    await sweepLicensesIfDue(db);
    const { limit, offset } = paging(req, 100);
    return (await db.query(`select a.*,t.code as type,n.is_read from activity_log a join activity_types t on t.id=a.activity_type_id
 left join notification_recipients n on n.activity_log_id=a.id and n.recipient_user_id=$1
 where ($2='admin' or n.recipient_user_id=$1) order by a.id desc limit $3 offset $4`, [user.id, user.role, limit, offset])).rows;
}));
router.post("/notifications/read", endpoint(null, async (db, user, req) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length > 2000 || ids.some(id => typeof id !== "string" || !/^(\d{1,18}|client-history:[0-9a-f-]{36}:\d{1,18})$/i.test(id)))
        throw new HttpError(400, "Invalid notification IDs.");
    const activityIds = ids.filter(id => /^\d+$/.test(id));
    if (user.role === "admin")
        await db.query("insert into notification_recipients(activity_log_id,recipient_user_id) select id,$1 from activity_log where id=any($2::bigint[]) on conflict do nothing", [user.id, activityIds]);
    const read = (await db.query("update notification_recipients set is_read=true,read_at=now() where recipient_user_id=$1 and activity_log_id=any($2::bigint[]) returning activity_log_id", [user.id, activityIds])).rows.map(row => String(row.activity_log_id));
    await mirrorLegacyReads(db, user.id, read);
    const noticeIds = ids.filter(id => id.startsWith("client-history:"));
    if (user.role === "client" && noticeIds.length) {
        const allowed = (await db.query(`select h.id,h.project_id from project_progress_history h
 join projects p on p.id=h.project_id join user_client_project_links l on l.project_id=p.id
 where l.user_id=$1 and h.is_client_visible and p.lifecycle_status in ('active','archived')
 and not coalesce(p.is_deleted,false) and h.id=any($2::bigint[])`, [user.id, noticeIds.map(id => id.split(":")[2])])).rows;
        const accepted = allowed.map(row => `client-history:${row.project_id}:${row.id}`).filter(id => noticeIds.includes(id));
        await updateNotificationPreferences(db, user.id, { readNoticeIds: accepted });
        read.push(...accepted);
    }
    return { ids: read };
}));
router.post("/files", requireLogin, parseUpload, endpoint(["admin", "opm", "spm"], async (db, user, req) => {
    const f = req.file;
    if (!f || !isUuid(req.body.id))
        throw new HttpError(400, "A file and UUID are required.");
    const purpose = req.body.purpose || "document";
    if (purpose === "manpower" && !["admin", "spm"].includes(user.role))
        throw new HttpError(403, "Only subcontractor manpower-list uploads accept Excel files.");
    const contentType = await validateUpload(f, purpose);
    const manpowerCount = purpose === "manpower" ? readManpowerFile(f).length : undefined;
    await db.query(`insert into stored_files(id,user_id,purpose,original_name,content_type,byte_size,content,uploaded_by)
 values($1,$2,$7,$3,$4,$5,$6,$2)`, [req.body.id, user.id, f.originalname, contentType, f.size, f.buffer, purpose === "manpower" ? "manpower" : "upload"]);
    return { id: req.body.id, download_url: "/api/v1/files/" + req.body.id + "/content", ...(manpowerCount !== undefined ? { manpowerCount } : {}) };
}));
router.post("/subcontractors/registrations", endpoint(["spm"], async (db, user, req) => {
    if (user.role === "spm") await assertLicenseActive(user, db);
    const saved = await registerCompany(db, user, req.body, file);
    await event(db, user, null, user.role === "spm" ? "Subcontractor company suggestion submitted" : "Subcontractor company added", req.body.name);
    return saved;
}));
router.post("/subcontractors/:id/withdraw", endpoint(["spm"], async (db, user, req) => {
    await assertLicenseActive(user, db);
    const found = await withdrawCompanyRequest(db, user, req.params.id);
    await event(db, user, null, "Pending subcontractor request archived", found.company_name);
    return {};
}));
router.get("/files/:id/content", async (req, res) => {
    try {
        const user = await requireUser(req, res);
        if (!user)
            return;
        if (!isUuid(req.params.id))
            throw new HttpError(400, "Invalid file ID.");
        let row;
        await withTransaction(async (db) => {
            row = (await db.query("select * from stored_files where id=$1", [req.params.id])).rows[0];
            if (!row)
                throw new HttpError(404, "File not found.");
            if (user.role !== "admin" && row.uploaded_by !== user.id && row.user_id !== user.id) {
                const companyRecord = row.purpose === "company" && ["spm", "opm"].includes(user.role) && (await db.query(`select 1
                    from workspace_company_metadata m join subcontractors s on s.id=m.subcontractor_id
                    where s.directory_status='approved' and not coalesce(s.is_deleted,false)
                    and exists(select 1 from jsonb_array_elements(coalesce(m.metadata->'documents','[]'::jsonb)) d
                        where d->>'id'=$1 and d->>'uploaded'='true') limit 1`, [row.id])).rowCount > 0;
                if (companyRecord) return;
                if (!row.project_id)
                    throw new HttpError(404, "File not found.");
                await project(db, user, row.project_id);
                if (user.role === "client") {
                    const visible = await db.query(`select 1 from project_documents d join document_types t on t.id=d.document_type_id
       where d.project_id=$1 and (d.file_ref=$2 or d.file_ref=replace($2,'db://','db:')) and t.is_client_visible_default
       union all select 1 from project_photos where project_id=$1 and (file_ref=$2 or file_ref=replace($2,'db://','db:')) and is_client_visible`, [row.project_id, "db://" + row.id]);
                    if (!visible.rowCount)
                        throw new HttpError(404, "File not found.");
                }
            }
        });
        res.type(row.content_type).set("Cache-Control", "private, no-store");
        res.set("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(row.original_name));
        res.send(row.content);
    }
    catch (error) {
        handleError(res, error);
    }
});
router.get("/projects/:id/documents", endpoint(null, async (db, user, req) => {
    const p = await project(db, user, req.params.id);
    const rows = (await db.query(`select d.id,t.code,t.label,t.is_client_visible_default as client_visible,
 d.status='uploaded' as uploaded,d.uploaded_at,f.original_name,f.content_type,f.byte_size,d.file_ref
 from document_types t left join project_documents d on d.document_type_id=t.id and d.project_id=$1
 left join stored_files f on (d.file_ref='db://'||f.id or d.file_ref='db:'||f.id)
 where ($2<>'client' or t.is_client_visible_default) order by t.id`, [p.id, user.role])).rows;
    return rows.map(r => ({ ...r, download_url: r.file_ref?.startsWith("db:") ? "/api/v1/files/" + r.file_ref.replace(/^db:(\/\/)?/, "") + "/content" : null }));
}));
router.get("/projects/:id/photos", endpoint(null, async (db, user, req) => {
    const p = await project(db, user, req.params.id);
    return (await db.query("select * from project_photos where project_id=$1 and ($2<>'client' or is_client_visible) order by created_at", [p.id, user.role])).rows
        .map(r => ({ ...r, client_visible: r.is_client_visible, download_url: r.file_ref?.startsWith("db:") ? "/api/v1/files/" + r.file_ref.replace(/^db:(\/\/)?/, "") + "/content" : null }));
}));
router.get("/projects/:id/contracts", endpoint(["admin", "opm", "spm"], async (db, user, req) => {
    const p = await project(db, user, req.params.id);
    return (await db.query("select * from contracts where project_id=$1", [p.id])).rows;
}));
router.put("/accounts/:id/workspace", endpoint(["admin"], async (db, user, req) => {
    if (!isUuid(req.params.id))
        throw new HttpError(400, "Invalid account ID.");
    const b = req.body;
    if (b.experienceByType !== undefined) {
        const target = (await db.query("select r.code as role from users u join roles r on r.id=u.role_id where u.id=$1 and not coalesce(u.is_deleted,false)", [req.params.id])).rows[0];
        if (!target) throw new HttpError(404, "Account not found.");
        await saveEngineerExperience(db, req.params.id, validateEngineerExperience(b.experienceByType, target.role));
    }
    if (!Array.isArray(b.docs) || b.docs.length > 100)
        throw new HttpError(400, "Invalid account documents.");
    for (const d of b.docs)
        if (d.uploaded) {
            await file(db, user, d.id);
            await db.query("update stored_files set user_id=$2,purpose='account' where id=$1", [d.id, req.params.id]);
        }
    await db.query(`insert into workspace_account_metadata(user_id,metadata) values($1,$2)
 on conflict(user_id) do update set metadata=workspace_account_metadata.metadata||excluded.metadata`, [req.params.id, JSON.stringify({ docs: b.docs, ...(typeof b.lastName === "string" && b.lastName.trim() ? { lastName: b.lastName.trim() } : {}), contactPerson: b.contactPerson || "", assignmentHold: !!b.assignmentHold, ...(b.resignation ? { resignation: b.resignation } : {}), status: b.status === "deactivated" ? "deactivated" : null })]);
    if (Array.isArray(b.certifications)) {
        const types = (await db.query("select id,code from certification_types where code=any($1::text[])", [b.certifications])).rows;
        if (b.certifications.some(c => !types.some(t => t.code === c)))
            throw new HttpError(400, "Unknown certification.");
        await db.query("delete from user_certifications where user_id=$1", [req.params.id]);
        for (const type of types)
            await db.query("insert into user_certifications(user_id,certification_type_id) values($1,$2)", [req.params.id, type.id]);
    }
    if (b.license && b.expiry) {
        const doc = b.docs.find(d => d.label === "PRC License" && d.uploaded);
        const previous = (await db.query("select license_number,license_expiry::text,upload_file_ref from user_licenses where user_id=$1 and superseded_at is null order by created_at desc limit 1", [req.params.id])).rows[0];
        if (previous?.license_number === b.license && previous.license_expiry === b.expiry && (!doc || previous.upload_file_ref?.replace(/^db:(\/\/)?/, "") === doc.id))
            return {};
        await db.query("update user_licenses set superseded_at=now() where user_id=$1 and superseded_at is null", [req.params.id]);
        await db.query(`insert into user_licenses(user_id,license_number,license_expiry,upload_file_ref,upload_status,created_by)
 values($1,$2,$3,$4,$5,$6)`, [req.params.id, b.license, b.expiry, doc ? "db://" + doc.id : null, doc ? "uploaded" : "pending", user.id]);
        await sweepLicenses(db, { userId: req.params.id });
    }
    return {};
}));
router.put("/subcontractors/:id/workspace", endpoint(["admin"], async (db, user, req) => {
    const b = req.body;
    if (!isUuid(req.params.id))
        throw new HttpError(400, "Invalid company ID.");
    if (!(await db.query("select id from subcontractors where id=$1 for update", [req.params.id])).rowCount) throw new HttpError(404, "Company not found.");
    const previous = (await db.query("select metadata from workspace_company_metadata where subcontractor_id=$1", [req.params.id])).rows[0]?.metadata || {};
    if (b.foremen !== undefined) {
        const errors = companyRegistrationErrors(b);
        if (Object.keys(errors).length) throw new HttpError(400, Object.values(errors)[0]);
    }
    const foremen = b.foremen === undefined ? previous.foremen : normalizeCompanyForemen(b);
    for (const [d, purpose] of [...(b.documents || []).map(d => [d, "document"]), ...(b.manpowerDocuments || []).map(d => [d, "manpower"])])
        if (d.uploaded) {
            await file(db, user, d.id, purpose);
            await db.query("update stored_files set purpose='company' where id=$1", [d.id]);
        }
    const status = { approved: "approved", pending: "pending", rejected: "declined", archived: "archived" }[b.status];
    if (!status)
        throw new HttpError(400, "Invalid directory status.");
    await db.query("update subcontractors set company_name=$2,contact_email=$3,directory_status=$4,committed_until=$5 where id=$1", [req.params.id, b.name, b.email || null, status, b.committedUntil || null]);
    await db.query(`insert into workspace_company_metadata(subcontractor_id,metadata) values($1,$2)
 on conflict(subcontractor_id) do update set metadata=workspace_company_metadata.metadata||excluded.metadata`, [req.params.id, JSON.stringify({
            contact: foremen?.[0]?.name ?? (b.contact || ""), phone: foremen?.[0]?.phone ?? (b.phone || ""),
            ...(foremen === undefined ? {} : { foremen }), documents: b.documents || [], manpowerDocuments: b.manpowerDocuments || [], note: b.note || "", availability: b.availability, manpowerCount: b.manpowerCount
        })]);
    return {};
}));
router.put("/subcontractors/:id/capabilities", endpoint(["spm"], async (db, user, req) => {
    if (!isUuid(req.params.id) || !(await db.query("select 1 from subcontractors where id=$1 and not coalesce(is_deleted,false)", [req.params.id])).rowCount)
        throw new HttpError(404, "Company not found.");
    const review = await saveCapabilityReview(db, user, req.params.id, req.body);
    await event(db, user, null, "Company capabilities reviewed", req.params.id + ": " + review.disciplines.join(", "));
    return review;
}));
router.post("/subcontractors/:id/supporting-documents", endpoint(["spm"], async (db, user, req) => {
    if (!isUuid(req.params.id)) throw new HttpError(400, "Invalid company ID.");
    const company = (await db.query("select directory_status from subcontractors where id=$1 and not coalesce(is_deleted,false) for update", [req.params.id])).rows[0];
    const metadata = (await db.query("select metadata from workspace_company_metadata where subcontractor_id=$1", [req.params.id])).rows[0]?.metadata || {};
    if (!company || (company.directory_status !== "approved" && !(company.directory_status === "pending" && metadata.submittedById === user.id)))
        throw new HttpError(404, "Approved company or your pending company request not found.");
    if (!isUuid(req.body.doc?.id)) throw new HttpError(400, "Upload and confirm a supporting company document first.");
    const existing = metadata.documents?.find(document => document.id === req.body.doc.id);
    if (existing) return existing;
    const stored = await file(db, user, req.body.doc.id);
    const locked = (await db.query("select purpose,project_id,user_id from stored_files where id=$1 for update", [stored.id])).rows[0];
    if (locked.purpose !== "upload" || locked.project_id) throw new HttpError(409, "This file is already linked to another record. Upload a new supporting document.");
    if ((metadata.documents || []).length >= 20) throw new HttpError(400, "Use 20 supporting documents or fewer.");
    const document = { id: stored.id, label: "Company supporting document", name: stored.original_name, uploaded: true, clientVisible: false,
        owner: user.full_name, date: new Date().toISOString().slice(0,10), size: stored.byte_size, mime: stored.content_type };
    metadata.documents = [...(metadata.documents || []), document];
    await db.query("insert into workspace_company_metadata(subcontractor_id,metadata) values($1,$2) on conflict(subcontractor_id) do update set metadata=excluded.metadata", [req.params.id, JSON.stringify(metadata)]);
    await db.query("update stored_files set purpose='company' where id=$1", [stored.id]);
    await event(db, user, null, "Company supporting document added", req.params.id + ": " + document.name);
    return document;
}));
router.put("/projects/:id/workspace", endpoint(["admin"], async (db, user, req) => {
    const p = await project(db, user, req.params.id, true), b = req.body;
    if (b.phaseScope !== undefined) {
        let matches = false;
        try { matches = !!p.phase_scope && JSON.stringify(normalizeMixedUseScope(b.phaseScope)) === JSON.stringify(normalizeMixedUseScope(p.phase_scope)); } catch { /* Invalid scope cannot amend the saved workflow. */ }
        if (!matches) throw new HttpError(409, "Project scope is locked after submission. Scope cannot be changed through workspace edits.");
    }
    const previous = (await db.query("select metadata from workspace_project_metadata where project_id=$1", [p.id])).rows[0]?.metadata || {};
    let clientSubconCompany = previous.clientSubconCompany;
    if (b.clientSubconCompany !== undefined) {
        try { clientSubconCompany = normalizeClientCompany(b.clientSubconCompany); }
        catch (error) { throw new HttpError(400, error.message); }
        if (previous.clientSubconCompany && JSON.stringify(clientSubconCompany) !== JSON.stringify(normalizeClientCompany(previous.clientSubconCompany)))
            throw new HttpError(409, "The client subcontractor company is locked after submission.");
    }
    const unchangedHistoricalLocation = b.siteLocation && previous.siteLocation && ["region", "province", "city", "psgcCode", "coordinates"].every(key => JSON.stringify(b.siteLocation[key]) === JSON.stringify(previous.siteLocation[key]));
    const siteLocation = b.siteLocation !== undefined && !locationError(b.siteLocation) ? normalizeLocation(b.siteLocation) : undefined;
    if (b.siteLocation !== undefined) {
        if (!siteLocation && !unchangedHistoricalLocation) throw new HttpError(400, locationError(b.siteLocation));
        if (siteLocation && !sameLocationRecord(previous.siteLocation, siteLocation)) {
            if (["active", "archived"].includes(p.lifecycle_status) || (await db.query("select 1 from project_subcontractor_selections where project_id=$1 and status in ('contacted','accepted')", [p.id])).rowCount)
                throw new HttpError(409, "Project site location is locked after contact or acceptance and on active projects.");
            if (previous.subcontractorAllocation) throw new HttpError(409, "A saved allocation already uses this site location. Resolve the allocation before changing location.");
        }
    }
    for (const d of [...(b.docs || []), ...(clientSubconCompany?.documents || [])])
        if (d.uploaded && !(await db.query("select 1 from project_documents where project_id=$1 and id=$2", [p.id, d.id])).rowCount) {
            await file(db, user, d.id);
            await linkProjectFile(db, p.id, d.id);
        }
    await db.query("update projects set target_end_date=$2,location=$3 where id=$1", [p.id, b.end || null, b.location || ""]);
    await db.query(`insert into workspace_project_metadata(project_id,metadata) values($1,$2)
 on conflict(project_id) do update set metadata=workspace_project_metadata.metadata||excluded.metadata`, [p.id, JSON.stringify({ ...(siteLocation === undefined ? {} : { siteLocation }), ...(clientSubconCompany ? { clientSubconCompany } : {}), clientSubcon: clientSubconCompany?.name || b.clientSubcon || "", clientSubconEmail: clientSubconCompany?.email || b.clientSubconEmail || "", note: b.note || "", extraDocs: (b.docs || []).filter(d => d.label === "Client & Subcontractor Agreement" || d.subjectId) })]);
    for (const d of b.docs || [])
        if (d.uploaded) {
            const code = d.label === "Client Contract Agreement" ? "owner_contract" : null;
            if (code && !(await db.query("select 1 from project_documents where project_id=$1 and id=$2", [p.id, d.id])).rowCount)
                await linkDocument(db, user, p, code, d.id);
        }
    return {};
}));
router.post("/projects/:id/workspace-command", endpoint(["admin", "opm", "spm"], async (db, user, req) => {
    const p = await project(db, user, req.params.id, true), c = req.body;
    const lead = (await db.query("select spm_user_id from project_phase_team where project_id=$1 and is_lead order by project_stage_id limit 1", [p.id])).rows[0]?.spm_user_id;
    const opm = () => { if (user.role !== "opm" || p.suggested_opm_id !== user.id)
        throw new HttpError(403, "Only the assigned Office PM can do this."); };
    const leader = () => { if (user.role !== "spm" || lead !== user.id)
        throw new HttpError(403, "Only the Lead Site PM can do this."); };
    const meta = (await db.query("select metadata from workspace_project_metadata where project_id=$1", [p.id])).rows[0]?.metadata || {};
    if (LICENSE_COMMANDS.has(c.type))
        await assertLicenseActive(user, db);
    switch (c.type) {
        case "upload_registered": {
            opm();
            if (!["spm_review", "active"].includes(p.lifecycle_status))
                throw new HttpError(409, "Accept the project first.");
            if (!Number.isInteger(c.docIndex) || c.docIndex < 0 || c.docIndex > 5)
                throw new HttpError(400, "Invalid document index.");
            const existing = await db.query("select 1 from project_documents d join document_types t on t.id=d.document_type_id where d.project_id=$1 and t.code=$2 and d.status='uploaded'", [p.id, codes[c.docIndex]]);
            if (existing.rowCount)
                throw new HttpError(409, "The registered document is already uploaded.");
            await linkDocument(db, user, p, codes[c.docIndex], c.doc?.id);
            break;
        }
        case "contact_company": {
            leader();
            if (meta.clientSubcon) throw new HttpError(409, "This project has a locked client-provided subcontractor.");
            if (usesTradeAllocation(p, meta)) { await allocationCommand(db, p, meta, user, c); break; }
            const current = (await db.query("select * from project_subcontractor_selections where project_id=$1 and status in ('contacted','accepted')", [p.id])).rows[0];
            if (current)
                throw new HttpError(409, "This project already has a subcontractor in progress.");
            const company = (await db.query("select id from subcontractors where id=$1 and directory_status='approved' and not coalesce(is_deleted,false)", [c.companyId])).rows[0];
            if (!company)
                throw new HttpError(422, "Choose an approved company.");
            const old = (await db.query("select status from project_subcontractor_selections where project_id=$1 and subcontractor_id=$2", [p.id, c.companyId])).rows[0];
            if (old?.status === "declined")
                throw new HttpError(409, "This company already declined.");
            await db.query(`insert into project_subcontractor_selections(project_id,subcontractor_id,status,contacted_at)
 values($1,$2,'contacted',now()) on conflict(project_id,subcontractor_id) do update set status='contacted',contacted_at=now()`, [p.id, c.companyId]);
            break;
        }
        case "respond_company": {
            leader();
            if (meta.clientSubcon) throw new HttpError(409, "This project has a locked client-provided subcontractor.");
            if (usesTradeAllocation(p, meta)) { await allocationCommand(db, p, meta, user, c); break; }
            if (typeof c.accepted !== "boolean")
                throw new HttpError(400, "An explicit company response is required.");
            if (c.accepted) {
                await db.query("select id from subcontractors where id=$1 order by id for update", [c.companyId]);
                const count = (await db.query(`select count(*)::int as n from (${COMMITMENTS_SQL}) x join projects p on p.id=x.project_id
                    where x.subcontractor_id=$1 and p.id<>$2 and not coalesce(p.is_deleted,false) and p.lifecycle_status<>'archived'`, [c.companyId, p.id])).rows[0].n;
                if (count >= 2) throw new HttpError(409, "This company already has two project commitments.");
            }
            const changed = await db.query("update project_subcontractor_selections set status=$3,responded_at=now() where project_id=$1 and subcontractor_id=$2 and status='contacted' returning *", [p.id, c.companyId, c.accepted ? "accepted" : "declined"]);
            if (!changed.rowCount)
                throw new HttpError(409, "Contact this company before recording its response.");
            break;
        }
        case "archive_company": {
            leader();
            if (usesTradeAllocation(p, meta)) throw new HttpError(409, "Use the allocation plan to replace an uncontacted or declined company.");
            const removed = await db.query("update project_subcontractor_selections set status='archived' where project_id=$1 and subcontractor_id=$2 and status='proposed' returning *", [p.id, c.companyId]);
            if (!removed.rowCount)
                throw new HttpError(409, "A contacted or accepted company cannot be archived.");
            break;
        }
        case "save_allocation_plan":
        case "set_allocation_location":
        case "auto_allocate_company":
        case "release_allocation_company":
            leader();
            await allocationCommand(db, p, meta, user, c);
            break;
        case "acknowledge_client_subcon":
            leader();
            if (!meta.clientSubcon || (!meta.clientSubconCompany && !meta.extraDocs?.some(d => d.label === "Client & Subcontractor Agreement")) || meta.clientSubconReview?.issues?.some(i => i.status === "open"))
                throw new HttpError(409, "Client company details must be available and open issues resolved.");
            meta.clientSubconReview = { issues: [], ...meta.clientSubconReview, acknowledgedById: user.id, acknowledgedBy: user.full_name, acknowledgedAt: new Date().toISOString() };
            break;
        case "report_client_subcon_issue":
            leader();
            if (!c.note?.trim())
                throw new HttpError(400, "Describe the issue.");
            meta.clientSubconReview = { ...meta.clientSubconReview, issues: [...(meta.clientSubconReview?.issues || []), { id: crypto.randomUUID(), text: c.note, status: "open", byId: user.id, by: user.full_name, at: new Date().toISOString() }] };
            break;
        case "resolve_client_subcon_issue": {
            if (user.role !== "admin")
                throw new HttpError(403, "Administrator access required.");
            const issue = meta.clientSubconReview?.issues?.find(i => i.id === c.issueId && i.status === "open");
            if (!issue)
                throw new HttpError(409, "Issue is no longer open.");
            if (!c.note?.trim())
                throw new HttpError(400, "A resolution is required.");
            Object.assign(issue, { status: "resolved", resolution: c.note, resolvedBy: user.id, resolvedAt: new Date().toISOString() });
            break;
        }
        case "activate_project":
        case "upload_agreement": {
            leader();
            if (p.lifecycle_status !== "spm_review")
                throw new HttpError(409, "Only an intake under Site PM review can be activated.");
            if (c.type === "upload_agreement")
                await linkDocument(db, user, p, "subcontractor_agreement", c.doc?.id);
            else if (!meta.clientSubcon || usesTradeAllocation(p, meta))
                throw new HttpError(409, "Upload the signed subcontractor agreement to activate this project.");
            const client = await db.query("select u.id from user_client_project_links l join users u on u.id=l.user_id join roles r on r.id=u.role_id where l.project_id=$1 and r.code='client' and u.status in ('active','invited') and not coalesce(u.is_deleted,false)", [p.id]);
            if (client.rowCount !== 1)
                throw new HttpError(409, "The assigned client must be active or awaiting first login.");
            // Assignment and activation happen only after the database validates prerequisites.
            const required = await db.query("select count(*)::int as n from project_documents d join document_types t on t.id=d.document_type_id where d.project_id=$1 and d.status='uploaded' and t.code=any($2::text[])", [p.id, codes.slice(0, 6)]);
            const team = await db.query("select 1 from project_phase_team where project_id=$1 and status<>'confirmed'", [p.id]);
            if (required.rows[0].n !== 6 || team.rowCount || !(await db.query("select 1 from project_phase_team where project_id=$1", [p.id])).rowCount)
                throw new HttpError(409, "All six documents and team confirmations are required.");
            const selected = (await db.query("select s.*,c.trade_id from project_subcontractor_selections s join subcontractors c on c.id=s.subcontractor_id where s.project_id=$1 and s.status='accepted'", [p.id])).rows[0];
            if (!usesTradeAllocation(p, meta) && meta.clientSubcon && (!meta.clientSubconReview?.acknowledgedAt || meta.clientSubconReview?.issues?.some(i => i.status === "open")))
                throw new HttpError(409, "The client agreement needs acknowledgment with no open issues.");
            if (!selected && !meta.clientSubcon)
                throw new HttpError(409, "A subcontractor must accept before activation.");
            let assigned = 0;
            if (usesTradeAllocation(p, meta)) {
                const ids = await validateAllocationActivation(db, p, meta, c);
                for (const id of ids) await db.query(`insert into project_subcontractor_assignments(project_id,subcontractor_id,trade_id,worker_count,created_by)
                    select $1,id,trade_id,0,$3 from subcontractors where id=$2`, [p.id, id, user.id]);
                assigned = (await db.query("select count(*)::int as n from subcontractor_workers where current_project_id=$1 and availability_status='assigned'", [p.id])).rows[0].n;
            } else if (selected) {
                const workers = await db.query("select id from subcontractor_workers where subcontractor_id=$1 and status='active' and availability_status='available' order by id limit $2 for update", [selected.subcontractor_id, p.crew_required || 0]);
                if (workers.rowCount < (p.crew_required || 0))
                    throw new HttpError(409, "The company has insufficient available workers.");
                assigned = workers.rowCount;
                await db.query("update subcontractor_workers set availability_status='assigned',current_project_id=$2 where id=any($1::uuid[])", [workers.rows.map(w => w.id), p.id]);
                await db.query("insert into project_subcontractor_assignments(project_id,subcontractor_id,trade_id,worker_count) values($1,$2,$3,$4)", [p.id, selected.subcontractor_id, selected.trade_id, workers.rowCount]);
            }
            await snapshotProjectChecklists(db,p.id);
            await db.query(`update projects set lifecycle_status='active',current_stage_id=(select project_stage_id from (${projectWorkflowSql}) w where w.project_id=projects.id order by sort_order limit 1),crew_assigned=$2,updated_at=now() where id=$1`, [p.id, assigned]);
            meta.activation = { byId: user.id, by: user.full_name, at: new Date().toISOString() };
            break;
        }
        case "request_company": {
            leader();
            await registerCompany(db, user, c.company, file, p.id);
            break;
        }
        case "archive_company_request": {
            leader();
            await withdrawCompanyRequest(db, user, c.companyId, p.id);
            break;
        }
        case "add_photo": {
            if (user.role !== "spm")
                throw new HttpError(403, "Only Site PMs can add photos.");
            const f = await file(db, user, c.doc?.id);
            if (!/image\/(png|jpeg)/.test(f.content_type))
                throw new HttpError(400, "Choose a JPG or PNG.");
            await linkProjectFile(db, p.id, f.id, "photo");
            await db.query("insert into project_photos(project_id,file_ref,caption,taken_date,uploaded_by,is_client_visible) values($1,$2,$3,current_date,$4,$5)", [p.id, "db://" + f.id, c.note || "", user.id, false]); // internal until the Office PM or Administrator releases it
            break;
        }
        case "release_photo": {
            if (user.role === "spm" || (user.role === "opm" && p.suggested_opm_id !== user.id))
                throw new HttpError(403, "Only the assigned Office PM or an Administrator can release photos to the client.");
            if (!isUuid(c.photoId))
                throw new HttpError(400, "photoId must be a valid id.");
            const released = await db.query("update project_photos set is_client_visible=true,released_by=$3,released_at=now() where id=$1 and project_id=$2 and not is_client_visible returning id", [c.photoId, p.id, user.id]);
            if (!released.rowCount)
                throw new HttpError(404, "Photo not found or already released.");
            break;
        }
        default: throw new HttpError(400, "Unsupported project command.");
    }
    await db.query("insert into workspace_project_metadata(project_id,metadata) values($1,$2) on conflict(project_id) do update set metadata=excluded.metadata", [p.id, JSON.stringify(meta)]);
    await event(db, user, p, c.type.replaceAll("_", " "), c.note || "");
    return { project_id: p.id };
}));
router.post("/accounts/:id/resignation", endpoint(["admin"], async (db, user, req) => {
    const b = req.body;
    if (!isUuid(req.params.id) || req.params.id === user.id)
        throw new HttpError(422, "Select another employee account.");
    if (!Number.isInteger(b.noticeDays) || b.noticeDays < 0 || b.noticeDays > 180)
        throw new HttpError(400, "Notice period must be from 0 to 180 days.");
    const target = (await db.query("select u.id,u.full_name,r.code as role,u.status from users u join roles r on r.id=u.role_id where u.id=$1 and not coalesce(u.is_deleted,false) for update of u", [req.params.id])).rows[0];
    if (!target || target.role === "client" || target.status !== "active")
        throw new HttpError(422, "Select an active employee.");
    const active = await db.query(`select 1 from projects p where p.lifecycle_status='active' and not coalesce(p.is_deleted,false)
 and (p.suggested_opm_id=$1 or exists(select 1 from project_phase_team t where t.project_id=p.id and t.spm_user_id=$1))`, [target.id]);
    if (active.rowCount)
        throw new HttpError(409, "Active project assignments must be resolved first.");
    const f = await file(db, user, b.letter?.id);
    const metadata = (await db.query("select metadata from workspace_account_metadata where user_id=$1", [target.id])).rows[0]?.metadata || {};
    if (metadata.assignmentHold)
        throw new HttpError(409, "Assignment Hold is already active.");
    const now = new Date().toISOString(), effectiveDate = new Date(Date.now() + b.noticeDays * 86400000).toISOString();
    const letter = { ...b.letter, label: "Resignation Letter", name: f.original_name, uploaded: true, clientVisible: false };
    metadata.docs = [...(metadata.docs || []), letter];
    metadata.assignmentHold = true;
    metadata.resignation = { status: b.noticeDays === 0 ? "deactivated" : "notice", noticeDays: b.noticeDays, submittedAt: now, effectiveDate,
        confirmedById: user.id, confirmedBy: user.full_name, confirmedAt: now, letter, ...(b.noticeDays === 0 ? { deactivatedAt: now } : {}) };
    if (b.noticeDays === 0) {
        metadata.status = "deactivated";
        await db.query("update users set status='suspended',updated_at=now() where id=$1", [target.id]);
        await db.query("delete from users_token where user_id=$1", [target.id]);
    }
    await db.query("insert into workspace_account_metadata(user_id,metadata) values($1,$2) on conflict(user_id) do update set metadata=excluded.metadata", [target.id, JSON.stringify(metadata)]);
    await event(db, user, null, "Employee resignation confirmed", target.full_name);
    return {};
}));
router.use((error, req, res, next) => { if (res.headersSent)
    return next(error); handleError(res, error); });
export default router;
