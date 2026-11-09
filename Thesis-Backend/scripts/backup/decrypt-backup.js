// Opens an encrypted backup file so it can be restored.
//
//   node decrypt-backup.js <backup.dump.enc> <private-key.pem> [output file]
//
// Works for the database backups and for the copied Storage files, which use the same format.
// The passphrase is asked for when the command runs.
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { decryptFile } from "./crypto.js";

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

async function main() {
  const [input, keyPath, output] = process.argv.slice(2);
  if (!input || !keyPath) {
    console.error("Usage: node decrypt-backup.js <backup.dump.enc> <private-key.pem> [output file]");
    process.exit(1);
  }
  const target = output || input.replace(/\.enc$/i, "") + (/\.enc$/i.test(input) ? "" : ".decrypted");
  const passphrase = await askHidden("Passphrase of the private key: ");
  try {
    await decryptFile(input, target, await readFile(keyPath, "utf8"), passphrase);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`Decrypted to ${target}.\nA database backup can now be restored into a NEW or test database with pg_restore.\nDelete the decrypted file when you are finished.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
