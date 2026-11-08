import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  applyLocalMigrations,
  readMigrations,
  type MigrationConnection,
} from "@/server/db/migrations";
import { parseMigrationDatabaseTarget } from "@/server/db/target-policy";
import { migrationEnvironmentFixture } from "../fixtures/auth";

const target = parseMigrationDatabaseTarget(
  migrationEnvironmentFixture().MIGRATION_DATABASE_URL,
);
const migration = {
  name: "0001_test.sql",
  sql: "CREATE TABLE example (id uuid)",
  checksum: "test-checksum",
};

function connection({
  actual = {
    database: "routepay_dev",
    role: "routepay_migrator",
    address: "127.0.0.1",
    version: 180006,
    login_role: "routepay_migrator",
    owner: "routepay_migrator",
    port: 5432,
  } as Record<string, unknown>,
  history = [] as Record<string, unknown>[],
  failMigration = false,
  failRollback = false,
  failCommit = false,
  failInspection = false,
  failure = new Error("SQL rejected"),
} = {}) {
  const query = vi.fn<MigrationConnection["query"]>(async (sql) => {
    if (sql.startsWith("SELECT current_database")) {
      if (failInspection) throw failure;
      return { rows: [actual] };
    }
    if (
      (sql === "ROLLBACK" && failRollback) ||
      (sql === "COMMIT" && failCommit)
    )
      throw new Error("connection-private-detail");
    if (sql.startsWith("SELECT name, checksum")) return { rows: history };
    if (sql === migration.sql && failMigration) throw failure;
    return { rows: [] };
  });
  return { query };
}

