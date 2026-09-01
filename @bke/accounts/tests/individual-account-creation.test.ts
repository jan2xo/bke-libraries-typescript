import { describe, expect, it, vi } from "vitest";
import { createAccountsIndividualAccountCreationCapability } from "../logic/individual-account-creation";
import type { AccountsIndividualAccountCreationRepository } from "../logic/individual-account-creation-repository";

function repository(): AccountsIndividualAccountCreationRepository {
  return {
    createIndividualAccount: vi.fn(async (record) => ({
      id: record.id,
      type: "INDIVIDUAL" as const,
      displayName: record.displayName,
      ownerId: record.ownerId,
      billingEmail: record.billingEmail,
      taxId: null,
      lifecycleState: "ACTIVE" as const,
    })),
  };
}

describe("Accounts individual account creation", () => {
  it("normalizes registration-owned fields and creates an INDIVIDUAL account", async () => {
    const repo = repository();
    const capability = createAccountsIndividualAccountCreationCapability(repo, {
      issue: () => "account-1",
    });

    const result = await capability.create({
      ownerId: " principal-1 ",
      displayName: "  Alice Example  ",
      billingEmail: "  Alice@Example.COM ",
    });

    expect(result).toEqual({
      status: "CREATED",
      account: {
        id: "account-1",
        type: "INDIVIDUAL",
        displayName: "Alice Example",
        ownerId: "principal-1",
        billingEmail: "alice@example.com",
        taxId: null,
        lifecycleState: "ACTIVE",
      },
    });
    expect(repo.createIndividualAccount).toHaveBeenCalledWith({
      id: "account-1",
      ownerId: "principal-1",
      displayName: "Alice Example",
      billingEmail: "alice@example.com",
    });
  });

  it("rejects invalid input before allocating an id or touching persistence", async () => {
    const repo = repository();
    const issue = vi.fn(() => "unused");
    const capability = createAccountsIndividualAccountCreationCapability(repo, { issue });

    await expect(
      capability.create({ ownerId: "", displayName: "A", billingEmail: "not-email" }),
    ).resolves.toEqual({ status: "FAILED", code: "INVALID_INPUT" });
    expect(issue).not.toHaveBeenCalled();
    expect(repo.createIndividualAccount).not.toHaveBeenCalled();
  });

  it("reports id provider failure without touching persistence", async () => {
    const repo = repository();
    const capability = createAccountsIndividualAccountCreationCapability(repo, {
      issue: () => {
        throw new Error("entropy unavailable");
      },
    });

    await expect(
      capability.create({
        ownerId: "principal-1",
        displayName: "Alice Example",
        billingEmail: "alice@example.com",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "ID_PROVIDER_UNAVAILABLE" });
    expect(repo.createIndividualAccount).not.toHaveBeenCalled();
  });

  it("maps persistence errors to a stable capability failure", async () => {
    const repo: AccountsIndividualAccountCreationRepository = {
      createIndividualAccount: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    };
    const capability = createAccountsIndividualAccountCreationCapability(repo, {
      issue: () => "account-1",
    });

    await expect(
      capability.create({
        ownerId: "principal-1",
        displayName: "Alice Example",
        billingEmail: "alice@example.com",
      }),
    ).resolves.toEqual({ status: "FAILED", code: "PERSISTENCE_UNAVAILABLE" });
  });
});
