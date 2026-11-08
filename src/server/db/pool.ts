import "server-only";
import { Pool } from "pg";
import {
  parseApplicationDatabaseTarget,
  type ApplicationDatabaseTarget,
} from "./target-policy";

let authPool: Pool | undefined;

export function getAuthPool(target: ApplicationDatabaseTarget): Pool {
  const validated = parseApplicationDatabaseTarget(target.connectionString);
  if (!authPool) {
    authPool = new Pool({
      connectionString: validated.connectionString,
      options: "-c search_path=public",
      max: 3,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 10000,
      statement_timeout: 5000,
      query_timeout: 5000,
      allowExitOnIdle: true,
    });
    authPool.on("error", () => {
      console.error("[RoutePay] Conexão de autenticação indisponível.");
    });
  }
  return authPool;
}
