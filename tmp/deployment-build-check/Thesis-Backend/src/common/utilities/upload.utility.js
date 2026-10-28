import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execute } from './query.utility.js';
import { HttpError, isUuid } from './access.utility.js';

const md5 = data => crypto.createHash('md5').update(data).digest('hex');

const UPLOAD_ROOT = './uploads';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png']);
const DOC_TYPE_PATTERN = /^[a-z0-9_-]{1,40}$/;

const LICENSE_NUMBER_MAX = 120;
const CONTRACT_TEXT_MAX = 150;
const CONTRACT_TYPES = new Set(['client_contract', 'client_subcon_agreement']);

/** Folder name for an upload. Anything outside [a-z0-9_-] (such as "../") falls back to "unknown". */
export const safeDocType = value => {
  const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, '_').toLowerCase() : '';
  return DOC_TYPE_PATTERN.test(normalized) ? normalized : 'unknown';
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = `${UPLOAD_ROOT}/${safeDocType(req.body?.doc_type)}`;
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${md5(safeDocType(req.body?.doc_type) + '_' + Date.now() + '_' + crypto.randomUUID())}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, uniqueName);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_EXTENSIONS.has(path.extname(file.originalname).toLowerCase())) {
      return cb(new HttpError(400, 'Only PDF, JPG and PNG files are accepted.'));
    }
    cb(null, true);
  },
});

const optionalText = (value, label, max) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${label} must be text.`);
  if (value.length > max) throw new HttpError(400, `${label} must be at most ${max} characters.`);
  return value;
};

const optionalIsoDate = (value, label) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `${label} must be a valid date (YYYY-MM-DD).`);
  }
  return value;
};

const requireUuid = (value, label) => {
  if (!isUuid(value)) throw new HttpError(400, `${label} must be a valid id.`);
  return value;
};

const requireActor = actorId => {
  if (!isUuid(actorId)) throw new HttpError(401, 'Missing or invalid token.');
  return actorId;
};

/** Builds "col = $n" assignments from a fixed column list. Values are always bound parameters. */
const assignments = () => {
  const columns = [];
  const params = [];
  return {
    set(column, value) {
      params.push(value);
      columns.push(`${column} = $${params.length}`);
    },
    raw(expression) {
      columns.push(expression);
    },
    finish(idValue) {
      params.push(idValue);
      return { setClause: columns.join(', '), params, idPlaceholder: `$${params.length}` };
    },
  };
};

export const uploadAttachment = async (
  file,
  type,
  data,
  method,
  created_by
) => {
  if (type === 'license') {
    return await uploadLicense(file, data, method, created_by);
  }
  else if (type === 'contracts') {
    return await uploadContract(file, data, method, created_by);
  }
}

const uploadLicense = async (
  file,
  data,
  method,
  created_by
) => {
  const actor = requireActor(created_by);

  if (method === 'create') {
    const userId = requireUuid(data.user_id, 'user_id');
    const licenseNumber = optionalText(data.license_number, 'license_number', LICENSE_NUMBER_MAX) ?? null;
    const licenseExpiry = optionalIsoDate(data.license_expiry, 'license_expiry') ?? null;

    await execute(
      `
          UPDATE user_licenses SET superseded_at = NOW(), updated_by = $2, updated_at = NOW() WHERE user_id = $1
        `,
      [
        userId,
        actor
      ]
    );
    const result = await execute(
      `
        INSERT INTO user_licenses (
          user_id,
          license_number,
          license_expiry,
          upload_file_ref,
          upload_status,
          superseded_at,
          created_by,
          created_at,
          updated_by,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          NULL,
          $6,
          NOW(),
          $7,
          NOW()
        ) RETURNING id
      `,
      [
        userId,
        licenseNumber,
        licenseExpiry,
        file ? file.path : null,
        file ? 'uploaded' : 'pending',
        actor,
        actor
      ]
    );

    return result.rows[0].id;
  }
  else if (method === 'update') {
    const id = requireUuid(data.id, 'License id');
    const licenseNumber = optionalText(data.license_number, 'license_number', LICENSE_NUMBER_MAX);
    const licenseExpiry = optionalIsoDate(data.license_expiry, 'license_expiry');

    const update = assignments();
    if (licenseNumber !== undefined) update.set('license_number', licenseNumber);
    if (licenseExpiry !== undefined) update.set('license_expiry', licenseExpiry);
    if (file) {
      update.set('upload_file_ref', file.path);
      update.set('upload_status', 'uploaded');
    }
    update.set('updated_by', actor);
    update.raw('updated_at = NOW()');

    const { setClause, params, idPlaceholder } = update.finish(id);
    const result = await execute(
      `UPDATE user_licenses SET ${setClause} WHERE id = ${idPlaceholder} RETURNING id`,
      params
    );
    if (result.rowCount === 0) throw new HttpError(404, 'License not found.');

    return id;
  }
}


const uploadContract = async (
  file,
  data,
  method,
  created_by
) => {
  const actor = requireActor(created_by);

  if (method === 'create') {
    const projectId = requireUuid(data.project_id, 'project_id');
    if (!CONTRACT_TYPES.has(data.contract_type)) throw new HttpError(400, 'contract_type is not recognized.');
    const subcontractorName = optionalText(data.subcontractor_name, 'subcontractor_name', CONTRACT_TEXT_MAX) ?? null;
    const tradeScope = optionalText(data.trade_scope, 'trade_scope', CONTRACT_TEXT_MAX) ?? null;
    if (!file) throw new HttpError(400, 'A contract file is required.');

    await execute(
      `
          DELETE FROM contracts WHERE project_id = $1 AND contract_type = $2
        `,
      [
        projectId,
        data.contract_type
      ]
    );
    const result = await execute(
      `
        INSERT INTO contracts (
          project_id,
          contract_type,
          subcontractor_name,
          trade_scope,
          file_ref,
          uploaded_by,
          uploaded_at,
          created_by,
          created_at,
          updated_by,
          updated_at
        ) VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          NOW(),
          $7,
          NOW(),
          $7,
          NOW()
        ) RETURNING id
      `,
      [
        projectId,
        data.contract_type,
        subcontractorName,
        tradeScope,
        file.path,
        actor,
        actor
      ]
    );

    return result.rows[0].id;
  }
  else if (method === 'update') {
    const id = requireUuid(data.id, 'Contract id');
    if (data.contract_type !== undefined && data.contract_type !== null && data.contract_type !== ''
      && !CONTRACT_TYPES.has(data.contract_type)) {
      throw new HttpError(400, 'contract_type is not recognized.');
    }
    const subcontractorName = optionalText(data.subcontractor_name, 'subcontractor_name', CONTRACT_TEXT_MAX);
    const tradeScope = optionalText(data.trade_scope, 'trade_scope', CONTRACT_TEXT_MAX);

    const update = assignments();
    if (data.contract_type) update.set('contract_type', data.contract_type);
    if (subcontractorName !== undefined) update.set('subcontractor_name', subcontractorName);
    if (tradeScope !== undefined) update.set('trade_scope', tradeScope);
    if (file) {
      update.set('file_ref', file.path);
      update.set('uploaded_by', actor);
      update.raw('uploaded_at = NOW()');
    }
    update.set('updated_by', actor);
    update.raw('updated_at = NOW()');

    const { setClause, params, idPlaceholder } = update.finish(id);
    const result = await execute(
      `UPDATE contracts SET ${setClause} WHERE id = ${idPlaceholder} RETURNING id`,
      params
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Contract not found.');

    return id;
  }
}
