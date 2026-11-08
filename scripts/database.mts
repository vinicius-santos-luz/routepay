import { fileURLToPath } from "node:url";
import { Client } from "pg";
import {
  DatabaseTargetError,
  MigrationConfirmationError,
  parseMigrationDatabaseTarget,
  requireMigrationConfirmation,
} from "../src/server/db/target-policy.ts";
import {
  applyLocalMigrations,
  MigrationSafetyError,
  readMigrations,
} from "../src/server/db/migrations.ts";

async function main() {
  const command = process.argv[2];
  if (command !== "target" && command !== "migrate") {
    throw new MigrationSafetyError("Use db:target ou db:migrate.");
  }
  const target = parseMigrationDatabaseTarget(
    process.env.MIGRATION_DATABASE_URL,
  );
  const migrations = await readMigrations(
    fileURLToPath(new URL("../db/migrations", import.meta.url)),
  );
  console.log(
    JSON.stringify(
      {
        host: target.host,
        port: target.port,
        database: target.database,
        user: target.user,
        migrations: migrations.map((migration) => migration.name),
      },
      null,
      2,
    ),
  );
  if (command === "target") return; // No connection and no SQL in this command.

  const confirmation = process.argv
    .slice(3)
    .find((value) => value.startsWith("--confirm-local="))
    ?.slice("--confirm-local=".length);
  requireMigrationConfirmation(target, confirmation);
  const client = new Client({
    connectionString: target.connectionString,
    connectionTimeoutMillis: 2000,
    statement_timeout: 10000,
    query_timeout: 15000,
  });
  try {
    await client.connect();
    const applied = await applyLocalMigrations(
      client,
      target,
      confirmation,
      migrations,
    );
    console.log(
      applied.length
        ? `Migrations aplicadas: ${applied.join(", ")}`
        : "Banco local já atualizado.",
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  // Only our own validation errors are safe to display. Driver errors can contain secrets.
  console.error(
    error instanceof MigrationSafetyError ||
      error instanceof DatabaseTargetError ||
      error instanceof MigrationConfirmationError
      ? error.message
      : "Não foi possível executar a operação no PostgreSQL local do RoutePay. Nenhum detalhe de conexão foi registrado.",
  );
  process.exitCode = 1;
});
