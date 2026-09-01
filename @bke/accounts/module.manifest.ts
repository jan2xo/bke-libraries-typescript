import { ACCOUNTS_ACCOUNT_ACCESS_CAPABILITY_ID } from "./contracts/account-access.contract";
import { ACCOUNTS_INDIVIDUAL_ACCOUNT_CREATION_CAPABILITY_ID } from "./contracts/individual-account-creation.contract";
import { ACCOUNTS_INVITATION_ACCEPTANCE_CAPABILITY_ID } from "./contracts/invitation-acceptance.contract";
import { ACCOUNTS_INVITATION_EXPIRATION_CAPABILITY_ID } from "./contracts/invitation-expiration.contract";
import { ACCOUNTS_INVITATION_ISSUANCE_CAPABILITY_ID } from "./contracts/invitation-issuance.contract";
import { ACCOUNTS_INVITATION_LIST_CAPABILITY_ID } from "./contracts/invitation-list.contract";
import { ACCOUNTS_INVITATION_RESEND_CAPABILITY_ID } from "./contracts/invitation-resend.contract";
import { ACCOUNTS_INVITATION_REVOCATION_CAPABILITY_ID } from "./contracts/invitation-revocation.contract";
import { ACCOUNTS_MEMBER_LEAVE_CAPABILITY_ID } from "./contracts/member-leave.contract";
import { ACCOUNTS_MEMBERSHIP_REMOVAL_CAPABILITY_ID } from "./contracts/membership-removal.contract";
import { ACCOUNTS_MEMBERSHIP_ROLE_CHANGE_CAPABILITY_ID } from "./contracts/membership-role-change.contract";
import { ACCOUNTS_ORGANIZATION_ACCOUNT_CREATION_CAPABILITY_ID } from "./contracts/organization-account-creation.contract";
import { ACCOUNTS_ORGANIZATION_CLOSE_CAPABILITY_ID } from "./contracts/organization-close.contract";
import { ACCOUNTS_ORGANIZATION_DETAIL_CAPABILITY_ID } from "./contracts/organization-detail.contract";
import { ACCOUNTS_ORGANIZATION_PROFILE_UPDATE_CAPABILITY_ID } from "./contracts/organization-profile-update.contract";
import { ACCOUNTS_OWNERSHIP_TRANSFER_CAPABILITY_ID } from "./contracts/ownership-transfer.contract";
import { ACCOUNTS_SWITCHABLE_ACCOUNT_LIST_CAPABILITY_ID } from "./contracts/switchable-account-list.contract";
import type { AccountsModuleManifest } from "./contracts/module.contract";

export const accountsModuleManifest = Object.freeze({
  moduleId: "accounts",
  needs: [],
  provides: [
    ACCOUNTS_INDIVIDUAL_ACCOUNT_CREATION_CAPABILITY_ID,
    ACCOUNTS_ACCOUNT_ACCESS_CAPABILITY_ID,
    ACCOUNTS_SWITCHABLE_ACCOUNT_LIST_CAPABILITY_ID,
    ACCOUNTS_ORGANIZATION_ACCOUNT_CREATION_CAPABILITY_ID,
    ACCOUNTS_ORGANIZATION_PROFILE_UPDATE_CAPABILITY_ID,
    ACCOUNTS_ORGANIZATION_CLOSE_CAPABILITY_ID,
    ACCOUNTS_ORGANIZATION_DETAIL_CAPABILITY_ID,
    ACCOUNTS_INVITATION_ISSUANCE_CAPABILITY_ID,
    ACCOUNTS_INVITATION_LIST_CAPABILITY_ID,
    ACCOUNTS_INVITATION_RESEND_CAPABILITY_ID,
    ACCOUNTS_INVITATION_REVOCATION_CAPABILITY_ID,
    ACCOUNTS_INVITATION_EXPIRATION_CAPABILITY_ID,
    ACCOUNTS_INVITATION_ACCEPTANCE_CAPABILITY_ID,
    ACCOUNTS_MEMBERSHIP_ROLE_CHANGE_CAPABILITY_ID,
    ACCOUNTS_MEMBERSHIP_REMOVAL_CAPABILITY_ID,
    ACCOUNTS_MEMBER_LEAVE_CAPABILITY_ID,
    ACCOUNTS_OWNERSHIP_TRANSFER_CAPABILITY_ID,
  ],
} as const satisfies AccountsModuleManifest);
