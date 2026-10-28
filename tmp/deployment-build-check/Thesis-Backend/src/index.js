import app from "./app.js";
import { close as closePool } from "./common/pool-manager.js";
import { startArchiveMaintenance } from "./services/archive/scheduler.js";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => {
  if (process.env.ARCHIVE_MAINTENANCE_ENABLED === 'true') startArchiveMaintenance();
  console.log(`Server is running on http://${host}:${port}`);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(async () => { await closePool(); process.exit(0); }));
}