describe("migrations locais sem conexões reais", () => {
  it("lê o SQL versionado e calcula seu checksum", async () => {
    const migrations = await readMigrations(
      fileURLToPath(new URL("../../db/migrations", import.meta.url)),
    );
    expect(migrations.map((item) => item.name)).toEqual([
      "0001_better_auth.sql",
      "0002_organizations.sql",
    ]);
    expect(migrations[0]?.name).toBe("0001_better_auth.sql");
    expect(migrations[0]?.checksum).toBe(
      createHash("sha256").update(migrations[0]!.sql).digest("hex"),
    );
  });
  it("exige confirmação antes de qualquer consulta", async () => {
    const client = connection();
    await expect(
      applyLocalMigrations(client, target, undefined, [migration]),
    ).rejects.toThrow("não autorizada");
    expect(client.query).not.toHaveBeenCalled();
  });
  it("consulta o endereço com host(), sem o cast que acrescenta a máscara", async () => {
    const client = connection();
    await applyLocalMigrations(client, target, "routepay_dev", [migration]);
    const inspection = client.query.mock.calls[0]?.[0];
    expect(inspection).toContain(
      "pg_catalog.host(inet_server_addr()) AS address",
    );
    expect(inspection).not.toContain("inet_server_addr()::text AS address");
  });
  it.each(["127.0.0.1", "::1"])(
    "aceita o endereço local normalizado %s",
    async (address) => {
      const client = connection({
        actual: {
          database: "routepay_dev",
          role: "routepay_migrator",
          login_role: "routepay_migrator",
          owner: "routepay_migrator",
          port: 5432,
          version: 180006,
          address,
        },
      });
      await expect(
        applyLocalMigrations(client, target, "routepay_dev", [migration]),
      ).resolves.toEqual([migration.name]);
      expect(client.query).toHaveBeenNthCalledWith(2, "BEGIN");
      expect(client.query).toHaveBeenLastCalledWith("COMMIT");
    },
  );
  it("nega ausência de resultado sem iniciar transação", async () => {
    const client = connection();
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      applyLocalMigrations(client, target, "routepay_dev", [migration]),
    ).rejects.toThrow("não corresponde");
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).not.toHaveBeenCalledWith("BEGIN");
  });
  it.each([
    { database: "arkhe" },
    { role: "postgres" },
    { address: "10.0.0.1" },
    { address: "2001:db8::1" },
    { address: null },
    { address: "127.0.0.1/32" },
    { version: 140000 },
    { version: Number.NaN },
    { version: "180006" },
    { role: "routepay_app" },
    { login_role: "routepay_app" },
    { owner: "other_owner" },
    { port: 6543 },
  ])("nega um servidor divergente antes de DDL: %s", async (override) => {
    const client = connection({
      actual: {
        database: "routepay_dev",
        role: "routepay_migrator",
        address: "127.0.0.1",
        version: 180006,
        login_role: "routepay_migrator",
        owner: "routepay_migrator",
        port: 5432,
        ...override,
      },
    });
    await expect(
      applyLocalMigrations(client, target, "routepay_dev", [migration]),
    ).rejects.toThrow("não corresponde");
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query).not.toHaveBeenCalledWith("BEGIN");
  });
  it("serializa, aplica e registra na mesma transação", async () => {
    const client = connection();
    expect(
      await applyLocalMigrations(client, target, "routepay_dev", [migration]),
    ).toEqual([migration.name]);
    const statements = client.query.mock.calls.map(([sql]) => sql);
    expect(statements[1]).toBe("BEGIN");
    expect(statements[2]).toBe("SELECT pg_advisory_xact_lock($1)");
    expect(statements.indexOf(migration.sql)).toBeGreaterThan(2);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO public.routepay_schema_migrations"),
      [migration.name, migration.checksum],
    );
    expect(statements.at(-1)).toBe("COMMIT");
  });
  it("não repete uma migration já aplicada", async () => {
    const client = connection({
      history: [{ name: migration.name, checksum: migration.checksum }],
    });
    expect(
      await applyLocalMigrations(client, target, "routepay_dev", [migration]),
    ).toEqual([]);
    expect(client.query).not.toHaveBeenCalledWith(migration.sql);
  });
  it.each([
    { history: [{ name: migration.name, checksum: "changed" }] },
    { history: [{ name: "0002_missing.sql", checksum: "unknown" }] },
  ])("rejeita histórico inconsistente e faz rollback", async ({ history }) => {
    const client = connection({ history });
    await expect(
      applyLocalMigrations(client, target, "routepay_dev", [migration]),
    ).rejects.toThrow("checksum");
    expect(client.query).not.toHaveBeenCalledWith(migration.sql);
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
  it("rejeita inserção retroativa fora de ordem", async () => {
    const second = { ...migration, name: "0002_second.sql" };
    const client = connection({
      history: [{ name: second.name, checksum: second.checksum }],
    });
    await expect(
      applyLocalMigrations(client, target, "routepay_dev", [migration, second]),
    ).rejects.toThrow("fora de ordem");
    expect(client.query).not.toHaveBeenCalledWith(migration.sql);
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
  it("não registra aplicação e faz rollback se o SQL falhar", async () => {
    const client = connection({ failMigration: true });
    await expect(
      applyLocalMigrations(client, target, "routepay_dev", [migration]),
    ).rejects.toThrow("SQL rejected");
    expect(
      client.query.mock.calls.some(([sql]) => sql.startsWith("INSERT")),
    ).toBe(false);
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
  it("preserva o erro original mesmo com falha no rollback, sem registrar detalhes", async () => {
    const original = new Error("unit-test-sensitive-sql-detail");
    const client = connection({
      failMigration: true,
      failRollback: true,
      failure: original,
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      applyLocalMigrations(client, target, "routepay_dev", [migration]),
    ).rejects.toBe(original);
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.flat().join(" ")).not.toMatch(
      /unit-test-sensitive|connection-private/,
    );
  });
  it("não inicia transação quando a inspeção falha", async () => {
    const original = new Error("inspection failed");
    const client = connection({ failInspection: true, failure: original });
    await expect(
      applyLocalMigrations(client, target, "routepay_dev", [migration]),
    ).rejects.toBe(original);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
  it("tenta rollback se o resultado de commit não puder ser confirmado", async () => {
    const client = connection({ failCommit: true });
    await expect(
      applyLocalMigrations(client, target, "routepay_dev", [migration]),
    ).rejects.toThrow("connection-private-detail");
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
});
