
import { errorlog } from "../../common/utilities/logger.utility.js";
import execute from "../../common/utilities/query.utility.js";
import { responseOk, responseError } from "../../common/utilities/response.utility.js";
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from "../../common/utilities/auth.utility.js";
import { mapMultiple, mapSingle } from "../../common/utilities/dao.utility.js";
import { uploadAttachment } from "../../common/utilities/upload.utility.js";
import { handleError, isUuid } from "../../common/utilities/access.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";

export const getCertifications = async (req, res) => {
  try {
    const queryParams = [];
    const whereConditions = ['uc.user_id IS NOT NULL'];

    // 1. Parameterized Filtering
    
    if (req.query.certification_ids) {
      const certificationIds = req.query.certification_ids.split(',').map((id) => id.trim());
      queryParams.push(certificationIds);
      whereConditions.push(`uc.certification_type_id = ANY($${queryParams.length})`);
    }

    if (req.query.user_ids) {
      const userIds = req.query.user_ids.split(',').map((id) => id.trim());
      queryParams.push(userIds);
      whereConditions.push(`uc.user_id = ANY($${queryParams.length})`);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // 2. Safe Sorting
    const sortOrder = String(req.query.sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    let sortClause = `ORDER BY uc.created_at ${sortOrder}`;

    switch (req.query.sortBy) {
      case 'license_expiry':
        sortClause = `ORDER BY uc.license_expiry ${sortOrder}, uc.created_at ASC`;
        break;
      default:
        break;
    }

    // 3. Safe Pagination
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 10);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    // 4. Combined Multi-Statement Query (2 Queries total instead of N+1)
    // Build the count query
    const countQuery = `
      SELECT COUNT(*) AS count
      FROM user_certifications uc
      ${whereClause};
    `;

    // Build the data query (needs limit & offset parameters)
    const dataQueryParams = [...queryParams, limit, offset];
    const limitParamIdx = dataQueryParams.length - 1;
    const offsetParamIdx = dataQueryParams.length;

    const dataQuery = `
      SELECT
        gen_random_uuid() AS "MAIN.id",
        uc.user_id AS "MAIN.user_id",
        uc.certification_type_id AS "MAIN.certification_id",
        c.code AS "MAIN.certification_code",
        uc.created_at AS "MAIN.created_at",
        uc.updated_at AS "MAIN.updated_at",
        uc.created_by AS "CREATED_BY.id",
        u1.full_name AS "CREATED_BY.full_name",
        uc.updated_by AS "UPDATED_BY.id",
        u2.full_name AS "UPDATED_BY.full_name"
      FROM user_certifications uc
      LEFT JOIN certification_types c ON c.id = uc.certification_type_id
      LEFT JOIN users u1 ON u1.id = uc.created_by
      LEFT JOIN users u2 ON u2.id = uc.updated_by
      ${whereClause}
      ${sortClause}
      LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx};
    `;

    // Execute both queries concurrently over the same connection pool
    const [countRes, dataRes] = await Promise.all([
      execute(countQuery, queryParams),
      execute(dataQuery, dataQueryParams)
    ]);

    const totalCount = parseInt(countRes.rows[0].count, 10);
    const rows = mapMultiple(dataRes.rows, 'id');

    if (rows.length === 0) {
      return responseOk(res, 'Resources retrieved successfully.', totalCount, []);
    }


    return responseOk(res, 'Resources retrieved successfully.', totalCount, rows);
  } catch (error) {
    console.error(error);
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};

export const getCertificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const details = await getCertification(id);

    if (!details) {
      return responseError(res, 'No user associated with this id.', 400);
    }

    responseOk(res, 'Resource retrieved successfully.', details.length, details);

  } catch (error) {
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};

export const createCertification = async (req, res) => {
  try {
    const created_by = await authenticate(req, res);
    if (!created_by) return responseError(res, 'Missing or invalid token.', 401);

    const { codes, user_id } = req.body || {};
    if (!isUuid(user_id)) return responseError(res, 'user_id must be a valid id.', 400);
    if (!Array.isArray(codes) || codes.length > 50
      || codes.some((code) => typeof code !== 'string' || !code.trim() || code.length > 40)) {
      return responseError(res, 'codes must be a list of up to 50 certification codes.', 400);
    }

    await withTransaction(async (client) => {
      await client.query(`
        DELETE FROM user_certifications WHERE user_id = $1
      `,
      [ user_id ]
    );

    for (const code of codes) {
      await client.query(
        `
          INSERT INTO user_certifications (
            user_id,
            certification_type_id,
            created_by,
            created_at,
            updated_by,
            updated_at
          ) VALUES (
            $1,
            (SELECT id from certification_types where code = $2),
            $3,
            NOW(),
            $3,
            NOW()
          )
        `,
        [
          user_id,
          code,
          created_by
        ]
      );
    }
    });

    const details = await getCertification(user_id);

    responseOk(res, 'Resource created successfully', 1, details);
  } catch (error) {
    return handleError(res, error);
  }
};


export const getCertification = async (userId) => {
  const query = `
    SELECT
      gen_random_uuid() AS "MAIN.id",
      uc.user_id AS "MAIN.user_id",
      uc.certification_type_id AS "MAIN.certification_id",
      c.code AS "MAIN.certification_code",
      uc.created_at AS "MAIN.created_at",
      uc.updated_at AS "MAIN.updated_at",
      uc.created_by AS "CREATED_BY.id",
      u1.full_name AS "CREATED_BY.full_name",
      uc.updated_by AS "UPDATED_BY.id",
      u2.full_name AS "UPDATED_BY.full_name"
    FROM user_certifications uc
    LEFT JOIN certification_types c ON c.id = uc.certification_type_id
    LEFT JOIN users u1 ON u1.id = uc.created_by
    LEFT JOIN users u2 ON u2.id = uc.updated_by
    WHERE uc.user_id = $1;
  `;

  const { rows, rowCount } = await execute(query, [userId]);

  if (rowCount === 0) {
    return null;
  }

  return mapMultiple(rows, 'id');
};