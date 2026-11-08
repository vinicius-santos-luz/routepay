import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(
  new URL("../../db/migrations/0002_organizations.sql", import.meta.url),
  "utf8",
);
const sql = raw.replace(/--[^\n]*/g, "");

describe("contrato estrutural do SQL de organizações (não executa SQL)", () => {
  it("preserva exatamente a migration Better Auth aplicada", () => {
    const first = readFileSync(
      new URL("../../db/migrations/0001_better_auth.sql", import.meta.url),
    );
    expect(createHash("sha256").update(first).digest("hex")).toBe(
      "9fc3fc47f41c6bd5f864539fee7426ba7380a00cc17abef2b3e7920979424ec1",
    );
    expect(sql).not.toMatch(/(?:ALTER|CREATE|DROP)\s+TABLE\s+public\.auth_/i);
    expect(sql).not.toMatch(
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.auth_/i,
    );
  });
  it("prepara duas tabelas UUID, estados, FKs restritivas e unicidade vitalícia", () => {
    expect(sql.match(/CREATE TABLE public\./g)).toHaveLength(2);
    expect(
      sql.match(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/g),
    ).toHaveLength(2);
    expect(sql.match(/ON UPDATE RESTRICT ON DELETE RESTRICT/g)).toHaveLength(3);
    expect(sql).toContain("UNIQUE (organization_id, user_id)");
    expect(sql).toContain("status IN ('ACTIVE', 'INACTIVE')");
    expect(sql).toContain("role IN ('OWNER', 'ADMIN', 'OPERATOR')");
    expect(sql).toContain("status IN ('ACTIVE', 'SUSPENDED', 'REMOVED')");
    expect(sql).not.toMatch(
      /ON DELETE CASCADE|CREATE UNIQUE INDEX[^;]+active_owners/is,
    );
  });
  it("serializa escrita de vínculo no pai e valida estado final por triggers adiados", () => {
    expect(sql).toMatch(
      /UPDATE public\.organizations AS o SET lock_version = o\.lock_version \+ 1\s+WHERE o\.id = NEW\.organization_id/,
    );
    expect(sql.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2);
    expect(sql).toMatch(/AFTER INSERT OR UPDATE ON public\.organizations/);
    expect(sql).toMatch(
      /AFTER INSERT OR UPDATE ON public\.organization_memberships/,
    );
    expect(sql).toContain("WHERE m.organization_id = organization_uuid");
    expect(sql).toContain("m.role = 'OWNER' AND m.status = 'ACTIVE'");
    expect(sql.match(/IF TG_OP = 'DELETE' THEN/g)).toHaveLength(2);
  });
  it("expõe somente criação com identidade verificada no contexto, sem argumento de ator ou papel", () => {
    expect(sql).toContain(
      "routepay_create_organization(organization_name text)",
    );
    expect(sql).toContain("actor_uuid uuid := public.routepay_current_actor()");
    expect(sql).toContain("session_user <> 'routepay_app'");
    expect(sql).toContain("WHERE u.id = actor_uuid AND u.email_verified");
    expect(sql).toContain(
      "VALUES (organization_uuid, actor_uuid, 'OWNER', 'ACTIVE')",
    );
    expect(sql).not.toMatch(
      /\bEXECUTE\s+(?:format|organization_name|actor_text)/i,
    );
    const creation = sql.slice(
      sql.indexOf("CREATE FUNCTION public.routepay_create_organization("),
    );
    expect(creation.indexOf("INSERT INTO public.organizations")).toBeLessThan(
      creation.indexOf("INSERT INTO public.organization_memberships"),
    );
  });
  it("restringe EXECUTE e fixa search_path em todas as funções", () => {
    const functions = [
      ...sql.matchAll(/CREATE FUNCTION public\.(\w+)\([\s\S]*?\$body\$;/g),
    ].map(([definition]) => definition);
    expect(functions).toHaveLength(5);
    for (const definition of functions)
      expect(definition).toContain("SET search_path = pg_catalog, pg_temp");
    expect(sql).toMatch(
      /REVOKE ALL PRIVILEGES ON FUNCTION[\s\S]+FROM PUBLIC, routepay_app;/,
    );
    const grants = [...sql.matchAll(/^GRANT\s+([\s\S]+?);/gm)].map(
      ([statement]) => statement.replace(/\s+/g, " "),
    );
    expect(grants).toEqual([
      "GRANT SELECT ON TABLE public.organizations, public.organization_memberships TO routepay_app;",
      "GRANT EXECUTE ON FUNCTION public.routepay_current_actor(), public.routepay_create_organization(text) TO routepay_app;",
    ]);
    expect(sql).toContain(
      "'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, SELECT WITH GRANT OPTION'",
    );
    expect(sql).toContain("public.routepay_schema_migrations");
    expect(sql).not.toMatch(/\bGRANT ALL|\bALTER ROLE|\bALTER USER/);
  });
  it("ativa RLS sem recursão nem políticas de escrita abertas", () => {
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(2);
    const membershipPolicy = sql.match(
      /CREATE POLICY organization_memberships_read_self[\s\S]+?;/,
    )?.[0];
    expect(membershipPolicy).toContain(
      "user_id = public.routepay_current_actor() AND status = 'ACTIVE'",
    );
    expect(membershipPolicy).not.toMatch(/\b(?:EXISTS|FROM)\b/);
    expect(sql).not.toMatch(
      /CREATE POLICY[^;]+FOR (?:INSERT|UPDATE|DELETE|ALL)/is,
    );
  });
});
