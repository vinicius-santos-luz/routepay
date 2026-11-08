import {
  parseApplicationDatabaseTarget,
  type ApplicationDatabaseTarget,
} from "../db/target-policy.ts";

export interface AuthEnvironment {
  database: ApplicationDatabaseTarget;
  baseURL: string;
  secret: string;
  google: { clientId: string; clientSecret: string } | null;
}

export class AuthConfigurationError extends Error {
  constructor() {
    super(
      "A configuração local de autenticação do RoutePay está ausente ou inválida.",
    );
    this.name = "AuthConfigurationError";
  }
}

export function readAuthEnvironment(
  env: Record<string, string | undefined>,
): AuthEnvironment {
  try {
    const database = parseApplicationDatabaseTarget(env.DATABASE_URL);
    const secret = env.BETTER_AUTH_SECRET;
    if (!secret || secret.length < 32 || secret.trim() !== secret)
      throw new AuthConfigurationError();
    const url = new URL(env.BETTER_AUTH_URL ?? "http://localhost:3000");
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new AuthConfigurationError();

    const clientId = env.GOOGLE_CLIENT_ID?.trim() || undefined;
    const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
    if (Boolean(clientId) !== Boolean(clientSecret))
      throw new AuthConfigurationError();

    return {
      database,
      secret,
      baseURL: url.origin,
      google: clientId && clientSecret ? { clientId, clientSecret } : null,
    };
  } catch {
    throw new AuthConfigurationError();
  }
}
