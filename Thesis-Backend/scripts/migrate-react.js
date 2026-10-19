import "dotenv/config";
import fs from "node:fs";
import { get, close } from "../src/common/pool-manager.js";
try {
    const sql = fs.readFileSync(new URL("../migrations/003-react-integration.sql", import.meta.url), "utf8");
    await (await get()).query(sql);
    console.log("React integration migration applied. Existing records preserved.");
}
catch (error) {
    console.error("Migration failed:", error.code || error.message);
    process.exitCode = 1;
}
finally {
    await close();
}
