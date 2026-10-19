import { execute } from "./query.utility.js";

export const authenticate = async (req) => {
  const authHeader = (req.headers.authorization || '').trim().replace(/^Bearer\s*/i, '').trim().replace(/^["']|["']$/g, '').trim();


  const query = `
    SELECT user_id FROM USERS_TOKEN WHERE token = $1 
  `

  const result = await execute(query, [authHeader]);

  if (result.rowCount > 0){
    return result.rows[0].user_id;
  }
  else{
    return null;
  }
};