import { createHash, createHmac, randomBytes } from "node:crypto";
import type { IdentityMfaRecoveryCodeProvider } from "../logic/mfa-recovery-code-provider";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(input: Buffer) {
  let bits = "";
  for (const byte of input) {
    bits += byte.toString(2).padStart(8, "0");
  }

  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    output += alphabet[
      Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)
    ];
  }
  return output;
}

const normalizeRecoveryCode = (code: string) =>
  code.replace(/[^A-Z2-7]/gi, "").toUpperCase();

export function createHmacMfaRecoveryCodeProvider(
  sessionSecret: string,
  mfaEncryptionKey?: string,
): IdentityMfaRecoveryCodeProvider {
  if (!sessionSecret) {
    throw new Error("Identity session secret is required.");
  }

  const mfaKey = createHash("sha256")
    .update(mfaEncryptionKey || sessionSecret)
    .digest();

  const hash = (value: string) =>
    createHmac("sha256", mfaKey)
      .update(normalizeRecoveryCode(value))
      .digest("hex");

  return Object.freeze({
    issue(count = 10) {
      if (!Number.isInteger(count) || count <= 0) {
        throw new Error("Recovery code count must be a positive integer.");
      }

      return Array.from({ length: count }, () => {
        const value = base32Encode(randomBytes(10)).match(/.{1,5}/g)!.join("-");
        return { value, hash: hash(value) };
      });
    },
  });
}
