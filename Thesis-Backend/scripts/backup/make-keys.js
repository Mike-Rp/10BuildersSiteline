// Creates the backup key pair. Run once, interactively, on the backup PC.
//
//   node make-keys.js                          public key -> C:\siteline-backups\config, private key -> Desktop
//   node make-keys.js --private-out <folder>   write the private key somewhere else
//   node make-keys.js --force                  replace an existing key (older backups can then NOT be opened with the new key)
//
// The PUBLIC key stays on this PC and is used to encrypt each backup. The PRIVATE key is needed only to restore.
// Move it to its safe place (for example a groupmate's phone) and delete it from this PC. It is protected by a
// passphrase that must be remembered or written down separately.
import { createInterface } from "node:readline";
import { access, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBackupKeyPair, keyFingerprint, MIN_PASSPHRASE_LENGTH } from "./crypto.js";

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

const exists = async (path) => access(path).then(() => true, () => false);

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const outIndex = args.indexOf("--private-out");
  const privateDir = (outIndex >= 0 && args[outIndex + 1]) || join(homedir(), "Desktop");
  const configDir = process.env.SITELINE_BACKUP_CONFIG_DIR || "C:\\siteline-backups\\config";
  const publicPath = join(configDir, "backup-public.pem");
  const privatePath = join(privateDir, "siteline-backup-PRIVATE-KEY.pem");

  if (!force && (await exists(publicPath))) {
    console.error(`A backup key already exists at ${publicPath}.\nReplacing it would make older backups impossible to open with the new key. Use --force only if you are sure.`);
    process.exit(1);
  }
  const first = await askHidden(`Choose a passphrase for the private key (at least ${MIN_PASSPHRASE_LENGTH} characters): `);
  if (first.length < MIN_PASSPHRASE_LENGTH) { console.error(`The passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`); process.exit(1); }
  if ((await askHidden("Type the passphrase again: ")) !== first) { console.error("The passphrases do not match. Nothing was created."); process.exit(1); }

  console.log("Creating the key pair. This takes a few seconds...");
  const { publicKey, privateKey } = generateBackupKeyPair(first);
  await mkdir(configDir, { recursive: true });
  await mkdir(privateDir, { recursive: true });
  await writeFile(publicPath, publicKey);
  await writeFile(privatePath, privateKey, { mode: 0o600 });
  console.log(`
Public key (stays on this PC):  ${publicPath}
Private key (move it away):     ${privatePath}
Key fingerprint:                ${keyFingerprint(publicKey)}

Next steps:
 1. Copy the private key file to its safe place, such as your groupmate's phone, and keep a second copy somewhere else.
 2. Write the passphrase down separately. Without the key AND the passphrase, backups cannot be opened.
 3. Delete the private key file from this PC, then empty the Recycle Bin.
 4. Note the fingerprint. It identifies which key your backups were made with.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
