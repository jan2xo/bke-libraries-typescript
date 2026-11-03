# Google OIDC identity boundary

Digital Solutions verifies Google OIDC at the web host. The host validates the signature, canonical issuer, audience, expiry, nonce, state, and authorization-code/PKCE exchange before calling Identity. The library does not accept a client-supplied Google claim as verified.

The durable identity key is the validated Google subject, not the email address. Email and display name are contact/profile data. Binding does not change the canonical BKE user id, role, email, or email-verification state, and never merges or finds users by email.

For fresh registration, the host creates its customer User and host-owned account/legal records through its existing authorized registration transaction. The host passes the validated subject and transaction-created user id to `createTransactionBoundPostgresGoogleIdentityRepository` using that same transaction client. A conflict rolls back registration atomically. The host owns authorization and transaction commit/rollback; never accept a public request's userId as authority to bind. Existing-account linking must be an explicit authenticated, owner-authorized flow.

A missing binding is not account recovery. Do not link a subject to an existing user because Google returned a matching email. Do not set User.emailVerified from a Google claim. The host applies its own verified contact-email policy separately.

## Recent authentication

Google documents that `auth_time` is available only when the application is published and verified and the session-age claim is enabled; Google Account reauthentication requests are not supported. See [Google Sign in with Google security guidance](https://developers.google.com/identity/siwg/security-bundle). Digital Solutions does not yet have a configured Google OAuth client, so this library work does not certify that the consumer can obtain fresh Google authentication claims.

Identity must not infer freshness from ID-token `iat`, code issuance time, or prompt parameters. Google sessions with app MFA are marked MFA_VERIFIED but do not receive a recent-auth timestamp from login alone. A Google recent-auth path remains pending an owner-approved policy that can be supported and verified with the actual client configuration.
