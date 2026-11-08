import { OrganizationError } from "./errors";

declare const organizationIdBrand: unique symbol;
export type OrganizationId = string & { readonly [organizationIdBrand]: true };
export const organizationStatuses = ["ACTIVE", "INACTIVE"] as const;
export type OrganizationStatus = (typeof organizationStatuses)[number];
export const membershipRoles = ["OWNER", "ADMIN", "OPERATOR"] as const;
export type MembershipRole = (typeof membershipRoles)[number];
export const membershipStatuses = ["ACTIVE", "SUSPENDED", "REMOVED"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];
export const organizationNameMaxLength = 120;

export function parseUuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ) ||
    value === "00000000-0000-0000-0000-000000000000"
  ) {
    throw new OrganizationError("INVALID_INPUT");
  }
  return value.toLowerCase();
}

export function parseOrganizationId(value: unknown): OrganizationId {
  return parseUuid(value) as OrganizationId;
}

export function parseOrganizationName(value: unknown): string {
  if (typeof value !== "string") throw new OrganizationError("INVALID_INPUT");
  const name = value.trim();
  if (
    [...name].length < 1 ||
    [...name].length > organizationNameMaxLength ||
    /[\p{Cc}\p{Cf}\p{Cs}]/u.test(name)
  ) {
    throw new OrganizationError("INVALID_INPUT");
  }
  return name;
}

export interface Organization {
  readonly id: OrganizationId;
  readonly status: OrganizationStatus;
}

export interface OrganizationMembership {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly userId: string;
  readonly role: MembershipRole;
  readonly status: MembershipStatus;
}

/** Aggregate validation complements, but never replaces, database constraints. */
export function assertOrganizationIntegrity(
  organization: Organization,
  memberships: readonly OrganizationMembership[],
) {
  if (
    !organization ||
    typeof organization !== "object" ||
    !Array.isArray(memberships)
  ) {
    throw new OrganizationError("INVALID_INPUT");
  }
  parseOrganizationId(organization.id);
  if (!organizationStatuses.includes(organization.status)) {
    throw new OrganizationError("INVALID_INPUT");
  }
  const users = new Set<string>();
  const ids = new Set<string>();
  for (const member of memberships) {
    if (!member || typeof member !== "object")
      throw new OrganizationError("INVALID_INPUT");
    const userId = parseUuid(member.userId);
    const id = parseUuid(member.id);
    if (
      parseOrganizationId(member.organizationId) !== organization.id ||
      !membershipRoles.includes(member.role) ||
      !membershipStatuses.includes(member.status)
    ) {
      throw new OrganizationError("INVALID_INPUT");
    }
    if (users.has(userId) || ids.has(id)) {
      throw new OrganizationError("DUPLICATE_MEMBERSHIP");
    }
    users.add(userId);
    ids.add(id);
  }
  if (
    organization.status === "ACTIVE" &&
    !memberships.some((m) => m.role === "OWNER" && m.status === "ACTIVE")
  ) {
    throw new OrganizationError("OWNER_REQUIRED");
  }
}

// State rules only. This release exposes no use case that changes these states.
export function assertOrganizationTransition(
  from: OrganizationStatus,
  to: OrganizationStatus,
) {
  if (
    !organizationStatuses.includes(from) ||
    !organizationStatuses.includes(to) ||
    from === to
  ) {
    throw new OrganizationError("INVALID_TRANSITION");
  }
}

export function assertMembershipTransition(
  from: MembershipStatus,
  to: MembershipStatus,
) {
  const transitions: Record<MembershipStatus, readonly MembershipStatus[]> = {
    ACTIVE: ["SUSPENDED", "REMOVED"],
    SUSPENDED: ["ACTIVE", "REMOVED"],
    REMOVED: ["ACTIVE"],
  };
  if (
    !membershipStatuses.includes(from) ||
    !membershipStatuses.includes(to) ||
    !transitions[from].includes(to)
  ) {
    throw new OrganizationError("INVALID_TRANSITION");
  }
}
