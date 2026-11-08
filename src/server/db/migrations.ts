import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  requireMigrationConfirmation,
  parseMigrationDatabaseTarget,
  type MigrationDatabaseTarget,
} from "./target-policy.ts";

export interface Migration {
  name: string;
  sql: string;
  checksum: string;
}

export interface MigrationConnection {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export class MigrationSafetyError extends Error {}

export async function readMigrations(directory: string): Promise<Migration[]> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();
  const versions = new Set<string>();
  const migrations: Migration[] = [];
  for (const name of entries) {
    if (
      !/^\d{4}_[a-z0-9_]+\.sql$/.test(name) ||
      versions.has(name.slice(0, 4))
    ) {
      throw new MigrationSafetyError(
        "Nomes ou versões de migrations inválidos.",
      );
    }
    versions.add(name.slice(0, 4));
    const sql = await readFile(join(directory, name), "utf8");
    if (!sql.trim()) throw new MigrationSafetyError("Migration vazia.");
    migrations.push({
      name,
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }
  if (!migrations.length)
    throw new MigrationSafetyError("Nenhuma migration encontrada.");
  return migrations;
}

export async function applyLocalMigrations(
  client: MigrationConnection,
  target: MigrationDatabaseTarget,
  confirmation: string | undefined,
  migrations: Migration[],
): Promise<string[]> {
  requireMigrationConfirmation(target, confirmation);
  const validated = parseMigrationDatabaseTarget(target.connectionString);
  // Read-only inspection must precede every DDL statement, including the history table.
  const actual = (
    await client.query(
      "SELECT current_database() AS database, current_user AS role, session_user AS login_role, pg_catalog.host(inet_server_addr()) AS address, inet_server_port() AS port, current_setting('server_version_num')::integer AS version, pg_get_userbyid(datdba) AS owner FROM pg_catalog.pg_database WHERE datname = current_database()",
    )
  ).rows[0];
  if (
    !actual ||
    actual.database !== validated.database ||
    actual.role !== validated.user ||
    actual.login_role !== validated.user ||
    actual.owner !== validated.user ||
    Number(actual.port) !== validated.port ||
    !["127.0.0.1", "::1"].includes(String(actual.address)) ||
    !Number.isInteger(actual.version) ||
    Number(actual.version) < 180000
  ) {
    throw new MigrationSafetyError(
      "O servidor não corresponde ao alvo local RoutePay esperado (PostgreSQL 18+, routepay_dev e routepay_migrator).",
    );
  }

  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock($1)", [0x52545059]);
    await client.query(`CREATE TABLE IF NOT EXISTS public.routepay_schema_migrations (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const history = (
      await client.query(
        "SELECT name, checksum FROM public.routepay_schema_migrations ORDER BY name",
      )
    ).rows;
    for (const applied of history) {
      const source = migrations.find(
        (migration) => migration.name === applied.name,
      );
      if (!source || source.checksum !== applied.checksum) {
        throw new MigrationSafetyError(
          "Histórico ausente ou checksum alterado; nenhuma migration será aplicada.",
        );
      }
    }
    const pending = migrations.filter(
      (migration) =>
        !history.some((applied) => applied.name === migration.name),
    );
    if (
      pending.some((migration) =>
        history.some((applied) => String(applied.name) > migration.name),
      )
    ) {
      throw new MigrationSafetyError(
        "Migration fora de ordem; nenhuma migration será aplicada.",
      );
    }
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO public.routepay_schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
    }
    await client.query("COMMIT");
    return pending.map((migration) => migration.name);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      console.error(
        "[RoutePay] Não foi possível confirmar o rollback. Verifique o histórico antes de tentar novamente.",
      );
    }
    throw error;
  }
}
