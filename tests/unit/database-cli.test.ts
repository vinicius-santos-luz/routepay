import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  authEnvironmentFixture,
  migrationEnvironmentFixture,
} from "../fixtures/auth";

const script = fileURLToPath(
  new URL("../../scripts/database.mts", import.meta.url),
);
// No dotenv loader; subprocesses receive only synthetic values and PATH.
function cli(
  command: "target" | "migrate",
  configuration: Record<string, string> = {},
) {
  return spawnSync(process.execPath, [script, command], {
    env: { PATH: process.env.PATH, NODE_ENV: "test", ...configuration },
    encoding: "utf8",
    timeout: 5000,
  });
}

describe("CLI sem credenciais reais, conexões ou migrations", () => {
  it("não recorre à credencial da aplicação quando a própria estiver ausente", () => {
    const result = cli("target", {
      DATABASE_URL: authEnvironmentFixture().DATABASE_URL,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("MIGRATION_DATABASE_URL");
    expect(result.stdout).toBe("");
  });
  it("rejeita routepay_app no executor antes de construir o cliente", () => {
    const result = cli("migrate", {
      MIGRATION_DATABASE_URL: authEnvironmentFixture().DATABASE_URL,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("MIGRATION_DATABASE_URL");
    expect(result.stdout).toBe("");
  });
  it("inspeciona o alvo sem conectar nem revelar a URI", () => {
    const result = cli("target", {
      ...migrationEnvironmentFixture(),
      DATABASE_URL: "invalid-unused-url",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      host: "127.0.0.1",
      port: 5432,
      database: "routepay_dev",
      user: "routepay_migrator",
      migrations: ["0001_better_auth.sql", "0002_organizations.sql"],
    });
    expect(result.stdout).not.toContain("postgresql://");
  });
  it("os scripts não carregam .env.local automaticamente", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    expect(pkg.scripts["db:target"]).toBe("node scripts/database.mts target");
    expect(pkg.scripts["db:migrate"]).toBe("node scripts/database.mts migrate");
  });
});
