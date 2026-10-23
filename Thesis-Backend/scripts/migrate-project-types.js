import "dotenv/config";
import fs from "node:fs";
import { get, close } from "../src/common/pool-manager.js";
try {
 const db=await get();
 await db.query(fs.readFileSync(new URL("../migrations/004-project-type-workflows.sql",import.meta.url),"utf8"));
 console.log("Project-type workflows migrated. Existing records preserved; added phases require assignment and checklist configuration.");
} catch(error) { console.error("Migration failed:",error.code||error.message);process.exitCode=1; }
finally {await close();}
