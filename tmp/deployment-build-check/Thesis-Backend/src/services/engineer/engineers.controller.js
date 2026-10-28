import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import execute from "../../common/utilities/query.utility.js";
import {
  handleError, sendOk, sendError, requireUser, isUuid, paging,
} from "../../common/utilities/access.utility.js";


const DOCS_PER_ENGINEER = 2;
const LICENSE_SOON_DAYS = 30;
const DOC_TYPES = ["prc_license", "employment_contract"];
const UPLOAD_ROOT = path.resolve("./uploads");
const CONTRACT_ROOT = path.resolve("./uploads/employment-contracts");
const ALLOWED_TYPES = { "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png" };
const ALLOWED_EXTENSIONS = new Set(Object.values(ALLOWED_TYPES));
const FILE_TYPE_LABEL = { ".pdf": "PDF", ".jpg": "JPG", ".jpeg": "JPG", ".png": "PNG" };

const contractDir = (userId) => path.join(CONTRACT_ROOT, userId);

const newestContract = async (userId) => {
  const dir = contractDir(userId);
  let names;
  try {
    names = await fs.promises.readdir(dir);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  let best = null;
  for (const name of names) {
    if (!ALLOWED_EXTENSIONS.has(path.extname(name).toLowerCase())) continue;
    const file = path.join(dir, name);
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) continue;
    if (!best || stat.mtimeMs > best.mtime.getTime() || (stat.mtimeMs === best.mtime.getTime() && file > best.file)) {
      best = { file, mtime: stat.mtime };
    }
  }
  return best;
};

const contractsFor = async (userIds) => {
  let folders;
  try {
    folders = new Set(await fs.promises.readdir(CONTRACT_ROOT));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    folders = new Set();
  }
  const entries = await Promise.all(
    userIds.map(async (id) => [id, folders.has(id) ? await newestContract(id) : null]));
  return new Map(entries);
};

const manilaDate = (date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });  
const baseCte = () => `
WITH staff AS (
  SELECT u.id, u.full_name, u.status, r.code AS role, r.label AS role_label
    FROM users u JOIN roles r ON r.id = u.role_id
   WHERE r.code IN ('admin', 'opm', 'spm') AND COALESCE(u.is_deleted, false) = false
),
lic AS (
  SELECT DISTINCT ON (l.user_id) l.user_id, l.license_number, l.license_expiry, l.upload_file_ref
    FROM user_licenses l
   WHERE l.superseded_at IS NULL
   ORDER BY l.user_id, l.created_at DESC, l.id DESC
),
disc AS (
  SELECT s.user_id, array_agg(d.code::text ORDER BY s.created_at, d.code::text) AS disciplines
    FROM user_discipline_scopes s JOIN disciplines d ON d.id = s.discipline_id
   GROUP BY s.user_id
),
base AS (
  SELECT s.id, s.full_name, s.status, s.role, s.role_label,
         COALESCE(d.disciplines, '{}'::text[]) AS disciplines,
         l.license_number, l.license_expiry::text AS license_expiry, l.upload_file_ref AS license_file,
         CASE WHEN l.user_id IS NULL THEN 'na'
              WHEN l.license_expiry < current_date THEN 'expired'
              WHEN l.license_expiry <= current_date + ${LICENSE_SOON_DAYS} THEN 'expiring_soon'
              ELSE 'valid' END AS license_status
    FROM staff s
    LEFT JOIN lic l ON l.user_id = s.id
    LEFT JOIN disc d ON d.user_id = s.id
)`;

const fileTypeOf = (ref) => (ref ? FILE_TYPE_LABEL[path.extname(String(ref).split("?")[0]).toLowerCase()] ?? null : null);
const firstName = (fullName) => String(fullName).trim().split(/\s+/)[0];
const buildDocuments = (r, contract) => {
  const base = `/accounts/engineers/${r.id}/documents`;
  const licenseUploaded = Boolean(r.license_file);
  return [
    {
      type: "prc_license",
      section_title: "PRC Licensure",
      title: r.license_number ? `PRC License No. ${r.license_number}` : "PRC License",
      subtitle: licenseUploaded
        ? (r.license_expiry ? `Expires ${r.license_expiry}` : "No expiry date on file")
        : "Not yet uploaded",
      status: licenseUploaded ? "uploaded" : "not_uploaded",
      uploaded: licenseUploaded,
      file_type: fileTypeOf(r.license_file),
      license_number: r.license_number ?? null,
      license_expiry: r.license_expiry ?? null,
      license_status: r.license_status,
      download_url: licenseUploaded ? `${base}/prc_license/download` : null,
      can_upload: true, 
    },
    {
      type: "employment_contract",
      section_title: `Employment Contract — between 10 Builders and ${firstName(r.full_name)}`,
      title: "Employment Contract",
      subtitle: contract ? `Uploaded ${manilaDate(contract.mtime)}` : "Not yet uploaded",
      status: contract ? "uploaded" : "not_uploaded",
      uploaded: Boolean(contract),
      file_type: contract ? fileTypeOf(contract.file) : null,
      uploaded_at: contract ? contract.mtime : null,
      download_url: contract ? `${base}/employment_contract/download` : null,
      can_upload: true, 
    },
  ];
};

