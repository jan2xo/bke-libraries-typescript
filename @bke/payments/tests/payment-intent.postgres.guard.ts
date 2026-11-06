/**
 * A purpose-built pre-connect allowlist for this destructive Payments certification.
 * This script ONLY runs against the ephemeral PostgreSQL service declared in payments.yml.
 * Production/remote/default databases cannot be certified by passing DATABASE_URL alone.
 */
export function assertDisposablePaymentsPostgres(
  connectionString: string | undefined,
  environment: { readonly authorization?: string; readonly githubActions?: string },
): string {
  const expected = "postgresql://bke:bke@localhost:5432/bke_payments_library";
  if (environment.authorization !== "payments-library-ci-postgres17-only" || environment.githubActions !== "true") {
    throw new Error("PAYMENTS_CERTIFICATION_DISPOSABLE_TARGET_NOT_AUTHORIZED");
  }
  // Do not accept alternative hosts, credentials, databases, ports or query-string overrides.
  if (connectionString !== expected) {
    throw new Error("PAYMENTS_CERTIFICATION_DISPOSABLE_TARGET_NOT_AUTHORIZED");
  }
  return expected;
}
