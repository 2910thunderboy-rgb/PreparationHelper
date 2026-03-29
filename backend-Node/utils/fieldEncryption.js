import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;
const KEY_LEN = 32;

/**
 * Derives a 32-byte key from FIELD_ENCRYPTION_KEY env.
 * Accepts 64 hex characters OR a 44-char base64 string (32 bytes).
 */
function getKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("FIELD_ENCRYPTION_KEY is not set (use openssl rand -hex 32)");
  }
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const b = Buffer.from(trimmed, "base64");
  if (b.length !== KEY_LEN) {
    throw new Error("FIELD_ENCRYPTION_KEY must be 64 hex chars or 32-byte base64");
  }
  return b;
}

export function encryptField(plainText) {
  if (plainText == null || plainText === "") return "";
  const iv = crypto.randomBytes(IV_LEN);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptField(blob) {
  if (!blob) return "";
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LEN + TAG_LEN) return "";
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
