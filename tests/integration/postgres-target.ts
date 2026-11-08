export const integrationTarget = Object.freeze({
  host: "127.0.0.1",
  port: 5433,
  database: "routepay_dev",
  cluster: "18/routepay_test",
  owner: "routepay_migrator",
});
export type IntegrationRole = "routepay_app" | "routepay_migrator";

export const identityQuery = `SELECT current_database() AS database,
  current_user AS role, session_user AS login_role,
  pg_catalog.host(inet_server_addr()) AS address, inet_server_port() AS port,
  current_setting('server_version_num')::integer AS version,
  current_setting('cluster_name', true) AS cluster,
  current_setting('server_encoding') AS encoding,
  current_setting('standard_conforming_strings') AS standard_strings,
  pg_get_userbyid(d.datdba) AS owner, pg_backend_pid() AS pid,
  r.rolsuper AS superuser, r.rolbypassrls AS bypassrls,
  r.rolcreatedb AS createdb, r.rolcreaterole AS createrole, r.rolreplication AS replication
FROM pg_catalog.pg_database AS d JOIN pg_catalog.pg_roles AS r ON r.rolname = current_user
WHERE d.datname = current_database()`;

export class IntegrationSafetyError extends Error {
  constructor() {
    super("Alvo de testes ou isolamento incompatível; execução interrompida.");
  }
}

export function verifyIdentity(
  row: Record<string, unknown> | undefined,
  role: IntegrationRole,
) {
  if (
    !row ||
    row.database !== integrationTarget.database ||
    row.role !== role ||
    row.login_role !== role ||
    row.owner !== integrationTarget.owner ||
    row.address !== integrationTarget.host ||
    row.port !== integrationTarget.port ||
    row.cluster !== integrationTarget.cluster ||
    !Number.isInteger(row.version) ||
    Number(row.version) < 180000 ||
    row.encoding !== "UTF8" ||
    row.standard_strings !== "on" ||
    row.superuser !== false ||
    row.bypassrls !== false ||
    row.createdb !== false ||
    row.createrole !== false ||
    row.replication !== false ||
    !Number.isInteger(row.pid)
  ) {
    throw new IntegrationSafetyError();
  }
  return {
    host: integrationTarget.host,
    port: integrationTarget.port,
    database: integrationTarget.database,
    role,
    owner: integrationTarget.owner,
    cluster: integrationTarget.cluster,
    version: Number(row.version),
    pid: Number(row.pid),
  };
}
