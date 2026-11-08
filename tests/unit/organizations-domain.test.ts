import { describe, expect, it } from "vitest";
import {
  assertMembershipTransition,
  assertOrganizationIntegrity,
  assertOrganizationTransition,
  membershipRoles,
  membershipStatuses,
  parseOrganizationId,
  parseOrganizationName,
  type MembershipStatus,
} from "@/modules/organizations/domain/organization";
import {
  assertOrganizationPermission,
  organizationActions,
  permissionMatrix,
} from "@/modules/organizations/domain/permissions";
import {
  membershipId,
  organizationId,
  otherOrganizationId,
  otherUserId,
  userId,
} from "../fixtures/organizations";

const organization = { id: organizationId, status: "ACTIVE" as const };
const member = {
  id: membershipId,
  organizationId,
  userId,
  role: "OWNER" as const,
  status: "ACTIVE" as const,
};

describe("domínio de organizações", () => {
  it.each([
    "",
    null,
    "not-uuid",
    "00000000-0000-0000-0000-000000000000",
    "../another-company",
  ])("recusa identificador inválido %s", (id) => {
    expect(() => parseOrganizationId(id)).toThrow();
  });
  it("valida e normaliza o nome e UUID", () => {
    expect(parseOrganizationName("  Minha empresa  ")).toBe("Minha empresa");
    expect(parseOrganizationId(organizationId.toUpperCase())).toBe(
      organizationId,
    );
    expect(parseOrganizationName("á".repeat(120))).toHaveLength(120);
  });
  it.each([
    "",
    "   ",
    "a".repeat(121),
    "Nome\nOculto",
    "Nome\u200bOculto",
    null,
    123,
  ])("recusa nome inválido %s", (name) => {
    expect(() => parseOrganizationName(name)).toThrow();
  });
  it.each(membershipStatuses)(
    "nega organização ativa sem OWNER ativo (%s)",
    (status) => {
      const members =
        status === "ACTIVE"
          ? [{ ...member, role: "ADMIN" as const }]
          : [{ ...member, status }];
      expect(() => assertOrganizationIntegrity(organization, members)).toThrow(
        expect.objectContaining({ code: "OWNER_REQUIRED" }),
      );
    },
  );
  it("nega organização ativa sem membros", () => {
    expect(() => assertOrganizationIntegrity(organization, [])).toThrow(
      expect.objectContaining({ code: "OWNER_REQUIRED" }),
    );
  });
  it("permite vários proprietários e organização inativa sem proprietário ativo", () => {
    expect(() =>
      assertOrganizationIntegrity(organization, [
        member,
        { ...member, id: otherUserId, userId: otherUserId },
      ]),
    ).not.toThrow();
    expect(() =>
      assertOrganizationIntegrity({ ...organization, status: "INACTIVE" }, []),
    ).not.toThrow();
  });
  it.each(membershipStatuses)(
    "impede vínculo duplicado inclusive em %s",
    (status) => {
      expect(() =>
        assertOrganizationIntegrity(organization, [
          member,
          { ...member, id: otherUserId, status },
        ]),
      ).toThrow(expect.objectContaining({ code: "DUPLICATE_MEMBERSHIP" }));
    },
  );
  it("não aceita vínculo de outra organização no agregado", () => {
    expect(() =>
      assertOrganizationIntegrity(organization, [
        { ...member, organizationId: otherOrganizationId },
      ]),
    ).toThrow();
  });
  it("protege a reativação sem proprietário", () => {
    expect(() =>
      assertOrganizationTransition("INACTIVE", "ACTIVE"),
    ).not.toThrow();
    expect(() => assertOrganizationIntegrity(organization, [])).toThrow();
    expect(() => assertOrganizationTransition("ACTIVE", "ACTIVE")).toThrow();
  });
  const allowed = new Set([
    "ACTIVE:SUSPENDED",
    "ACTIVE:REMOVED",
    "SUSPENDED:ACTIVE",
    "SUSPENDED:REMOVED",
    "REMOVED:ACTIVE",
  ]);
  it.each(
    membershipStatuses.flatMap((from) =>
      membershipStatuses.map((to) => [from, to] as const),
    ),
  )("valida transição %s → %s", (from, to) => {
    if (allowed.has(`${from}:${to}`))
      expect(() => assertMembershipTransition(from, to)).not.toThrow();
    else expect(() => assertMembershipTransition(from, to)).toThrow();
  });
  it("recusa estado desconhecido", () => {
    expect(() =>
      assertMembershipTransition("UNKNOWN" as MembershipStatus, "ACTIVE"),
    ).toThrow();
  });
});

describe("autorização empresarial pura (sem comprovação de RLS)", () => {
  const expected = {
    OWNER: [...organizationActions],
    ADMIN: [
      "READ_BASIC",
      "UPDATE_BASIC",
      "LIST_MEMBERS",
      "MANAGE_OPERATOR",
      "LEAVE",
    ],
    OPERATOR: ["READ_BASIC", "LEAVE"],
  };
  it.each(membershipRoles)("mantém a matriz explícita de %s", (role) => {
    expect(permissionMatrix[role]).toEqual(expected[role]);
    for (const action of organizationActions) {
      const check = () =>
        assertOrganizationPermission(
          userId,
          organization,
          { ...member, role },
          action,
        );
      if ((expected[role] as readonly string[]).includes(action))
        expect(check).not.toThrow();
      else
        expect(check).toThrow(
          expect.objectContaining({ code: "ACCESS_DENIED" }),
        );
    }
  });
  it.each([
    null,
    { ...member, userId: otherUserId },
    { ...member, organizationId: otherOrganizationId },
    { ...member, status: "SUSPENDED" as const },
    { ...member, status: "REMOVED" as const },
  ])(
    "nega ausência de vínculo, outra empresa/usuário e revogação: %s",
    (membership) => {
      expect(() =>
        assertOrganizationPermission(
          userId,
          organization,
          membership,
          "READ_BASIC",
        ),
      ).toThrow(expect.objectContaining({ code: "ACCESS_DENIED" }));
    },
  );
  it.each(membershipRoles)("restringe organização inativa para %s", (role) => {
    const read = () =>
      assertOrganizationPermission(
        userId,
        { ...organization, status: "INACTIVE" },
        { ...member, role },
        "READ_BASIC",
      );
    if (role === "OWNER") expect(read).not.toThrow();
    else expect(read).toThrow();
    expect(() =>
      assertOrganizationPermission(
        userId,
        { ...organization, status: "INACTIVE" },
        { ...member, role },
        "UPDATE_BASIC",
      ),
    ).toThrow();
  });
});
