import { describe, expect, it } from "vitest";
import { assertDisposablePaymentsPostgres } from "./payment-intent.postgres.guard";

const authorized = { authorization: "payments-library-ci-postgres17-only", githubActions: "true" };
const disposable = "postgresql://bke:bke@localhost:5432/bke_payments_library";

describe("Payment Intent PostgreSQL certification pre-connect guard", () => {
  it("accepts only the explicitly authorized disposable CI target", () => {
    expect(assertDisposablePaymentsPostgres(disposable, authorized)).toBe(disposable);
  });
  it("rejects missing authorization before any pg client can be constructed", () => {
    expect(() => assertDisposablePaymentsPostgres(disposable, { ...authorized, authorization: undefined })).toThrow("PAYMENTS_CERTIFICATION_DISPOSABLE_TARGET_NOT_AUTHORIZED");
    expect(() => assertDisposablePaymentsPostgres(disposable, { ...authorized, githubActions: undefined })).toThrow("PAYMENTS_CERTIFICATION_DISPOSABLE_TARGET_NOT_AUTHORIZED");
  });
  it.each([
    undefined,
    "",
    "postgresql://bke:bke@localhost:5432/postgres",
    "postgresql://bke:bke@localhost:5432/bke_payments_library?schema=public",
    "postgresql://bke:bke@prod.example.com:5432/bke_payments_library",
    "postgresql://admin:secret@localhost:5432/bke_payments_library",
    "postgresql://bke:bke@127.0.0.1:5432/bke_payments_library",
  ])("refuses non-allowlisted target %s", (value) => {
    expect(() => assertDisposablePaymentsPostgres(value, authorized)).toThrow("PAYMENTS_CERTIFICATION_DISPOSABLE_TARGET_NOT_AUTHORIZED");
  });
});
