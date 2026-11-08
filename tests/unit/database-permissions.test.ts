import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../../db/migrations/0001_better_auth.sql", import.meta.url),
  "utf8",
).replace(/--[^\n]*/g, "");

describe("contrato das permissões SQL propostas (sem executar SQL)", () => {
  it("concede exatamente os privilégios esperados, sem histórico, DDL ou grant option", () => {
    const grants = [
      ...sql.matchAll(
        /\bGRANT\s+([\s\S]+?)\s+ON\s+(DATABASE|SCHEMA|TABLE)\s+([\s\S]+?)\s+TO\s+(\w+)\s*;/g,
      ),
    ].flatMap((match) => {
      const privileges = match[1]!
        .split(",")
        .map((value) => value.trim())
        .sort();
      return match[3]!.split(",").map((resource) => ({
        kind: match[2],
        resource: resource.trim(),
        role: match[4],
        privileges,
      }));
    });
    const dml = ["DELETE", "INSERT", "SELECT", "UPDATE"];
    expect(grants).toEqual([
      {
        kind: "DATABASE",
        resource: "routepay_dev",
        role: "routepay_app",
        privileges: ["CONNECT"],
      },
      {
        kind: "SCHEMA",
        resource: "public",
        role: "routepay_app",
        privileges: ["USAGE"],
      },
      {
        kind: "TABLE",
        resource: "public.auth_users",
        role: "routepay_app",
        privileges: ["INSERT", "SELECT", "UPDATE"],
      },
      ...["auth_sessions", "auth_accounts", "auth_verifications"].map(
        (table) => ({
          kind: "TABLE",
          resource: `public.${table}`,
          role: "routepay_app",
          privileges: dml,
        }),
      ),
    ]);
    expect(sql).not.toMatch(/\bGRANT\s+ALL\b/);
    expect(sql).not.toMatch(/\bALTER\s+(ROLE|USER)\b/);
  });
  it("revoga privilégios prévios nos cinco objetos e DDL local", () => {
    const reset = sql.match(
      /REVOKE ALL PRIVILEGES ON TABLE\s+([\s\S]*?)FROM PUBLIC, routepay_app;/,
    )?.[1];
    expect(reset?.split(",").map((value) => value.trim())).toEqual([
      "public.auth_users",
      "public.auth_sessions",
      "public.auth_accounts",
      "public.auth_verifications",
      "public.routepay_schema_migrations",
    ]);
    expect(sql).toContain(
      "REVOKE CREATE, TEMPORARY ON DATABASE routepay_dev FROM PUBLIC, routepay_app;",
    );
    expect(sql).toContain(
      "REVOKE CREATE ON SCHEMA public FROM PUBLIC, routepay_app;",
    );
  });
  it("prepara a negação de privilégios excessivos herdados e não concede papéis", () => {
    expect(sql).toContain(
      "pg_catalog.pg_has_role('routepay_app', 'routepay_migrator', 'MEMBER')",
    );
    expect(sql).toContain(
      "pg_catalog.has_table_privilege('routepay_app', 'public.routepay_schema_migrations'",
    );
    expect(sql).toContain(
      "rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls",
    );
    expect(sql).toContain("RAISE EXCEPTION");
  });
  it("preserva o contrato sem senhas e impede e-mails duplicados por caixa", () => {
    expect(sql).toContain("CHECK (password IS NULL)");
    expect(sql).toContain(
      "CREATE UNIQUE INDEX auth_users_email_lower_idx ON public.auth_users (lower(email));",
    );
  });
});
