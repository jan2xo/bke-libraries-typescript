# Google OIDC identity boundary

Digital Solutions verifies Google OIDC at the web host. The host validates the signature, canonical issuer, audience, expiry, nonce, state, and authorization-code/PKCE exchange before calling Identity. The library does not accept a client-supplied Google claim as verified.

The durable identity key is the validated Google subject, not the email address. Email and display name are contact/profile data. Binding does not change the canonical BKE user id, role, email, or email-verification state, and never merges or finds users by email.

For fresh registration, the host creates its customer User and host-owned account/legal records through its existing authorized registration transaction. The host passes the validated subject and transaction-created user id to `createTransactionBoundPostgresGoogleIdentityRepository` using that same transaction client. A conflict rolls back registration atomically. The host owns authorization and transaction commit/rollback; never accept a public request's userId as authority to bind. Existing-account linking must be an explicit authenticated, owner-authorized flow.

A missing binding is not account recovery. Do not link a subject to an existing user because Google returned a matching email. Do not set User.emailVerified from a Google claim. The host applies its own verified contact-email policy separately.

## Recent authentication

Google documents that `auth_time` is available only when the application is published and verified and the session-age claim is enabled; Google Account reauthentication requests are not supported. See [Google Sign in with Google security guidance](https://developers.google.com/identity/siwg/security-bundle). Digital Solutions has no configured Google OAuth client, so this library does not claim fresh Google primary authentication.

Google login alone never sets recent-authentication assurance. A Google session with app MFA receives `MFA_VERIFIED` and no recent-auth timestamp. A Google administrator awaiting app-MFA enrollment must remain on a `GOOGLE_OIDC` BASIC session until enrollment and its required factor proof complete; do not issue a legacy `MFA_ENROLLMENT` session because that method grants recent password-auth assurance. Sensitive actions use a fresh BKE app factor from a single-use `RECENT_AUTH` challenge bound to that exact active Google session and principal. A CUSTOMER with a verified contact email but no enrolled app MFA may use the one-time email factor without enabling MFA. Administrator and recovery-code paths continue to require enrolled app MFA. On successful factor verification, Identity records the completion time as recent authentication.
