import { errorlog } from "../../common/utilities/logger.utility.js";
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execute } from './query.utility.js';

const md5 = data => crypto.createHash('md5').update(data).digest('hex');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const documentType = req.body.doc_type
      ? req.body.doc_type.trim().replace(/\s+/g, '_').toLowerCase()
      : 'unknown';
    const uploadPath = `./uploads/${documentType}`;
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const documentType = req.body.doc_type
      ? req.body.doc_type.trim().replace(/\s+/g, '_').toLowerCase()
      : 'unknown';
    const uniqueName = `${md5(documentType + '_' + Date.now())}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

export const upload = multer({ storage });

export const uploadAttachment = async (
  file,
  type,
  data,
  method,
  created_by
) => {
  try {
    if (type === 'license') {
      return await uploadLicense(file, data, method, created_by);
    }
    else if (type === 'contracts') {
      return await uploadContract(file, data, method, created_by);
    }
  }
  catch (error) {
    errorlog(error);
  }
}

const uploadLicense = async (
  file,
  data,
  method,
  created_by
) => {
  try {
    if (method === 'create') {
      await execute(
        `
            UPDATE user_licenses SET superseded_at = NOW(), updated_by = $2, updated_at = NOW() WHERE user_id = $1
          `,
        [
          data.user_id,
          created_by
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
          data.user_id,
          data.license_number,
          data.license_expiry,
          file ? file.path : null,
          file ? 'uploaded' : 'pending',
          created_by,
          created_by
        ]
      );

      return result.rows[0].id;
    }
    else if (method === 'update') {
      const query = `
          UPDATE user_licenses SET
        `;

      const requestBody = [];
      if (data.license_number && data.license_number !== '') {
        requestBody.push(`license_number = '${data.license_number}'`);
      }

      if (data.license_expiry && data.license_expiry !== '') {
        requestBody.push(`license_expiry = '${data.license_expiry}'`);
      }

      if (file) {
        requestBody.push(`upload_file_ref = '${file.path}'`);
        requestBody.push(`upload_status = 'uploaded'`);
      }

      requestBody.push(`updated_by = '${created_by}'`);
      requestBody.push(`updated_at = NOW()`);
      await execute(
        `${query}
            ${requestBody.join(', ')}
            WHERE id = '${data.id}'`
      );

      return data.id;
    }
  }
  catch (error) {
    errorlog(error);
  }
}


const uploadContract = async (
  file,
  data,
  method,
  created_by
) => {
  try {
    if (method === 'create') {
      await execute(
        `
            DELETE FROM contracts WHERE project_id = $1 AND contract_type = $2
          `,
        [
          data.project_id,
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
          data.project_id,
          data.contract_type,
          data.subcontractor_name,
          data.trade_scope,
          file ? file.path : null,
          file ? created_by : null,
          created_by
        ]
      );

      return result.rows[0].id;
    }
    else if (method === 'update') {
      const query = `
          UPDATE contracts SET
        `;

      const requestBody = [];
      if (data.contract_type && data.contract_type !== '') {
        requestBody.push(`contract_type = '${data.contract_type}'`);
      }

      if (data.subcontractor_name && data.subcontractor_name !== '') {
        requestBody.push(`subcontractor_name = '${data.subcontractor_name}'`);
      }

      if (data.trade_scope && data.trade_scope !== '') {
        requestBody.push(`trade_scope = '${data.trade_scope}'`);
      }

      if (file) {
        requestBody.push(`file_ref = '${file.path}'`);
        requestBody.push(`uploaded_by = '${created_by}'`);
        requestBody.push(`uploaded_at = NOW()`);
      }

      requestBody.push(`updated_by = '${created_by}'`);
      requestBody.push(`updated_at = NOW()`);
      await execute(
        `${query}
            ${requestBody.join(', ')}
            WHERE id = '${data.id}'`
      );

      return data.id;
    }
  }
  catch (error) {
    errorlog(error);
  }
}