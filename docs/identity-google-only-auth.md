# Google-only Digital Solutions identity prerequisite

Owner correction (2026-11-03): Digital Solutions uses Google sign-in and does not collect or authenticate account passwords. This supersedes the password/Argon2 requirement of the Workers handoff; the Workers migration remains a separate intent.

Starting canonical library source: d541638650cf8274356cbfce9141f6592c1f4e9c. Existing draft PR79 is reference material only: its email-based automatic linking and password-only admin restriction do not satisfy the current requirement. Preserve that work and unrelated certified capabilities.

## Accepted library result

- Add canonical Google federated principal binding using a stable validated provider subject, preserving BKE User.id as identity. The host owns Google OIDC verification (signature, issuer, audience, expiry, nonce, authorization-code/PKCE/state); the library must not treat a client-supplied identity claim as verified.
- Preserve lifecycle/account authorization and transactional uniqueness. Do not silently link an unbound Google subject to an existing user merely because email matches. A fresh account may be created only through the canonical authorized registration path with CUSTOMER as the default role. Administrator role assignment remains an explicit owner action.
- Represent Google authentication and subsequent verified application MFA/recent authentication honestly in the shared session contracts. Do not label Google sessions PASSWORD or MAGIC_LINK, and do not assume Google login alone proves application MFA.
- Preserve admin MFA, recent-auth safeguards, session revocation and commercial/license contracts. Google-only Digital Solutions must not expose password signup/login/reset/change fallback. Other library consumers' existing password capabilities remain supported.
- Make only necessary additive identity persistence/migration changes; do not rewrite history or perform unrelated Prisma hardening. This is the concrete authentication requirement for any new external-identity mapping/session enum.

## Required proof and boundaries

Library unit and isolated PostgreSQL certification must execute legitimate existing/new Google binding, unbound and malformed subject handling, subject/email collision, concurrent binding, inactive principal, admin assurance, session issuance/validation/revocation, MFA/recent-auth and preserved existing-consumer scenarios. Bind evidence and any package bytes to the exact candidate. A package version is immutable and must be bumped if released.

The Digital Solutions consumer must be implemented separately against an independently certified immutable package. Google Cloud client configuration, real browser sign-in, native Agent/browser handoff, Workers Free resource proof and production release remain separate gates. No live secrets, Google project changes, package publication, merge, production mutation or billing activation is authorized by this document.

## Approved fresh application-factor policy

Owner approval: sensitive actions for Google-authenticated accounts use a fresh BKE factor challenge bound to the exact active session and principal. The public Google challenge request supplies only the opaque session token; Identity validates it and derives user/session identifiers from persisted state. Challenges are expiring, single-use, attempt-limited, and the completion transaction checks active session, principal lifecycle, challenge binding, and recovery-code consumption.

Ordinary Google sign-in is BASIC. Google sign-in followed by app MFA is MFA_VERIFIED without a recent-auth timestamp. Successful fresh BKE factor completion records recent application authentication; it does not claim fresh Google Account authentication. Verified-contact CUSTOMER accounts may use email OTP without enabling or enrolling MFA. A verified-contact Google ADMIN without enrolled MFA may use email OTP only for MFA enrollment; completion records recent application-factor verification while mfaVerifiedAt remains null and does not enable MFA. Pending, expired or explicitly disabled enrollment records do not count as enabled MFA; a fresh verified-contact app factor may refresh recent authentication and let first enrollment resume. Still-enabled MFA always requires its enrolled factor and never falls back to email OTP. The receiving host must require enabled, verified MFA for every other protected administrator operation. Recovery requires enrolled MFA. Freshly verified factors for enrolled MFA principals may refresh mfaVerifiedAt; unenrolled customers remain unenrolled.

Google documents that account reauthentication requests are unsupported and that auth_time needs a published and verified application with session-age claims enabled: https://developers.google.com/identity/siwg/security-bundle. Do not infer primary authentication freshness from ID-token iat, authorization-code timing, or prompt parameters.

The receiving web host remains responsible for the OIDC callback, state, nonce, PKCE, one-time code consumption, signature, canonical issuer, audience, and expiry validation. The identity library accepts only a validated stable subject; it does not validate raw Google assertions. The client ID is public configuration; no client secret is stored here. Real browser sign-in remains unverified until the host has its configured client and passes the receiving-path test.

Status: source candidate and Actions certification pending. Coding: owner-selected GPT-6 Luna low effort. Primary agent reviews and coordinates.


## Emergency enrollment

A scoped owner-token emergency enrollment remains separate from email OTP. It requires the existing authorized owner recovery token and a recently verified BKE app factor, atomically consumes the authorization, enables MFA, and revokes prior sessions. For a Google principal, the replacement session retains `GOOGLE_OIDC`; `mfaVerifiedAt` reflects the completed enrollment, while `recentAuthenticatedAt` preserves the timestamp of the preceding app factor. The owner token is never labeled as an email OTP.

The receiving Digital Solutions normal enrollment adapter must also preserve the verified Google session family; the current library emergency enrollment preserves it, while the consumer's ordinary enrollment path remains a separate receiving-path verification gate.