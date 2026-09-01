import argon2 from "argon2";
import type { IdentityPasswordVerifier } from "../logic/password-verifier";

export function createArgon2PasswordVerifier(): IdentityPasswordVerifier {
  return Object.freeze({
    async verify(passwordHash: string, password: string) {
      try {
        return await argon2.verify(passwordHash, password);
      } catch {
        // Preserve V1 fail-closed semantics: malformed/unverifiable hashes never
        // become an infrastructure disclosure or an authentication success.
        return false;
      }
    },
  });
}
