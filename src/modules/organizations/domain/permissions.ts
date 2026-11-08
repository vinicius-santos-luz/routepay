import { OrganizationError } from "./errors";
import {
  parseUuid,
  parseOrganizationId,
  membershipRoles,
  organizationStatuses,
  type MembershipRole,
  type Organization,
  type OrganizationMembership,
} from "./organization";

export const organizationActions = [
  "READ_BASIC",
  "UPDATE_BASIC",
  "LIST_MEMBERS",
  "MANAGE_OPERATOR",
  "MANAGE_ADMIN",
  "MANAGE_OWNERSHIP",
  "DEACTIVATE",
  "REACTIVATE",
  "LEAVE",
] as const;
export type OrganizationAction = (typeof organizationActions)[number];

/** Authorization ceiling; only READ_BASIC is exposed for existing organizations. */
export const permissionMatrix: Readonly<
  Record<MembershipRole, readonly OrganizationAction[]>
> = {
  OWNER: organizationActions,
  ADMIN: [
    "READ_BASIC",
    "UPDATE_BASIC",
    "LIST_MEMBERS",
    "MANAGE_OPERATOR",
    "LEAVE",
  ],
  OPERATOR: ["READ_BASIC", "LEAVE"],
};

export function assertOrganizationPermission(
  actorId: string,
  organization: Organization,
  membership: OrganizationMembership | null,
  action: OrganizationAction,
) {
  if (
    !organization ||
    typeof organization !== "object" ||
    !membership ||
    typeof membership !== "object" ||
    !organizationStatuses.includes(organization.status) ||
    !membershipRoles.includes(membership.role) ||
    !organizationActions.includes(action) ||
    membership.userId !== parseUuid(actorId) ||
    membership.organizationId !== organization.id ||
    membership.status !== "ACTIVE" ||
    !permissionMatrix[membership.role].includes(action) ||
    (organization.status !== "ACTIVE" &&
      !(
        organization.status === "INACTIVE" &&
        membership.role === "OWNER" &&
        (action === "READ_BASIC" || action === "REACTIVATE")
      ))
  ) {
    throw new OrganizationError("ACCESS_DENIED");
  }
  try {
    parseOrganizationId(organization.id);
    parseUuid(membership.id);
    parseOrganizationId(membership.organizationId);
  } catch {
    throw new OrganizationError("ACCESS_DENIED");
  }
}
