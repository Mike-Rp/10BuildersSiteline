import { HttpError } from "../../common/utilities/access.utility.js";

export const ACCOUNT_SCOPE_SQL = `CASE lower(r.code)
  WHEN 'spm' THEN COALESCE((SELECT array_agg(d.code::text ORDER BY d.code)
    FROM user_discipline_scopes s JOIN disciplines d ON d.id=s.discipline_id WHERE s.user_id=u.id), '{}'::text[])
  WHEN 'opm' THEN COALESCE((SELECT array_agg(t.code::text ORDER BY t.code)
    FROM user_project_type_specializations s JOIN project_types t ON t.id=s.project_type_id WHERE s.user_id=u.id), '{}'::text[])
  WHEN 'client' THEN COALESCE((SELECT array_agg(p.name::text ORDER BY p.name)
    FROM user_client_project_links l JOIN projects p ON p.id=l.project_id
    WHERE l.user_id=u.id AND COALESCE(p.is_deleted,false)=false), '{}'::text[])
  ELSE '{}'::text[] END`;

const integer = (value, fallback, name, min) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)<min) {
    throw new HttpError(400, `Invalid ${name}.`);
  }
  return Number(value);
};
export function accountListQuery(query = {}) {
  const pageMode = query.page !== undefined || query.pageSize !== undefined || query.page_size !== undefined;
  const limit = Math.min(100, integer(pageMode ? query.pageSize ?? query.page_size : query.limit, 10, "page size", 1));
  const page = pageMode ? integer(query.page,1,"page",1) : null;
  const offset = pageMode ? (page-1)*limit : integer(query.offset,0,"offset",0);
  if (!Number.isSafeInteger(offset)) throw new HttpError(400,"Pagination is too large.");
  const params = [];
  const where = ["COALESCE(u.is_deleted,false)=false"];
  const add = (sql,value) => { params.push(value); where.push(sql.replace("?", "$"+params.length)); };
  if (query.role !== undefined && query.role !== "all") {
    if (!["admin","opm","spm","client"].includes(query.role)) throw new HttpError(400,"Invalid role filter.");
    add("r.code = ?",query.role);
  }
  if (query.role_ids !== undefined) {
    if (typeof query.role_ids!=="string") throw new HttpError(400,"role_ids must be a comma-separated list.");
    const ids = query.role_ids.split(",").map(v=>Number(v.trim()));
    if (!ids.length || ids.some(v=>!Number.isInteger(v) || v<1 || v>32767)) throw new HttpError(400,"Invalid role_ids.");
    add("u.role_id = ANY(?::smallint[])",[...new Set(ids)]);
  }
  if (query.status !== undefined) {
    if (!["active","invited","suspended"].includes(query.status)) throw new HttpError(400,"Invalid status filter.");
    add("u.status = ?",query.status);
  }
  const search = query.q ?? query.full_name;
  if (search !== undefined) {
    if (typeof search!=="string" || search.length>300) throw new HttpError(400,"Invalid search.");
    const pattern = "%"+search.trim()+"%";
    params.push(pattern);
    const parameter = "$"+params.length;
    where.push(`(u.full_name ILIKE ${parameter} OR u.email::text ILIKE ${parameter} OR u.id_number ILIKE ${parameter}
      OR u.status ILIKE ${parameter} OR EXISTS (SELECT 1 FROM unnest(scopes.scope) AS tag(value) WHERE tag.value ILIKE ${parameter}))`);
  }
  const from = `FROM users u JOIN roles r ON r.id=u.role_id
    CROSS JOIN LATERAL (SELECT ${ACCOUNT_SCOPE_SQL} AS scope) scopes`;
  const filters = "WHERE "+where.join(" AND ");
  const sorts = { full_name:"u.full_name",name:"u.full_name",role:"r.label",status:"u.status",date_added:"u.date_added",created_at:"u.created_at" };
  const sort = sorts[query.sortBy] ?? "u.full_name";
  const direction = String(query.sortOrder).toUpperCase()==="DESC" ? "DESC" : "ASC";
  return {
    countSql:`SELECT count(*)::int AS total ${from} ${filters}`,
    dataSql:`SELECT u.id,u.id AS user_id,u.full_name,u.email,u.phone,u.role_id,r.code AS role,r.label AS role_name,
      u.status,u.id_number,u.work_email,u.date_added::text AS date_added,u.created_at,u.last_login_at,scopes.scope,
      (SELECT count(*)::int FROM user_client_project_links l JOIN projects p ON p.id=l.project_id
        WHERE l.user_id=u.id AND COALESCE(p.is_deleted,false)=false) AS linked_projects_count,
      COALESCE((SELECT array_agg(DISTINCT p.client_name) FILTER (WHERE p.client_name IS NOT NULL)
        FROM user_client_project_links l JOIN projects p ON p.id=l.project_id
        WHERE l.user_id=u.id AND COALESCE(p.is_deleted,false)=false),'{}'::text[]) AS client_names
      ${from} ${filters} ORDER BY ${sort} ${direction},u.id ASC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
    params,dataParams:[...params,limit,offset],page:page ?? Math.floor(offset/limit)+1,limit,offset,
  };
}
