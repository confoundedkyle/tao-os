import { afterEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt, sign, verify } from "@/lib/crypto";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encrypt/decrypt", () => {
  it("round-trips ascii, unicode, and empty strings", () => {
    for (const plaintext of ["hello", "héllo wörld 🚀 日本語", ""]) {
      expect(decrypt(encrypt(plaintext))).toBe(plaintext);
    }
  });

  it("produces a three-part base64 payload", () => {
    const parts = encrypt("secret").split(".");
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(() => Buffer.from(part, "base64")).not.toThrow();
    }
    // IV is 12 bytes, GCM tag is 16 bytes.
    expect(Buffer.from(parts[0], "base64")).toHaveLength(12);
    expect(Buffer.from(parts[2], "base64")).toHaveLength(16);
  });

  it("uses a random IV: same plaintext encrypts differently, both decrypt", () => {
    const a = encrypt("same input");
    const b = encrypt("same input");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same input");
    expect(decrypt(b)).toBe("same input");
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const [iv, ciphertext, tag] = encrypt("attack at dawn").split(".");
    const corrupted = Buffer.from(ciphertext, "base64");
    corrupted[0] ^= 0xff;
    const payload = [iv, corrupted.toString("base64"), tag].join(".");
    expect(() => decrypt(payload)).toThrow();
  });

  it("derives the key from a passphrase when not 64-char hex", () => {
    vi.stubEnv("APP_ENCRYPTION_KEY", "just-a-dev-passphrase");
    expect(decrypt(encrypt("dev mode"))).toBe("dev mode");
  });

  it("fails to decrypt under a different key", () => {
    const payload = encrypt("secret");
    vi.stubEnv("APP_ENCRYPTION_KEY", "another-key-entirely");
    expect(() => decrypt(payload)).toThrow();
  });
});

describe("sign/verify", () => {
  it("round-trips a value", () => {
    expect(verify(sign("user-123"))).toBe("user-123");
  });

  it("round-trips values containing dots", () => {
    expect(verify(sign("a.b.c"))).toBe("a.b.c");
  });

  it("rejects a tampered MAC", () => {
    const signed = sign("user-123");
    const dot = signed.lastIndexOf(".");
    const mac = signed.slice(dot + 1);
    const flipped = (mac[0] === "A" ? "B" : "A") + mac.slice(1);
    expect(verify(`${signed.slice(0, dot)}.${flipped}`)).toBeNull();
  });

  it("rejects an altered value with the original MAC", () => {
    const signed = sign("user-123");
    const dot = signed.lastIndexOf(".");
    const otherValue = Buffer.from("user-456", "utf8").toString("base64url");
    expect(verify(`${otherValue}${signed.slice(dot)}`)).toBeNull();
  });

  it("rejects input without a dot", () => {
    expect(verify("no-dot-here")).toBeNull();
  });

  it("rejects a signature minted under a different key", () => {
    const signed = sign("user-123");
    vi.stubEnv("APP_ENCRYPTION_KEY", "another-key-entirely");
    expect(verify(signed)).toBeNull();
  });
});
