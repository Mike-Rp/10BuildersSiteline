
import { errorlog } from "../../common/utilities/logger.utility.js";
import execute from "../../common/utilities/query.utility.js";
import { responseOk, responseError } from "../../common/utilities/response.utility.js";
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { authenticate } from "../../common/utilities/auth.utility.js";
import { withTransaction } from "../../common/utilities/transaction.utility.js";
import { HttpError,sendOk,sendError,handleError,requireUser } from "../../common/utilities/access.utility.js";

export const login = async (req,res) => {
  try {
    const {email,password}=req.body || {};
    if(typeof email!=="string" || !email.trim() || typeof password!=="string" || !password) {
      return sendError(res,"Email and password are required.",400);
    }
    const data=await withTransaction(async client=>{
      const found=await client.query(
        `SELECT u.id,u.full_name,u.email,u.password_hash,u.role_id,r.code AS role,u.status,u.temp_password_issued
         FROM users u JOIN roles r ON r.id=u.role_id
         WHERE lower(u.email::text)=$1 AND COALESCE(u.is_deleted,false)=false AND NOT EXISTS (SELECT 1 FROM workspace_account_metadata m WHERE m.user_id=u.id AND m.metadata->>'assignmentHold'='true' AND m.metadata->'resignation'->>'status'='notice' AND (m.metadata->'resignation'->>'effectiveDate')::timestamptz<=now()) FOR UPDATE OF u`,
        [email.trim().toLowerCase()]);
      const u=found.rows[0];
      if(!u || !["active","invited"].includes(u.status) || !(await bcrypt.compare(password,u.password_hash))) {
        throw new HttpError(401,"Invalid credentials or unavailable account.");
      }
      if(u.role==="client" && u.status==="invited") {
        const ready=await client.query(
          `SELECT 1 FROM user_client_project_links l JOIN projects p ON p.id=l.project_id
           WHERE l.user_id=$1 AND p.lifecycle_status IN ('active','archived') AND COALESCE(p.is_deleted,false)=false LIMIT 1`,[u.id]);
        if(!ready.rowCount) throw new HttpError(403,"Client login is awaiting project approvals.");
      }
      await client.query(
        "UPDATE users SET status='active',last_login_at=now(),updated_by=$1,updated_at=now() WHERE id=$1",[u.id]);
      const safe={id:u.id,full_name:u.full_name,email:u.email,role_id:u.role_id,role:u.role,status:"active",
        temp_password_issued:u.temp_password_issued};
      const token=jwt.sign({details:{...safe,user:Buffer.from(JSON.stringify(safe),"utf8").toString("base64")},
        login:{timestamp:Date.now(),expiresIn:1000*60*60*8}},process.env.JWT_SECRET,{expiresIn:"8h"});
      const existing=await client.query("SELECT 1 FROM users_token WHERE user_id=$1",[u.id]);
      if(existing.rowCount) await client.query("UPDATE users_token SET token=$2 WHERE user_id=$1",[u.id,token]);
      else await client.query("INSERT INTO users_token (user_id,token) VALUES ($1,$2)",[u.id,token]);
      return {token,user:safe};
    });
    return sendOk(res,"Login successful.",1,data);
  } catch(error) { return handleError(res,error); }
};

export const refresh = async (req, res) => {
  try {
    // authenticate() verifies the JWT signature and expiry, so an expired session cannot be revived.
    const id = await authenticate(req, res);

    if (!id) {
      return responseError(res, 'Invalid token.', 401);
    }

    const result = await execute(
      `SELECT
        u.id,
        u.full_name,
        u.email,
        u.role_id,
        r.code AS role,
        u.status,
        u.temp_password_issued
      FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
      [
        id
      ]
    );

    const user = result.rows[0];

    const token = jwt.sign({
      details: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        status: user.status,
        role_id: user.role_id,
        user: Buffer.from(JSON.stringify(user), 'utf8').toString('base64')
      },
      login: {
        timestamp: new Date().getTime(),
        expiresIn: 1000 * 60 * 60 * 8
      }
    }, process.env.JWT_SECRET, { expiresIn: '8h' });

    const selectResult = await execute(
      `SELECT * FROM USERS_TOKEN WHERE user_id = $1`,
      [
        user.id
      ]
    );

    let query = `
      INSERT INTO USERS_TOKEN (user_id, token) VALUES ($1, $2);
    `;
    if (selectResult.rowCount > 0) {
      query = `
      UPDATE USERS_TOKEN SET TOKEN = $2 WHERE user_id = $1;
    `;
    }

    await execute(
      query,
      [
        user.id,
        token
      ]
    );

    return responseOk(res, 'Refresh successful', 1, {
      token
    });
  }
  catch (error) {
    return responseError(res, error.message, 500);
  }
};

export const reset = async (req, res) => {
  try {
    const actor = await requireUser(req, res);
    if(!actor)return;
    const id = actor.id;
    const { password } = req.body;
    if(typeof password!=="string"||password.length<8||password.length>72)return sendError(res,"Password must contain 8 to 72 characters.",400);
    const hashedPassword = await bcrypt.hash(password, 12);

    if (!id) {
      return responseError(res, 'Invalid token.', 400);
    }

    await execute(
      `UPDATE users SET password_hash = $1, temp_password_issued = false WHERE id = $2`,
      [
        hashedPassword,
        id
      ]
    );

    return responseOk(res, 'Reset password successful', 1);
  } catch (error) {
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};


export const logout = async (req, res) => {
  try {
    const id = await authenticate(req, res);

    if (!id) {
      return responseError(res, 'Invalid token.', 400);
    }

    await execute(
      `DELETE FROM USERS_TOKEN WHERE user_id = $1`,
      [
        id
      ]
    );

    return responseOk(res, 'Logout successful', 1);
  } catch (error) {
    errorlog(error);
    return responseError(res, error.message, 500);
  }
};