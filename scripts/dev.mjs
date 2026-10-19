import { spawn } from "node:child_process";
import { watchFile, unwatchFile } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const backend = fileURLToPath(new URL("../Thesis-Backend/", import.meta.url));
const config = fileURLToPath(new URL("../Thesis-Backend/.env", import.meta.url));
let stopping = false;
let restarting = false;
let api;
const apiEnvironment = {...process.env};
delete apiEnvironment.PORT;
if(process.env.API_PORT)apiEnvironment.PORT=process.env.API_PORT;
const web = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], { cwd: root, stdio: "inherit", env: process.env });
function stop(code = 0) {
    if (stopping)
        return;
    stopping = true;
    unwatchFile(config);
    api?.kill();
    web.kill();
    process.exitCode = code;
}
function startApi() {
    api = spawn(process.execPath, ["src/index.js"], { cwd: backend, stdio: "inherit", env: apiEnvironment });
    api.on("error", error => { console.error(error.message); stop(1); });
    api.on("exit", code => {
        if (stopping)
            return;
        if (restarting) {
            restarting = false;
            startApi();
        }
        else
            stop(code || 0);
    });
}
web.on("error", error => { console.error(error.message); stop(1); });
web.on("exit", code => stop(code || 0));
startApi();
watchFile(config, { interval: 1000 }, (current, previous) => {
    if (stopping || current.mtimeMs === previous.mtimeMs || restarting)
        return;
    console.log("Backend configuration changed. Restarting the API.");
    restarting = true;
    api.kill();
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
