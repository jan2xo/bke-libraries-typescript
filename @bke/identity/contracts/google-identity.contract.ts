import type { IdentityPrincipal } from "./identity.contract";
export const IDENTITY_GOOGLE_PRINCIPAL_BINDING_CAPABILITY_ID = "bke.identity.google-principal-binding.v1" as const;
/** Only call with sub from a fully validated Google OIDC ID token. Email is never a linking key. */
export interface IdentityGooglePrincipalBindingCapability {
 bindToUser(input: Readonly<{userId:string;subject:string}>):Promise<IdentityGoogleSubjectBindResult>;
 findPrincipalBySubject(input:Readonly<{subject:string}>):Promise<IdentityGooglePrincipalLookupResult>;
}
export type IdentityGoogleSubjectBindResult=
 |{readonly status:"BOUND"|"ALREADY_BOUND";readonly userId:string}
 |{readonly status:"REJECTED";readonly code:"PRINCIPAL_NOT_FOUND"|"ACCOUNT_NOT_ACTIVE"|"EMAIL_NOT_VERIFIED"|"SUBJECT_ALREADY_BOUND"|"USER_ALREADY_BOUND"}
 |{readonly status:"FAILED";readonly code:"INVALID_INPUT"|"PERSISTENCE_UNAVAILABLE"};
export type IdentityGooglePrincipalLookupResult=
 |{readonly status:"FOUND";readonly principal:IdentityPrincipal}
 |{readonly status:"NOT_FOUND"}
 |{readonly status:"FAILED";readonly code:"INVALID_INPUT"|"PERSISTENCE_UNAVAILABLE"};