const LIKE_ESCAPE = /[\\%_]/g;
export const getEngineers = async (req, res) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const { limit, offset } = paging(req, 100, 200);
    const cte = baseCte();

    const params = [];
    let whereClause = "";
    const q = req.query.q === undefined ? "" : String(req.query.q).trim();
    if (q) {
      params.push(`%${q.replace(LIKE_ESCAPE, "\\$&")}%`);
      whereClause = `WHERE (base.full_name ILIKE $1 OR base.role_label ILIKE $1 OR base.role ILIKE $1
                            OR base.license_number ILIKE $1)`;
    }

    const [total, rows, everyone] = await Promise.all([
      execute(`${cte} SELECT count(*)::int AS n FROM base ${whereClause}`, params),
      execute(
        `${cte} SELECT * FROM base ${whereClause}
          ORDER BY CASE base.role WHEN 'admin' THEN 1 WHEN 'opm' THEN 2 ELSE 3 END, base.full_name, base.id
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]),
      execute(`${cte} SELECT id, (license_file IS NOT NULL)::int AS licensed FROM base`),
    ]);
    const contracts = await contractsFor(everyone.rows.map((r) => r.id));
    const licensesUploaded = everyone.rows.reduce((sum, r) => sum + r.licensed, 0);
    const contractsUploaded = [...contracts.values()].filter(Boolean).length;
    const engineerCount = everyone.rows.length;

    const data = rows.rows.map((r) => {
      const contract = contracts.get(r.id) ?? null;
      return {
        id: r.id,
        full_name: r.full_name,
        first_name: firstName(r.full_name),
        role: r.role,
        role_label: r.role_label,
        status: r.status,
        disciplines: r.disciplines,
        subtitle: r.disciplines.length ? `${r.role_label} · ${r.disciplines.join(", ")}` : r.role_label,
        docs_uploaded: (r.license_file ? 1 : 0) + (contract ? 1 : 0),
        docs_total: DOCS_PER_ENGINEER,
        documents: buildDocuments(r, contract),
      };
    });

    return res.status(200).json({
      code: 200,
      message: "Resources retrieved successfully.",
      count: total.rows[0].n,
      data,
      meta: {
        engineers: engineerCount,
        docs_uploaded: licensesUploaded + contractsUploaded,
        docs_total: engineerCount * DOCS_PER_ENGINEER,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const staffMember = (id) =>
  execute(
    `SELECT u.full_name FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND r.code IN ('admin','opm','spm') AND COALESCE(u.is_deleted,false) = false`, [id]);
export const downloadEngineerDocument = async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const { id, documentType } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid engineer id.", 400);
    if (!DOC_TYPES.includes(documentType)) return sendError(res, `documentType must be one of: ${DOC_TYPES.join(", ")}.`, 400);
    if (user.role !== "admin" && user.id !== id) return sendError(res, "Document not found.", 404);

    const person = await staffMember(id);
    if (person.rowCount === 0) return sendError(res, "Document not found.", 404);

    let fileRef = null;
    if (documentType === "prc_license") {
      const r = await execute(
        `SELECT upload_file_ref FROM user_licenses WHERE user_id = $1 AND superseded_at IS NULL
          ORDER BY created_at DESC, id DESC LIMIT 1`, [id]);
      fileRef = r.rows[0]?.upload_file_ref ?? null;
    } else {
      fileRef = (await newestContract(id))?.file ?? null;
    }
    if (!fileRef) return sendError(res, "Document not found.", 404);

    if (/^https?:\/\//i.test(fileRef)) return res.redirect(302, fileRef); 

    const absolute = path.resolve(fileRef);
    if (!absolute.startsWith(UPLOAD_ROOT + path.sep) || !fs.existsSync(absolute)) {
      return sendError(res, "Document not found.", 404);
    }
    const label = documentType === "prc_license" ? "PRC_License" : "Employment_Contract";
    const safeName = `${person.rows[0].full_name.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${label}${path.extname(absolute)}`;
    return res.download(absolute, safeName, (err) => {
      if (err && !res.headersSent) sendError(res, "Document not found.", 404);
    });
  } catch (error) {
    return handleError(res, error);
  }
};


const contractUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = contractDir(req.params.id); 
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + ALLOWED_TYPES[file.mimetype]),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED_TYPES[file.mimetype] ? cb(null, true) : cb(new Error("Only PDF, JPG or PNG files are allowed.")),
});

/**
 * Route middleware, runs BEFORE multer so a rejected request never writes anything to disk:
 * admin only, valid id, and the person must be a staff member.
 */
export const prepareContractUpload = async (req, res, next) => {
  try {
    const user = await requireUser(req, res, ["admin"]);
    if (!user) return;
    const { id } = req.params;
    if (!isUuid(id)) return sendError(res, "Invalid engineer id.", 400);
    if ((await staffMember(id)).rowCount === 0) return sendError(res, "Engineer not found.", 404);
    req.user = user;
    return next();
  } catch (error) {
    return handleError(res, error);
  }
};

export const uploadContractFile = (req, res, next) =>
  contractUpload.single("file")(req, res, (error) => (error ? sendError(res, error.message, 400) : next()));

export const uploadEmploymentContract = async (req, res) => {
  try {
    if (!req.file) return sendError(res, "A file is required (form field: file).", 400);
    const { id } = req.params;
    const contract = await newestContract(id);
    return sendOk(res, "Employment contract saved.", 1, {
      type: "employment_contract",
      title: "Employment Contract",
      subtitle: `Uploaded ${manilaDate(contract.mtime)}`,
      status: "uploaded",
      uploaded: true,
      file_type: fileTypeOf(contract.file),
      uploaded_at: contract.mtime,
      download_url: `/accounts/engineers/${id}/documents/employment_contract/download`,
    }, 201);
  } catch (error) {
    return handleError(res, error);
  }
};