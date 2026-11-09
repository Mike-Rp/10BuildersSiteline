// Public-key encryption for backup files. The backup PC holds only the PUBLIC key, so a stolen PC or drive cannot
// read the backups. The private key lives elsewhere and is needed only to restore.
//
// File format (SLBK1): magic | wrapped-key length (2 bytes) | RSA-OAEP wrapped AES key | 12-byte IV | AES-256-GCM
// ciphertext | 16-byte tag. Every file gets its own random AES key. The header is authenticated, so any change to
// the file (header or body) makes decryption fail instead of producing wrong data.
import {
  constants, createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey,
  generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, open, rm, stat, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("SLBK1\n");
const IV_BYTES = 12;
const TAG_BYTES = 16;

export const MIN_PASSPHRASE_LENGTH = 12;

/** A new key pair. The private key is protected by the passphrase; the public key is plain text. */
export function generateBackupKeyPair(passphrase, bits = 4096) {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE_LENGTH)
    throw new Error(`The passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  return generateKeyPairSync("rsa", {
    modulusLength: bits,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase },
  });
}

/** Short identifier of a public key, so people can confirm which key a backup was made with. */
export function keyFingerprint(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 32).match(/.{4}/g).join(" ");
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

export async function encryptFile(inPath, outPath, publicKeyPem) {
  const key = randomBytes(32);
  const iv = randomBytes(IV_BYTES);
  const wrapped = publicEncrypt(
    { key: createPublicKey(publicKeyPem), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    key,
  );
  const length = Buffer.alloc(2);
  length.writeUInt16BE(wrapped.length);
  const authenticated = Buffer.concat([MAGIC, length, wrapped]);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(authenticated);
  try {
    await writeFile(outPath, Buffer.concat([authenticated, iv]));
    await pipeline(createReadStream(inPath), cipher, createWriteStream(outPath, { flags: "a" }));
    await appendFile(outPath, cipher.getAuthTag());
  } catch (error) {
    await rm(outPath, { force: true });
    throw error;
  }
  return { bytes: (await stat(outPath)).size, sha256: await sha256File(outPath) };
}

export async function decryptFile(inPath, outPath, privateKeyPem, passphrase) {
  const size = (await stat(inPath)).size;
  const handle = await open(inPath, "r");
  let authenticated, iv, bodyStart, tag, wrapped;
  try {
    const head = Buffer.alloc(MAGIC.length + 2);
    await handle.read(head, 0, head.length, 0);
    if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("This is not a SITELINE backup file.");
    const wrappedLength = head.readUInt16BE(MAGIC.length);
    bodyStart = head.length + wrappedLength + IV_BYTES;
    if (bodyStart + TAG_BYTES > size) throw new Error("The backup file is incomplete.");
    const rest = Buffer.alloc(wrappedLength + IV_BYTES);
    await handle.read(rest, 0, rest.length, head.length);
    authenticated = Buffer.concat([head, rest.subarray(0, wrappedLength)]);
    iv = rest.subarray(wrappedLength);
    wrapped = rest.subarray(0, wrappedLength);
    tag = Buffer.alloc(TAG_BYTES);
    await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  let key;
  try {
    key = privateDecrypt(
      { key: createPrivateKey({ key: privateKeyPem, format: "pem", passphrase }), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      wrapped,
    );
  } catch {
    throw new Error("The private key or passphrase is wrong, or this backup was made with a different key.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(authenticated);
  decipher.setAuthTag(tag);
  try {
    const bodyEnd = size - TAG_BYTES;
    if (bodyEnd > bodyStart) {
      await pipeline(createReadStream(inPath, { start: bodyStart, end: bodyEnd - 1 }), decipher, createWriteStream(outPath));
    } else {
      decipher.final();
      await writeFile(outPath, Buffer.alloc(0));
    }
  } catch {
    await rm(outPath, { force: true });
    throw new Error("The backup file is damaged or has been changed, so it was not restored.");
  }
}
