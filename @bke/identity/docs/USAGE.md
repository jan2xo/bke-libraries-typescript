# Using `@bke/identity`

`@bke/identity` is a reusable Identity capability library. It owns Identity contracts, domain logic, providers, PostgreSQL repositories, Prisma schema/migrations, certification tests, and its module manifest.

It does **not** own your application's HTTP routes, cookies, rate limiting, same-origin policy, email transport, UI, deployment topology, or cross-module orchestration. Those stay in the consuming application.

## 1. Install a certified release

BKE currently distributes `@bke/identity` as a certified GitHub Release tarball.

```bash
npm install https://github.com/jan2xo/bke-libraries-typescript/releases/download/identity-v0.1.0/bke-identity-0.1.0.tgz
```

Pin the resolved package in your lockfile. Do not consume a floating branch or copy source files into the application.

Current certified release provenance:

```text
package:   @bke/identity
version:   0.1.0
tag:       identity-v0.1.0
artifact:  bke-identity-0.1.0.tgz
sha256:    4d77587762405e5844fe2a4ad38d16c1bea62ac06ac260696f1c2f3cc1b2cb8d
```

## 2. Understand the package surface

Import only through declared package exports.

```text
@bke/identity/contracts/*
@bke/identity/logic/*
@bke/identity/providers/*
@bke/identity/prisma/repositories/*
@bke/identity/module.manifest
@bke/identity/prisma.config
```

The library intentionally exposes capability factories and their required building blocks instead of a Digital-Solutions-specific application module.

## 3. Compose only the capability you need

A consumer does not need to instantiate every Identity capability.

For example, to use Identity lookup with the library-owned PostgreSQL repository:

```ts
import { createIdentityLookupCapability } from "@bke/identity/logic/identity-service";
import { createPostgresIdentityRepository } from "@bke/identity/prisma/repositories/postgres-identity-repository";

const repository = createPostgresIdentityRepository(process.env.DATABASE_URL!);
const identityLookup = createIdentityLookupCapability(repository);

const result = await identityLookup.findByEmail("person@example.com");

switch (result.status) {
  case "FOUND":
    console.log(result.principal.id);
    break;
  case "NOT_FOUND":
    break;
  case "FAILED":
    throw new Error(result.code);
}
```

The capability contract is versioned independently:

```ts
import { IDENTITY_LOOKUP_CAPABILITY_ID } from "@bke/identity/contracts/identity.contract";

console.log(IDENTITY_LOOKUP_CAPABILITY_ID);
// bke.identity.lookup.v1
```

## 4. Compose authentication explicitly

Providers are also library-owned, but the application chooses how to wire them.

```ts
import { createIdentityPasswordAuthenticationCapability } from "@bke/identity/logic/password-authentication";
import { createArgon2PasswordVerifier } from "@bke/identity/providers/argon2-password-verifier";
import { createPostgresIdentityRepository } from "@bke/identity/prisma/repositories/postgres-identity-repository";

const repository = createPostgresIdentityRepository(process.env.DATABASE_URL!);
const passwordVerifier = createArgon2PasswordVerifier();

const passwordAuthentication = createIdentityPasswordAuthenticationCapability(
  repository,
  passwordVerifier,
);

const result = await passwordAuthentication.authenticate({
  email: "person@example.com",
  password: submittedPassword,
});
```

Your HTTP handler decides how to map that result to redirects, cookies, status codes, rate limits, logging, and presentation.

## 5. Build an application host adapter

Large consumers should create a **thin host adapter** that composes the library into the application's own module/capability system.

The host adapter belongs to the application, not `@bke/identity`.

A simplified pattern:

```ts
import type { CapabilityModule } from "../contracts/capability";
import { IDENTITY_LOOKUP_CAPABILITY_ID } from "@bke/identity/contracts/identity.contract";
import { createIdentityLookupCapability } from "@bke/identity/logic/identity-service";
import { createPostgresIdentityRepository } from "@bke/identity/prisma/repositories/postgres-identity-repository";
import { identityModuleManifest } from "@bke/identity/module.manifest";

export function createIdentityModule(connectionString: string): CapabilityModule {
  const repository = createPostgresIdentityRepository(connectionString);

  return Object.freeze({
    manifest: identityModuleManifest,
    start() {
      return [
        {
          id: IDENTITY_LOOKUP_CAPABILITY_ID,
          value: createIdentityLookupCapability(repository),
        },
      ];
    },
  });
}
```

Digital Solutions follows this model: its `v2/modules/identity/module.ts` is application-owned composition code, while Identity behavior comes from `@bke/identity`.

## 6. Configure source-native TypeScript consumers

`@bke/identity` v0.1.0 is distributed as source-native TypeScript.

A Next.js consumer must transpile the package:

```ts
// next.config.ts
const nextConfig = {
  transpilePackages: ["@bke/identity"],
};

export default nextConfig;
```

Non-Next consumers need an equivalent TypeScript-aware runtime/build pipeline.

## 7. Apply library-owned migrations

Identity owns its Prisma schema and migrations.

The package contains:

```text
prisma/schema.prisma
prisma.config.ts
migrations/
```

For a standalone deployment context, run Prisma against the installed package configuration or copy the migration execution into your deployment orchestrator without changing migration contents.

Inside the library repository:

```bash
cd @bke/identity
DATABASE_URL=postgresql://... npm run prisma:validate
DATABASE_URL=postgresql://... npm run prisma:deploy
```

For an application that composes multiple module-owned migration histories, the host may sequence migrations, but it must not take ownership of Identity migration SQL.

The rule is:

```text
@bke/identity owns migration contents and invariants.
Application deployment owns when/how certified module migrations are sequenced.
```

## 8. Secrets and configuration

The consumer supplies runtime configuration required by the capabilities it chooses to compose.

Examples used by the current Identity implementation include:

```text
DATABASE_URL
session / HMAC secret material
optional MFA encryption key material
```

Do not hardcode these into the library or commit them to the repository.

## 9. What the host still owns

The consuming application owns concerns that are outside Identity domain behavior:

```text
HTTP/request parsing
cookies and browser session transport
same-origin policy
rate limiting
email/SMS delivery
redirects
UI/presentation
application audit/event composition
cross-module orchestration
runtime configuration/deployment
```

For example, Email Verification Issuance returns trusted delivery material. The application decides how that material is sent. Magic Login returns/consumes Identity-owned token semantics; the application owns the web link and redirect experience.

## 10. What consumers should prove

A consumer should **not** re-prove every Identity invariant.

`@bke/identity` already certifies its own logic, persistence, transaction rollback, token isolation, session semantics, MFA behavior, and migration ownership.

A consuming application proves only its composition:

```text
Can the certified package be installed exactly as pinned?
Does the host import only declared package exports?
Are required providers/configuration wired correctly?
Does the application's module adapter expose the right capabilities?
Does the application boot with the package?
Do HTTP/UI adapters map library results correctly?
```

If the library itself changes, certification returns to the library level and a new package version is released.

## 11. Upgrade rule

Treat a new `@bke/identity` version as a deliberate dependency upgrade:

```text
certify library change
→ release immutable package
→ pin new version/artifact in consumer
→ regenerate lockfile
→ run consumer composition CI
→ merge
```

Do not edit copied Identity business logic inside the application. If behavior must change, change and certify `@bke/identity`, release a new version, then upgrade the consumer.
