import type { BetterAuthOptions } from "better-auth";
import type { Pool } from "pg";
import type { AuthEnvironment } from "./environment";

export function buildAuthOptions(env: AuthEnvironment, database: Pool) {
  return {
    appName: "RoutePay",
    telemetry: { enabled: false },
    baseURL: env.baseURL,
    basePath: "/api/auth",
    secret: env.secret,
    database,
    trustedOrigins: [env.baseURL],
    emailAndPassword: { enabled: false },
    disabledPaths: ["/sign-up/email", "/sign-in/email"],
    socialProviders: env.google
      ? {
          google: {
            clientId: env.google.clientId,
            clientSecret: env.google.clientSecret,
            accessType: "online",
            scope: ["openid", "email", "profile"],
          },
        }
      : {},
    user: {
      modelName: "auth_users",
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      deleteUser: { enabled: false },
    },
    session: {
      modelName: "auth_sessions",
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
      },
      expiresIn: 60 * 60 * 8,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: "auth_accounts",
      fields: {
        userId: "user_id",
        accountId: "account_id",
        providerId: "provider_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      encryptOAuthTokens: true,
      storeStateStrategy: "database",
      accountLinking: { enabled: false },
    },
    verification: {
      modelName: "auth_verifications",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: "uuid" },
      useSecureCookies: env.baseURL.startsWith("https://"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    rateLimit: { enabled: true, storage: "memory", window: 60, max: 30 },
    logger: { disabled: true },
    onAPIError: { throw: true },
  } satisfies BetterAuthOptions;
}
