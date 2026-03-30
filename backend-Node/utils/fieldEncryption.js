import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;
const KEY_LEN = 32;

/** Cached key when deriving from JWT_SECRET (avoid re-hashing every call). */
let _derivedKeyCache = null;

/**
 * 32-byte AES key from:
 * 1) FIELD_ENCRYPTION_KEY — preferred (64 hex or 32-byte base64)
 * 2) Else SHA-256 of JWT_SECRET with a fixed prefix (dev convenience; rotate FIELD_ENCRYPTION_KEY for production)
 */
function getKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (raw && String(raw).trim()) {
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

  const jwt = process.env.JWT_SECRET;
  if (!jwt || !String(jwt).trim()) {
    throw new Error(
      "Set JWT_SECRET in backend-Node/.env, or set FIELD_ENCRYPTION_KEY (openssl rand -hex 32)"
    );
  }

  if (!_derivedKeyCache) {
    _derivedKeyCache = crypto
      .createHash("sha256")
      .update(`careerai:field-encryption:v1:${jwt}`, "utf8")
      .digest();
  }
  return _derivedKeyCache;
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
