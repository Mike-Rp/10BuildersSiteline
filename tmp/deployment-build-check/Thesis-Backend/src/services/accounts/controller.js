
import { errorlog } from "../../common/utilities/logger.utility.js";
import execute from "../../common/utilities/query.utility.js";
import { responseOk, responseError } from "../../common/utilities/response.utility.js";
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from "../../common/utilities/auth.utility.js";
import { mapMultiple, mapSingle } from "../../common/utilities/dao.utility.js";

export const getUsers = async (req, res) => {
  try {
    const queryParams = [];
    const whereConditions = ['u.id IS NOT NULL'];

    // 1. Parameterized Filtering
    if (req.query.role_ids) {
      const roleIds = req.query.role_ids.split(',').map((id) => id.trim());
      queryParams.push(roleIds);
      whereConditions.push(`u.role_id = ANY($${queryParams.length})`);
    }

    if (req.query.full_name) {
      queryParams.push(`%${req.query.full_name}%`);
      whereConditions.push(`u.full_name ILIKE $${queryParams.length}`);
    }

    if (req.query.status) {
      queryParams.push(req.query.status);
      whereConditions.push(`u.status = $${queryParams.length}`);
    }

    const whereClause = `WHERE ${whereConditions.join(' AND ')}`;

    // 2. Safe Sorting
    const sortOrder = req.query.sortOrder?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    let sortClause = `ORDER BY u.created_at ${sortOrder}`;

    switch (req.query.sortBy) {
      case 'full_name':
        sortClause = `ORDER BY u.full_name ${sortOrder}, u.created_at ASC`;
        break;
      case 'role':
        sortClause = `ORDER BY r.label ${sortOrder}, u.created_at ASC`;
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
      SELECT COUNT(u.id) AS count
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      ${whereClause};
    `;

    // Build the data query (needs limit & offset parameters)
    const dataQueryParams = [...queryParams, limit, offset];
    const limitParamIdx = dataQueryParams.length - 1;
    const offsetParamIdx = dataQueryParams.length;

    const dataQuery = `
      SELECT
        u.id AS "MAIN.user_id",
        u.full_name AS "MAIN.full_name",
        u.email AS "MAIN.email",
        u.role_id AS "MAIN.role_id",
        r.label AS "MAIN.role_name",
        u.status AS "MAIN.status",
        u.created_at AS "MAIN.created_at",
        u.updated_at AS "MAIN.updated_at",
        u.created_by AS "CREATED_BY.id",
        u1.full_name AS "CREATED_BY.full_name",
        u.updated_by AS "UPDATED_BY.id",
        u2.full_name AS "UPDATED_BY.full_name"
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN users u1 ON u1.id = u.created_by
      LEFT JOIN users u2 ON u2.id = u.updated_by
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
    const rows = mapMultiple(dataRes.rows, 'user_id');

    if (rows.length === 0) {
      return responseOk(res, 'Resources retrieved successfully.', totalCount, []);
    }

    // 5. Bulk Fetch Relations (Eliminating N+1 queries)
    const userIds = rows.map((r) => r.user_id);

    const disciplinesQuery = `
      SELECT
        d.user_id,
        d.discipline_id AS "MAIN.id",
        d1.code AS "MAIN.code"
      FROM user_discipline_scopes d
      LEFT JOIN disciplines d1 ON d1.id = d.discipline_id
      WHERE d.user_id = ANY($1)
    `;

    const projectTypesQuery = `
      SELECT
        s.user_id,
        s.project_type_id AS "MAIN.id",
        p.code AS "MAIN.code"
      FROM user_project_type_specializations s
      LEFT JOIN project_types p ON p.id = s.project_type_id
      WHERE s.user_id = ANY($1)
    `;

    const projectsQuery = `
      SELECT
        c.user_id,
        c.project_id AS "MAIN.id",
        p.name AS "MAIN.name"
      FROM user_client_project_links c
      LEFT JOIN projects p ON p.id = c.project_id
      WHERE c.user_id = ANY($1)
    `;

    const [discRes, projTypesRes, projRes] = await Promise.all([
      execute(disciplinesQuery, [userIds]),
      execute(projectTypesQuery, [userIds]),
      execute(projectsQuery, [userIds])
    ]);

    // Group relations in-memory by user_id
    const disciplinesMap = new Map();
    discRes.rows.forEach((row) => {
      if (!disciplinesMap.has(row.user_id)) disciplinesMap.set(row.user_id, []);
      disciplinesMap.get(row.user_id).push(row);
    });

    const projectTypesMap = new Map();
    projTypesRes.rows.forEach((row) => {
      if (!projectTypesMap.has(row.user_id)) projectTypesMap.set(row.user_id, []);
      projectTypesMap.get(row.user_id).push(row);
    });

    const projectsMap = new Map();
    projRes.rows.forEach((row) => {
      if (!projectsMap.has(row.user_id)) projectsMap.set(row.user_id, []);
      projectsMap.get(row.user_id).push(row);
    });

    // Attach relations to mapped user rows
    rows.forEach((row) => {
      const userDiscip = disciplinesMap.get(row.user_id) || [];
      const userProjType = projectTypesMap.get(row.user_id) || [];
      const userProj = projectTypesMap.get(row.user_id) || [];

      const disciplines = mapMultiple(userDiscip, 'id');
      const project_types = mapMultiple(userProjType, 'id');
      const projects = mapMultiple(userProj, 'id');

      row.scope = disciplines.length > 0 ? disciplines : project_types.length > 0 ? project_types : projects.length > 0 ? projects : [];
    });

    return responseOk(res, 'Resources retrieved successfully.', totalCount, rows);
  } catch (error) {
    console.error(error);
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const details = await getUser(id);

    if (!details) {
      return responseError(res, 'No user associated with this id.', 400);
    }

    responseOk(res, 'Resource retrieved successfully.', 1, details);

  } catch (error) {
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};

export const createUser = async (req, res) => {
  try {
    const user_id = await authenticate(req, res);

    const { full_name, email, phone, password, role, scope } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await execute(
      `INSERT INTO users (
        id, 
        full_name, 
        email,
        phone,
        password_hash,
        temp_password_issued,
        role_id,
        created_by,
        created_at,
        updated_by,
        updated_at,
        status
      ) VALUES (
        $1, 
        $2, 
        $3,
        $4,
        $5,
        true,
        (SELECT id from roles where code = $6),
        $7,
        NOW(),
        $8,
        NOW(),
        'active'
      ) RETURNING id`,
      [
        uuidv4(),
        full_name,
        email,
        phone,
        hashedPassword,
        role,
        user_id,
        user_id
      ]
    )
  
    const scopekey = Object.keys(scope || {});
    let scopeQuery = '';

    for (const item of scope?.[scopekey[0]] || []) { {
      scopeQuery = `
        INSERT INTO user_discipline_scopes (
          user_id,
          discipline_id,
          created_by,
          created_at,
          updated_by,
          updated_at
        ) VALUES (
          $1,
          (SELECT id from disciplines where code = $2),
          $3,
          NOW(),
          $3,
          NOW()
        )`;
    }
    if (scopekey[0] === 'project_types') {
      scopeQuery = `
        INSERT INTO user_project_type_specializations (
          user_id,
          project_type_id,
          created_by,
          created_at,
          updated_by,
          updated_at
        ) VALUES (
          $1,
          (SELECT id from project_types where code = $2),
          $3,
          NOW(),
          $3,
          NOW()
        )`;
    }
    else if (scopekey[0] === 'projects') {
      scopeQuery = `
        INSERT INTO user_client_project_links (
          user_id,
          project_id,
          created_by,
          created_at,
          updated_by,
          updated_at
        ) VALUES (
          $1,
          (SELECT id from projects where name = $2),
          $3,
          NOW(),
          $3,
          NOW()
        )`;
    }

    for await (const item of scope[scopekey[0]]) {
      await execute(scopeQuery,
        [
          result.rows[0].id,
          item,
          user_id
        ]
      );
    }

    const details = await getUser(result.rows[0].id);

    responseOk(res, 'Resource created successfully', 1, details);
    }
  }
  catch (error) {
    console.log(error);
    return responseError(res, error.message, 500);
  }
}

export const updateUser = async (req, res) => {
  try {
    const user_id = await authenticate(req, res);
    const { id } = req.params;

    const query = `
    UPDATE users SET
    `;

    const requestBody = [];

    if (req.body.full_name && req.body.full_name !== '') {
      requestBody.push(`full_name = '${req.body.full_name}'`);
    }

    if (req.body.email && req.body.email !== '') {
      requestBody.push(`email = '${req.body.email}'`);
    }

    if (req.body.phone && req.body.phone !== '') {
      requestBody.push(`phone = '${req.body.phone}'`);
    }

    if (req.body.password && req.body.password !== '') {
      const hashedPassword = await bcrypt.hash(req.body.password, 12);
      requestBody.push(`password = '${hashedPassword}'`);
    }

    if (req.body.role && req.body.role !== '') {
      requestBody.push(`role_id = (SELECT id from roles where code = '${req.body.role}')`);
    }

    if (req.body.scope && req.body.scope !== '') {
      const scope = req.body.scope;
      const scopekey = Object.keys(req.body.scope);
      let scopeQuery = '';
      let deleteScopeQuery = '';

      if (scopekey[0] === 'disciplines') {
        deleteScopeQuery = `
          DELETE FROM user_discipline_scopes
          WHERE user_id = $1`;
        scopeQuery = `        
          INSERT INTO user_discipline_scopes (
            user_id,
            discipline_id,
            created_by,
            created_at,
            updated_by,
            updated_at
          ) VALUES (
            $1,
            (SELECT id from disciplines where code = $2),
            $3,
            NOW(),
            $3,
            NOW()
          );`;
      }
      else if (scopekey[0] === 'project_types') {
        deleteScopeQuery = `
          DELETE FROM user_project_type_specializations
          WHERE user_id = $1`;
        scopeQuery = `
          INSERT INTO user_project_type_specializations (
            user_id,
            project_type_id,
            created_by,
            created_at,
            updated_by,
            updated_at
          ) VALUES (
            $1,
            (SELECT id from project_types where code = $2),
            $3,
            NOW(),
            $3,
            NOW()
          );`;
      }
      else if (scopekey[0] === 'projects') {
        deleteScopeQuery = `
          DELETE FROM user_client_project_links
          WHERE user_id = $1`;
        scopeQuery = `
          INSERT INTO user_client_project_links (
            user_id,
            project_id,
            created_by,
            created_at,
            updated_by,
            updated_at
          ) VALUES (
            $1,
            (SELECT id from projects where name = $2),
            $3,
            NOW(),
            $3,
            NOW()
          );`;
      }
      await execute(deleteScopeQuery, [ id ] );

      for await (const item of scope[scopekey[0]]) {
        await execute(scopeQuery,
          [
            id,
            item,
            user_id
          ]
        );
      }
    }

    if (req.body.status && req.body.status !== '') {
      requestBody.push(`status = '${req.body.status}'`);
    }

    requestBody.push(`updated_by = '${user_id}'`);
    requestBody.push(`updated_at = NOW()`);
    await execute(
      `${query}
        ${requestBody.join(', ')}
        WHERE id = '${id}'`
    );

    const details = await getUser(id);

    responseOk(res, 'Resource updated successfully', 1, details);
  }
  catch (error) {
    return responseError(res, error.message, 500);
  }
};

export const deleteUser = async (req, res) => {
  try {
    const user_id = await authenticate(req, res);
    const { id } = req.params;


    await execute(
      `UPDATE users set 
        status = 'suspended', 
        updated_by = '${user_id}',
        updated_at = NOW()
        WHERE id = $1`,
      [
        id
      ]
    );

    const details = await getUser(id);

    responseOk(res, 'Resource deleted successfully', 1, details);
  } catch (error) {
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};

const getUser = async (userId) => {
  const query = `
    WITH discipline_scopes AS (
      SELECT
        uds.user_id,
        jsonb_agg(
          jsonb_build_object(
            'id', uds.discipline_id,
            'code', d.code
          )
        ) FILTER (WHERE uds.discipline_id IS NOT NULL) AS disciplines
      FROM user_discipline_scopes uds
      LEFT JOIN disciplines d ON d.id = uds.discipline_id
      WHERE uds.user_id = $1
      GROUP BY uds.user_id
    ),
    project_type_scopes AS (
      SELECT
        upts.user_id,
        jsonb_agg(
          jsonb_build_object(
            'id', upts.project_type_id,
            'code', pt.code
          )
        ) FILTER (WHERE upts.project_type_id IS NOT NULL) AS project_types
      FROM user_project_type_specializations upts
      LEFT JOIN project_types pt ON pt.id = upts.project_type_id
      WHERE upts.user_id = $1
      GROUP BY upts.user_id
    ),
    project_scopes AS (
      SELECT
        ucpl.user_id,
        jsonb_agg(
          jsonb_build_object(
            'id', ucpl.project_id,
            'name', pr.name
          )
        ) FILTER (WHERE ucpl.project_id IS NOT NULL) AS projects
      FROM user_client_project_links ucpl
      LEFT JOIN projects pr ON pr.id = ucpl.project_id
      WHERE ucpl.user_id = $1
      GROUP BY ucpl.user_id
    )
    SELECT
      u.id AS "MAIN.user_id",
      u.full_name AS "MAIN.full_name",
      u.email AS "MAIN.email",
      u.role_id AS "MAIN.role_id",
      r.label AS "MAIN.role_name",
      u.status AS "MAIN.status",
      u.created_at AS "MAIN.created_at",
      u.updated_at AS "MAIN.updated_at",
      u.created_by AS "CREATED_BY.id",
      u1.full_name AS "CREATED_BY.full_name",
      u.updated_by AS "UPDATED_BY.id",
      u2.full_name AS "UPDATED_BY.full_name",
      CASE 
        WHEN ds.disciplines IS NOT NULL THEN ds.disciplines
        WHEN pts.project_types IS NOT NULL THEN pts.project_types
        WHEN prs.projects IS NOT NULL THEN prs.projects
        ELSE '[]'::jsonb
      END AS "MAIN.scope"
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN users u1 ON u1.id = u.created_by
    LEFT JOIN users u2 ON u2.id = u.updated_by
    LEFT JOIN discipline_scopes ds ON ds.user_id = u.id
    LEFT JOIN project_type_scopes pts ON pts.user_id = u.id
    LEFT JOIN project_scopes prs ON prs.user_id = u.id
    WHERE u.id = $1;
  `;

  const { rows, rowCount } = await execute(query, [userId]);

  if (rowCount === 0) {
    return null;
  }

  return mapSingle(rows[0]);
};