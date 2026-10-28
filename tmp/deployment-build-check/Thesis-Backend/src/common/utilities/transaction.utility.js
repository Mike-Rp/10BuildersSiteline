import { get } from "../pool-manager.js";
 
export async function withTransaction(fn) {
  const pool = await get();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
    }
    throw error;
  } finally {
    client.release();

  }
}
 
export default withTransaction;