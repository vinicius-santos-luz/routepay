import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PostgresOrganizationRepository } from "@/modules/organizations/infrastructure/postgres-organization-repository";
import {
  actor,
  organizationConnection,
  organizationId,
  organizationRow,
  otherOrganizationId,
  otherUserId,
  userId,
} from "../fixtures/organizations";

describe("repositório PostgreSQL com respostas simuladas, sem banco", () => {
  it("cria com uma função parametrizada e consulta o OWNER na mesma transação", async () => {
    const name = "Empresa ' ; --";
    const db = organizationConnection(async (sql) => {
      if (sql.includes("routepay_create_organization"))
        return [{ id: organizationId }];
      if (sql.includes("FROM public.organizations"))
        return [organizationRow({ name })];
      return [];
    });
    const result = await new PostgresOrganizationRepository(
      () => db.pool,
    ).create(await actor(), name);
    expect(result).toMatchObject({
      id: organizationId,
      role: "OWNER",
      version: "2",
    });
    expect(db.query).toHaveBeenCalledWith(
      "SELECT public.routepay_create_organization($1::text) AS id",
      [name],
    );
    expect(db.query.mock.calls.flatMap(([sql]) => sql)).not.toContain(name);
    expect(db.connect).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("AND o.id = $2::uuid"),
      [userId, organizationId],
    );
    expect(db.query).toHaveBeenCalledWith("COMMIT");
  });
  it("faz rollback quando o OWNER não pode ser lido após criação", async () => {
    const db = organizationConnection(async (sql) =>
      sql.includes("routepay_create_organization")
        ? [{ id: organizationId }]
        : [],
    );
    await expect(
      new PostgresOrganizationRepository(() => db.pool).create(
        await actor(),
        "Empresa",
      ),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(db.query).toHaveBeenCalledWith("ROLLBACK");
    expect(db.query).not.toHaveBeenCalledWith("COMMIT");
  });
  it("sempre filtra usuário e estado e retorna somente DTO mínimo", async () => {
    const db = organizationConnection(async (sql) =>
      sql.includes("FROM public.organizations")
        ? [
            organizationRow({
              email: "private@example.invalid",
              token: "private-test-token",
            }),
          ]
        : [],
    );
    const result = await new PostgresOrganizationRepository(() => db.pool).list(
      await actor(),
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "WHERE m.user_id = $1::uuid AND m.status = 'ACTIVE'",
      ),
      [userId],
    );
    expect(result[0]).not.toHaveProperty("email");
    expect(result[0]).not.toHaveProperty("token");
    expect(result[0]).not.toHaveProperty("member_user_id");
  });
  it("reconsulta acesso após revogação simulada sem cache de membership", async () => {
    let revoked = false;
    const db = organizationConnection(async (sql) =>
      sql.includes("FROM public.organizations") && !revoked
        ? [organizationRow()]
        : [],
    );
    const repository = new PostgresOrganizationRepository(() => db.pool);
    const context = await actor();
    expect(await repository.find(context, organizationId)).not.toBeNull();
    revoked = true;
    expect(await repository.find(context, organizationId)).toBeNull();
    expect(db.connect).toHaveBeenCalledTimes(2);
  });
  it.each([
    { member_user_id: otherUserId },
    { id: otherOrganizationId },
    { status: "INACTIVE", role: "ADMIN" },
  ])("recusa resposta fora do contexto autorizado %s", async (override) => {
    const db = organizationConnection(async (sql) =>
      sql.includes("FROM public.organizations")
        ? [organizationRow(override)]
        : [],
    );
    await expect(
      new PostgresOrganizationRepository(() => db.pool).find(
        await actor(),
        organizationId,
      ),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(db.query).not.toHaveBeenCalledWith("COMMIT");
  });
  it("não usa fallback se tabela, privilégio ou banco estiver indisponível", async () => {
    const db = organizationConnection(async (sql) => {
      if (sql.includes("FROM public.organizations"))
        throw new Error("private-schema-detail");
      return [];
    });
    await expect(
      new PostgresOrganizationRepository(() => db.pool).list(await actor()),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(db.query).toHaveBeenCalledWith("ROLLBACK");
  });
});
