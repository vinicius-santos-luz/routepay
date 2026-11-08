import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getSchema } from "better-auth/db";
import { Pool } from "pg";
import { readAuthEnvironment } from "@/server/auth/environment";
import { buildAuthOptions } from "@/server/auth/options";
import { authEnvironmentFixture } from "../fixtures/auth";

const pool = new Pool(); // No queries or connections: schema inspection is pure.
const options = buildAuthOptions(
  readAuthEnvironment(authEnvironmentFixture()),
  pool,
);
const sql = readFileSync(
  new URL("../../db/migrations/0001_better_auth.sql", import.meta.url),
  "utf8",
);

describe("contrato da migration com Better Auth instalado", () => {
  it("cobre exatamente os quatro modelos oficiais configurados", () => {
    const schema = getSchema(options);
    expect(Object.keys(schema).sort()).toEqual([
      "auth_accounts",
      "auth_sessions",
      "auth_users",
      "auth_verifications",
    ]);
    for (const [name, table] of Object.entries(schema)) {
      const definition = sql.match(
        new RegExp(`CREATE TABLE public\\.${name} \\(([\\s\\S]*?)\\n\\);`),
      )?.[1];
      expect(definition, name).toBeDefined();
      expect(definition).toMatch(
        /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
      );
      for (const [field, attributes] of Object.entries(table.fields)) {
        const type = attributes.references
          ? "uuid"
          : (
              {
                string: "text",
                boolean: "boolean",
                date: "timestamptz",
              } as Record<string, string>
            )[String(attributes.type)];
        expect(type, `${name}.${field}`).toBeDefined();
        const column = definition
          ?.split("\n")
          .find((line) => line.trim().startsWith(`${field} `));
        expect(column, `${name}.${field}`).toContain(`${field} ${type}`);
        if (attributes.required)
          expect(column, `${name}.${field}`).toContain("NOT NULL");
        if (attributes.unique)
          expect(column, `${name}.${field}`).toContain("UNIQUE");
        if (attributes.references)
          expect(column).toContain(
            "REFERENCES public.auth_users(id) ON DELETE CASCADE",
          );
        if (attributes.index)
          expect(sql).toContain(`ON public.${name} (${field})`);
      }
    }
  });
  it("mantém sessão no banco, limite de oito horas e proteção de origem", () => {
    expect(options.database).toBe(pool);
    expect(options.session).toMatchObject({
      expiresIn: 28800,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    });
    expect(options.trustedOrigins).toEqual(["http://localhost:3000"]);
    expect(options.advanced.defaultCookieAttributes).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
    });
  });
  it("não habilita senhas, auto-linking, telemetria ou Google fictício", () => {
    expect(options.emailAndPassword.enabled).toBe(false);
    expect(options.account.accountLinking.enabled).toBe(false);
    expect(options.telemetry.enabled).toBe(false);
    expect(options.socialProviders).toEqual({});
    expect(sql).toContain("CHECK (password IS NULL)");
    expect(sql).toContain("UNIQUE (provider_id, account_id)");
  });
});
