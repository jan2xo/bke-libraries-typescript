# Google OIDC identity boundary

Digital Solutions verifies Google OIDC at the web host. The host validates the signature, canonical issuer, audience, expiry, nonce, state, and authorization-code/PKCE exchange before calling Identity. The library does not accept a client-supplied Google claim as verified.

The durable identity key is the validated Google subject, not the email address. Email and display name are contact/profile data. Binding does not change the canonical BKE user id, role, email, or email-verification state, and never merges or finds users by email.

For fresh registration, the host creates its customer User and host-owned account/legal records through its existing authorized registration transaction. Its IdentityGoogleIdentityRepository adapter must bind the verified subject using that same transaction client, so a conflict rolls back the registration atomically. Never accept a public request's userId as authority to bind. Existing-account linking must be an explicit authenticated, owner-authorized flow.

The standalone PostgreSQL implementation is used by Identity certification. Consumers that need to join a larger registration transaction implement the repository port against their transaction client; they must not call the standalone adapter from inside an uncommitted host transaction.

A missing binding is not account recovery. Do not link a subject to an existing user because Google returned a matching email. Do not set User.emailVerified from a Google claim. The host applies its own verified contact-email policy separately.
