import { createDecipheriv, createHash } from "node:crypto";
import type { LicensingLicenseKeyDecrypter } from "../logic/license-key-decrypter";

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function decodeCanonicalBase64Url(part: string): Buffer | null {
  if (!part || !BASE64URL.test(part)) return null;
  const bytes = Buffer.from(part, "base64url");
  return bytes.toString("base64url") === part ? bytes : null;
}

export function createAesGcmLicensingLicenseKeyDecrypter(
  licensePepper: string,
): LicensingLicenseKeyDecrypter {
  if (!licensePepper) throw new Error("Licensing license pepper is required.");
  const encryptionKey = createHash("sha256").update(licensePepper).digest();

  return Object.freeze({
    decrypt(ciphertext: string): string {
      if (typeof ciphertext !== "string" || ciphertext.length > 4096) {
        throw new Error("INVALID_CIPHERTEXT");
      }
      const parts = ciphertext.split(".");
      if (parts.length !== 3) throw new Error("INVALID_CIPHERTEXT");
      const [ivPart, tagPart, encryptedPart] = parts;
      if (!ivPart || !tagPart || !encryptedPart) throw new Error("INVALID_CIPHERTEXT");

      const iv = decodeCanonicalBase64Url(ivPart);
      const tag = decodeCanonicalBase64Url(tagPart);
      const encrypted = decodeCanonicalBase64Url(encryptedPart);
      if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !encrypted || encrypted.length < 1) {
        throw new Error("INVALID_CIPHERTEXT");
      }

      try {
        const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv, {
          authTagLength: 16,
        });
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      } catch {
        throw new Error("INVALID_CIPHERTEXT");
      }
    },
  });
}
