import type {
  IdentityFederatedProvider,
  IdentityVerifiedFederatedAssertion,
} from "../contracts/federated-authentication.contract";
import type { IdentityPrincipal } from "../contracts/identity.contract";

export type IdentityFederatedBindingRecord = Readonly<{
  principal: IdentityPrincipal;
  provider: IdentityFederatedProvider;
  subject: string;
}>;

export type IdentityFederatedLinkResult =
  | { readonly status: "LINKED"; readonly principal: IdentityPrincipal }
  | { readonly status: "EXISTING"; readonly principal: IdentityPrincipal }
  | { readonly status: "CONFLICT" };

export interface IdentityFederatedAuthenticationRepository {
  findByProviderSubject(
    provider: IdentityFederatedProvider,
    subject: string,
  ): Promise<IdentityFederatedBindingRecord | null>;
  findPrincipalByEmail(email: string): Promise<IdentityPrincipal | null>;
  linkExistingByVerifiedEmail(input: {
    readonly userId: string;
    readonly assertion: IdentityVerifiedFederatedAssertion;
  }): Promise<IdentityFederatedLinkResult>;
  recordAuthentication(input: {
    readonly provider: IdentityFederatedProvider;
    readonly subject: string;
    readonly email: string;
    readonly authenticatedAt: Date;
  }): Promise<void>;
}
