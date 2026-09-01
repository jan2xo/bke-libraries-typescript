import type { IdentityRole } from "../contracts/identity.contract";

export interface IdentityPasswordResetCompletionRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly role: IdentityRole;
}

export interface IdentityPasswordResetCommitInput {
  readonly tokenId: string;
  readonly userId: string;
  readonly passwordHash: string;
  readonly completedAt: Date;
}

export type IdentityPasswordResetCommitResult =
  | { readonly status: "COMPLETED" }
  | { readonly status: "TOKEN_REJECTED" };

export interface IdentityPasswordResetCompletionRepository {
  findTokenByHash(
    tokenHash: string,
  ): Promise<IdentityPasswordResetCompletionRecord | null>;

  complete(
    input: IdentityPasswordResetCommitInput,
  ): Promise<IdentityPasswordResetCommitResult>;
}
