import "dotenv/config";
import pg from "pg";
let pool;
export async function get() {
    if (!pool) {
        const mode = process.env.PGSSLMODE || "disable";
        pool = new pg.Pool({
            host: process.env.DB_SERVER, port: Number(process.env.DB_PORT || 5432),
            database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
            // Serverless: each instance keeps its own pool, so keep it tiny to stay under the pooler's client cap.
            max: Number(process.env.DB_POOL_MAX || (process.env.VERCEL ? 1 : 5)), connectionTimeoutMillis: 10000,
            idleTimeoutMillis: process.env.VERCEL ? 5000 : 30000,
            ssl: mode === "disable" ? false : { rejectUnauthorized: !["no-verify", "require"].includes(mode) },
        });
        pool.on("error", error => console.error("Database pool error:", error.code || "connection lost"));
    }
    return pool;
}
export async function close() { if (pool) {
    const current = pool;
    pool = undefined;
    await current.end();
} }
