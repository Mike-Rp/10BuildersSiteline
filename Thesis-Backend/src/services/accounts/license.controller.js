import { submitRenewal } from "../licenses/renewal.controller.js";

import { errorlog } from "../../common/utilities/logger.utility.js";
import execute from "../../common/utilities/query.utility.js";
import { responseOk, responseError } from "../../common/utilities/response.utility.js";
import { mapMultiple, mapSingle } from "../../common/utilities/dao.utility.js";
import { isUuid } from "../../common/utilities/access.utility.js";

export const getLicenses = async (req, res) => {
  try {
    const queryParams = [];
    const whereConditions = ['l.id IS NOT NULL'];

    // 1. Parameterized Filtering
    if (req.query.user_ids) {
      const userIds = req.query.user_ids.split(',').map((id) => id.trim());
      queryParams.push(userIds);
      whereConditions.push(`l.user_id = ANY($${queryParams.length})`);
    }

    if (req.query.status) {
      if (req.query.status === 'expired'){
        whereConditions.push(`license_expiry < NOW() - INTERVAL '1 days' `);
      }
      else if (req.query.status === 'active'){
        whereConditions.push(`license_expiry >= NOW() - INTERVAL '1 days' `);
      }
    }

    if (req.query.license_expiry) {
      queryParams.push(req.query.license_expiry);
      whereConditions.push(`license_expiry = $${queryParams.length}`);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // 2. Safe Sorting
    const sortOrder = String(req.query.sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    let sortClause = `ORDER BY l.created_at ${sortOrder}`;

    switch (req.query.sortBy) {
      case 'license_expiry':
        sortClause = `ORDER BY l.license_expiry ${sortOrder}, l.created_at ASC`;
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
      SELECT COUNT(l.id) AS count
      FROM user_licenses l
      ${whereClause};
    `;

    // Build the data query (needs limit & offset parameters)
    const dataQueryParams = [...queryParams, limit, offset];
    const limitParamIdx = dataQueryParams.length - 1;
    const offsetParamIdx = dataQueryParams.length;

    const dataQuery = `
      SELECT
        l.id AS "MAIN.id",
        l.user_id AS "MAIN.user_id",
        l.license_number AS "MAIN.license_number",
        l.profession AS "MAIN.profession",l.verification_status AS "MAIN.verification_status",
        l.license_expiry AS "MAIN.license_expiry",
        CASE 
          WHEN license_expiry < NOW() - INTERVAL '1 days' THEN 'Expired'
          WHEN superseded_at IS NOT NULL THEN 'Superseded'
          WHEN l.verification_status <> 'verified' OR l.profession IS NULL THEN 'Needs review'
          ELSE 'Verified'
        END AS "MAIN.status",
        l.upload_file_ref AS "MAIN.upload_file_ref",
        l.upload_status AS "MAIN.upload_status",
        l.superseded_at AS "MAIN.superseded_at",
        l.created_at AS "MAIN.created_at",
        l.updated_at AS "MAIN.updated_at",
        l.created_by AS "CREATED_BY.id",
        u1.full_name AS "CREATED_BY.full_name",
        l.updated_by AS "UPDATED_BY.id",
        u2.full_name AS "UPDATED_BY.full_name"
      FROM user_licenses l
      LEFT JOIN users u1 ON u1.id = l.created_by
      LEFT JOIN users u2 ON u2.id = l.updated_by
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

export const getLicenseById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return responseError(res, 'Invalid license id.', 400);
    const details = await getLicense(id);

    if (!details) {
      return responseError(res, 'No user associated with this id.', 400);
    }

    responseOk(res, 'Resource retrieved successfully.', 1, details);

  } catch (error) {
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};

export const createLicense = submitRenewal;
// Existing credential records are immutable evidence. Submit a renewal instead.
export const updateLicense = async (req,res) => {
  if(req.file) (await import('node:fs')).unlink(req.file.path,()=>{});
  return responseError(res,"License records cannot be overwritten. Submit a credential for verification through /licenses/renewals.",409);
};

export const getLicense = async (userId) => {
  const query = `
    SELECT
      l.id AS "MAIN.id",
      l.user_id AS "MAIN.user_id",
      l.license_number AS "MAIN.license_number",
        l.profession AS "MAIN.profession",l.verification_status AS "MAIN.verification_status",
      l.license_expiry AS "MAIN.license_expiry",
      CASE 
        WHEN license_expiry < NOW() - INTERVAL '1 days' THEN 'Expired'
        WHEN l.verification_status <> 'verified' OR l.profession IS NULL THEN 'Needs review'
          ELSE 'Verified'
      END AS "MAIN.status",
      l.upload_file_ref AS "MAIN.upload_file_ref",
      l.upload_status AS "MAIN.upload_status",
      l.superseded_at AS "MAIN.superseded_at",
      l.created_at AS "MAIN.created_at",
      l.updated_at AS "MAIN.updated_at",
      l.created_by AS "CREATED_BY.id",
      u1.full_name AS "CREATED_BY.full_name",
      l.updated_by AS "UPDATED_BY.id",
      u2.full_name AS "UPDATED_BY.full_name"
    FROM user_licenses l
    LEFT JOIN users u1 ON u1.id = l.created_by
    LEFT JOIN users u2 ON u2.id = l.updated_by
    WHERE l.id = $1;
  `;

  const { rows, rowCount } = await execute(query, [userId]);

  if (rowCount === 0) {
    return null;
  }

  return mapSingle(rows[0]);
};