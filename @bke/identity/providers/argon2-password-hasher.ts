import argon2 from "argon2";
import type { IdentityPasswordHasher } from "../logic/password-hasher";

export function createArgon2PasswordHasher(): IdentityPasswordHasher {
  return Object.freeze({
    hash(password: string) {
      return argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
    },
  });
}
