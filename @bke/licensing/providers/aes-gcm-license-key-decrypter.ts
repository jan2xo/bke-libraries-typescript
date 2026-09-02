import { createDecipheriv, createHash } from "node:crypto";
import type { LicensingLicenseKeyDecrypter } from "../logic/license-key-decrypter";

export function createAesGcmLicensingLicenseKeyDecrypter(
  licensePepper: string,
): LicensingLicenseKeyDecrypter {
  if (!licensePepper) throw new Error("Licensing license pepper is required.");
  const encryptionKey = createHash("sha256").update(licensePepper).digest();

  return Object.freeze({
    decrypt(ciphertext: string): string {
      const parts = ciphertext.split(".");
      if (parts.length !== 3) throw new Error("INVALID_CIPHERTEXT");
      const [ivPart, tagPart, encryptedPart] = parts;
      if (!ivPart || !tagPart || !encryptedPart) throw new Error("INVALID_CIPHERTEXT");

      const iv = Buffer.from(ivPart, "base64url");
      const tag = Buffer.from(tagPart, "base64url");
      const encrypted = Buffer.from(encryptedPart, "base64url");
      const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    },
  });
}
