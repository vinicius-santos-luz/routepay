import { describe, expect, it } from "vitest";
import { OrganizationError } from "@/modules/organizations/domain/errors";
import {
  assertMembershipTransition,
  assertOrganizationIntegrity,
  assertOrganizationTransition,
} from "@/modules/organizations/domain/organization";
import { assertOrganizationPermission } from "@/modules/organizations/domain/permissions";
import {
  organizationId,
  userId,
  membershipId,
} from "../fixtures/organizations";

const organization = { id: organizationId, status: "ACTIVE" as const };
const member = {
  id: membershipId,
  organizationId,
  userId,
  role: "OWNER" as const,
  status: "ACTIVE" as const,
};
const invalid = [
  "toString",
  "constructor",
  "__proto__",
  "UNKNOWN",
  "",
  null,
  undefined,
  1,
  true,
  {},
  [],
  Symbol("invalid"),
  Object.create(null),
];

function domainError(operation: () => void, code: OrganizationError["code"]) {
  try {
    operation();
    expect.fail("A entrada inválida deveria ser rejeitada.");
  } catch (error) {
    expect(error).toBeInstanceOf(OrganizationError);
    expect(error).toMatchObject({ code });
  }
}

describe("valores incompatíveis em runtime nunca concedem permissões", () => {
  it.each(invalid.map((value, index) => ({ value, index })))(
    "recusa estados/papéis/ações inválidos, caso $index",
    ({ value }) => {
      domainError(
        () => assertMembershipTransition(value as never, "ACTIVE"),
        "INVALID_TRANSITION",
      );
      domainError(
        () => assertMembershipTransition("ACTIVE", value as never),
        "INVALID_TRANSITION",
      );
      domainError(
        () => assertOrganizationTransition(value as never, "ACTIVE"),
        "INVALID_TRANSITION",
      );
      domainError(
        () => assertOrganizationTransition("ACTIVE", value as never),
        "INVALID_TRANSITION",
      );
      domainError(
        () =>
          assertOrganizationIntegrity(
            { ...organization, status: value as never },
            [member],
          ),
        "INVALID_INPUT",
      );
      domainError(
        () =>
          assertOrganizationPermission(
            userId,
            organization,
            { ...member, role: value as never },
            "READ_BASIC",
          ),
        "ACCESS_DENIED",
      );
      domainError(
        () =>
          assertOrganizationPermission(
            userId,
            organization,
            { ...member, status: value as never },
            "READ_BASIC",
          ),
        "ACCESS_DENIED",
      );
      domainError(
        () =>
          assertOrganizationPermission(
            userId,
            { ...organization, status: value as never },
            member,
            "READ_BASIC",
          ),
        "ACCESS_DENIED",
      );
      domainError(
        () =>
          assertOrganizationPermission(
            userId,
            organization,
            member,
            value as never,
          ),
        "ACCESS_DENIED",
      );
    },
  );
  it.each([null, undefined, true, 1, "ACTIVE"])(
    "recusa entidades incompatíveis %s",
    (value) => {
      domainError(
        () => assertOrganizationIntegrity(value as never, []),
        "INVALID_INPUT",
      );
      domainError(
        () => assertOrganizationIntegrity(organization, value as never),
        "INVALID_INPUT",
      );
      domainError(
        () => assertOrganizationIntegrity(organization, [value as never]),
        "INVALID_INPUT",
      );
      domainError(
        () =>
          assertOrganizationPermission(
            userId,
            value as never,
            member,
            "READ_BASIC",
          ),
        "ACCESS_DENIED",
      );
      domainError(
        () =>
          assertOrganizationPermission(
            userId,
            organization,
            value as never,
            "READ_BASIC",
          ),
        "ACCESS_DENIED",
      );
    },
  );
  it("não autoriza entidades sem identificadores válidos", () => {
    domainError(
      () =>
        assertOrganizationPermission(
          userId,
          { ...organization, id: undefined as never },
          { ...member, organizationId: undefined as never },
          "READ_BASIC",
        ),
      "ACCESS_DENIED",
    );
    domainError(
      () =>
        assertOrganizationPermission(
          userId,
          organization,
          { ...member, id: undefined as never },
          "READ_BASIC",
        ),
      "ACCESS_DENIED",
    );
  });
});
