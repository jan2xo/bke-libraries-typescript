import type { IdentityPrincipal } from "../contracts/identity.contract";

export interface IdentityPasswordAuthenticationRecord {
  readonly principal: IdentityPrincipal;
  readonly passwordHash: string;
  readonly administratorMfaEnabled: boolean;
}

export interface IdentityRepository {
  findById(userId: string): Promise<IdentityPrincipal | null>;
  findByEmail(email: string): Promise<IdentityPrincipal | null>;
  findPasswordAuthenticationByEmail(
    email: string,
  ): Promise<IdentityPasswordAuthenticationRecord | null>;
}
