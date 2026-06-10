import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import { env } from "./env";

// AES-256-GCM, key from APP_ENCRYPTION_KEY (kept in Secret Manager in prod,
// never stored alongside the data — SPEC §10). Accepts 64-char hex or any
// string (hashed to 32 bytes via HMAC for dev convenience).
function key(): Buffer {
  const raw = env.appEncryptionKey;
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  return createHmac("sha256", "calyflow-key-derivation").update(raw).digest();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [iv, ciphertext, cipher.getAuthTag()]
    .map((b) => b.toString("base64"))
    .join(".");
}

export function decrypt(payload: string): string {
  const [iv, ciphertext, tag] = payload
    .split(".")
    .map((part) => Buffer.from(part, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

// Signed values for the SINGLE_WORKSPACE session cookie.
export function sign(value: string): string {
  const mac = createHmac("sha256", key()).update(value).digest("base64url");
  return `${Buffer.from(value, "utf8").toString("base64url")}.${mac}`;
}

export function verify(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return null;
  const value = Buffer.from(signed.slice(0, dot), "base64url").toString("utf8");
  const expected = createHmac("sha256", key()).update(value).digest("base64url");
  const actual = signed.slice(dot + 1);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  ) {
    return null;
  }
  return value;
}
