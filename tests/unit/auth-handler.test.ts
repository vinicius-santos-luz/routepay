import { createHmac } from "node:crypto";
import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { readAuthEnvironment } from "@/server/auth/environment";
import { buildAuthOptions } from "@/server/auth/options";
import {
  handleAuthRequest,
  verifySignOutResponse,
} from "@/server/auth/http-policy";
import { authEnvironmentFixture } from "../fixtures/auth";

function instance(skipSchemaInspection = true) {
  const environment = readAuthEnvironment(authEnvironmentFixture());
  const pool = new Pool();
  // Reject before the driver can open a socket. These are real Better Auth handlers,
  // but never a real PostgreSQL connection, Google request or application login.
  const connect = vi
    .spyOn(pool, "connect")
    .mockRejectedValue(new Error("database-private-detail"));
  const options = buildAuthOptions(environment, pool);
  // Isolate request validation from live schema introspection in these unit tests.
  // The failure test below keeps schema inspection enabled; production always does.
  const auth = betterAuth(
    skipSchemaInspection
      ? {
          ...options,
          advanced: {
            ...options.advanced,
            database: { ...options.advanced.database, validateSchema: false },
          },
        }
      : options,
  );
  return { auth, connect, environment };
}

describe("handlers do Better Auth sem serviços externos", () => {
  it("não aceita cookie forjado como sessão", async () => {
    const { auth, connect } = instance();
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { cookie: "better-auth.session_token=forged" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    expect(connect).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "nega sessão com cookie assinado com falha de banco (schema isolado: %s)",
    async (skipSchemaInspection) => {
      const { auth, connect, environment } = instance(skipSchemaInspection);
      const { authCookies } = await auth.$context;
      const token = "unit-test-session-token";
      const signature = createHmac("sha256", environment.secret)
        .update(token)
        .digest("base64");
      const response = await handleAuthRequest(() =>
        auth.handler(
          new Request("http://localhost:3000/api/auth/get-session", {
            headers: {
              cookie: `${authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`,
            },
          }),
        ),
      );
      expect(connect).toHaveBeenCalled();
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("database-private-detail");
    },
  );
  it("não confirma logout quando o handler nativo suprime a falha de exclusão", async () => {
    const { auth, connect, environment } = instance();
    const { authCookies } = await auth.$context;
    const token = "unit-test-session-token";
    const signature = createHmac("sha256", environment.secret)
      .update(token)
      .digest("base64");
    const request = new Request("http://localhost:3000/api/auth/sign-out", {
      method: "POST",
      headers: {
        origin: environment.baseURL,
        "content-type": "application/json",
        cookie: `${authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${signature}`)}`,
      },
      body: "{}",
    });
    const response = await handleAuthRequest(async () =>
      verifySignOutResponse(await auth.handler(request), () =>
        auth.api.getSession({
          headers: request.headers,
          query: { disableCookieCache: true },
        }),
      ),
    );
    expect(connect).toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(await response.text()).not.toContain("database-private-detail");
  });
  it("rejeita origem externa antes de qualquer acesso ao banco", async () => {
    const { auth, connect } = instance();
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          cookie: "better-auth.session_token=forged",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    expect(connect).not.toHaveBeenCalled();
  });
  it("não habilita cadastro com senha", async () => {
    const { auth, connect } = instance();
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Unit Test",
          email: "test@example.invalid",
          password: "not-a-real-password",
        }),
      }),
    );
    expect(response.status).toBe(404);
    expect(connect).not.toHaveBeenCalled();
  });
});
