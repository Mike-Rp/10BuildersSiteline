// Explicit local test mail capture. No SMTP delivery and no production usage.
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
const directory = fileURLToPath(new URL("../.local-mail/", import.meta.url));
if (process.env.NODE_ENV === "production" || process.env.VERCEL) throw new Error("Local mail capture cannot run in production.");
await mkdir(directory, { recursive: true });
createServer(async (req, res) => {
  try {
    if (req.method !== "POST" || req.url !== "/capture" || req.headers.origin) { res.writeHead(404).end(); return; }
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error("Too large"); chunks.push(chunk); }
    const { messages } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(messages) || !messages.length || messages.length > 2) throw new Error("Invalid messages");
    for (const message of messages) {
      if (![message.to, message.subject, message.text].every(value => typeof value === "string") || /[\r\n]/.test(message.to + message.subject)) throw new Error("Invalid message");
      await writeFile(`${directory}/${randomUUID()}.eml`, `To: ${message.to}\nSubject: ${message.subject}\nContent-Type: text/plain; charset=utf-8\n\n${message.text}`, { flag: "wx", mode: 0o600 });
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ accepted: messages.length }));
  } catch { res.writeHead(400).end(); }
}).listen(8026, "127.0.0.1", () => console.log("Local test mail capture: http://127.0.0.1:8026/capture. Messages saved in Thesis-Backend/.local-mail; no real emails sent."));
