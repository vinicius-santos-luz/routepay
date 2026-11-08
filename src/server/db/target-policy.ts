/** Pure validation shared by the server, migration CLI and tests. Never connects. */
export interface LocalDatabaseTarget {
  connectionString: string;
  host: string;
  port: number;
  database: "routepay_dev";
  user: "routepay_app" | "routepay_migrator";
}

export interface ApplicationDatabaseTarget extends LocalDatabaseTarget {
  user: "routepay_app";
}

export interface MigrationDatabaseTarget extends LocalDatabaseTarget {
  user: "routepay_migrator";
}

export class DatabaseTargetError extends Error {
  constructor(variable: "DATABASE_URL" | "MIGRATION_DATABASE_URL") {
    super(
      `${variable} deve identificar routepay_dev em loopback com o usuário exclusivo da operação, sem parâmetros adicionais.`,
    );
    this.name = "DatabaseTargetError";
  }
}

function parseLocalDatabaseTarget(
  value: string | undefined,
  variable: "DATABASE_URL" | "MIGRATION_DATABASE_URL",
  expectedUser: LocalDatabaseTarget["user"],
): LocalDatabaseTarget {
  try {
    if (!value) throw new DatabaseTargetError(variable);
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const database = decodeURIComponent(url.pathname.slice(1));
    const user = decodeURIComponent(url.username);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "::1"].includes(host) ||
      database !== "routepay_dev" ||
      user !== expectedUser ||
      url.search !== "" ||
      url.hash !== "" ||
      (url.port !== "" && Number(url.port) === 0)
    )
      throw new DatabaseTargetError(variable);

    return {
      connectionString: value,
      host,
      port: url.port ? Number(url.port) : 5432,
      database: "routepay_dev",
      user: expectedUser,
    };
  } catch {
    // Never include the URL, its password or the original parser error.
    throw new DatabaseTargetError(variable);
  }
}

export function parseApplicationDatabaseTarget(
  value: string | undefined,
): ApplicationDatabaseTarget {
  return {
    ...parseLocalDatabaseTarget(value, "DATABASE_URL", "routepay_app"),
    user: "routepay_app",
  };
}

export function parseMigrationDatabaseTarget(
  value: string | undefined,
): MigrationDatabaseTarget {
  return {
    ...parseLocalDatabaseTarget(
      value,
      "MIGRATION_DATABASE_URL",
      "routepay_migrator",
    ),
    user: "routepay_migrator",
  };
}

export class MigrationConfirmationError extends Error {
  constructor() {
    super(
      "Migration não autorizada: confirme explicitamente o nome do banco local do RoutePay.",
    );
  }
}

export function requireMigrationConfirmation(
  target: MigrationDatabaseTarget,
  confirmation: string | undefined,
) {
  const validated = parseMigrationDatabaseTarget(target.connectionString);
  if (confirmation !== validated.database) {
    throw new MigrationConfirmationError();
  }
}
