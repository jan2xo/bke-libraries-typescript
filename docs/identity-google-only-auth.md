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

Library unit and isolated PostgreSQL certification must execute legitimate existing/new Google binding, wrong/unverified assertion, subject/email collision, concurrent binding, inactive principal, admin assurance, session issuance/validation/revocation, MFA/recent-auth and preserved existing-consumer scenarios. Bind evidence and any package bytes to the exact candidate. A package version is immutable and must be bumped if released.

The Digital Solutions consumer must be implemented separately against an independently certified immutable package. Google Cloud client configuration, real browser sign-in, native Agent/browser handoff, Workers Free resource proof and production release remain separate gates. No live secrets, Google project changes, package publication, merge, production mutation or billing activation is authorized by this document.

Status at creation: acceptance recorded; implementation and certification PENDING. Coding: owner-selected GPT-6 Luna low effort. Primary agent reviews and coordinates.
