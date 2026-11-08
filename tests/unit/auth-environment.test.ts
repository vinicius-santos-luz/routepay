import { describe, expect, it } from "vitest";
import { readAuthEnvironment } from "@/server/auth/environment";
import { authEnvironmentFixture } from "../fixtures/auth";

describe("configuração Better Auth", () => {
  it("não fornece segredos ou banco de fallback", () => {
    expect(() => readAuthEnvironment({})).toThrow("configuração local");
  });
  it.each([
    undefined,
    "",
    "postgresql://routepay_migrator@localhost/routepay_dev",
  ])("não usa credencial de migrations como fallback", (DATABASE_URL) => {
    expect(() =>
      readAuthEnvironment({
        ...authEnvironmentFixture(),
        DATABASE_URL,
        MIGRATION_DATABASE_URL:
          "postgresql://routepay_migrator@localhost/routepay_dev",
      }),
    ).toThrow("configuração local");
  });
  it("usa somente a identidade da aplicação mesmo com outra variável presente", () => {
    expect(
      readAuthEnvironment({
        ...authEnvironmentFixture(),
        MIGRATION_DATABASE_URL: "invalid-unused-value",
      }).database.user,
    ).toBe("routepay_app");
  });
  it("permite preparar PostgreSQL antes de configurar Google", () => {
    expect(readAuthEnvironment(authEnvironmentFixture()).google).toBeNull();
  });
  it("aceita Google somente com as duas variáveis", () => {
    const env = {
      ...authEnvironmentFixture(),
      GOOGLE_CLIENT_ID: "test-id",
      GOOGLE_CLIENT_SECRET: "test-secret",
    };
    expect(readAuthEnvironment(env).google).toEqual({
      clientId: "test-id",
      clientSecret: "test-secret",
    });
  });
  it.each([
    { BETTER_AUTH_SECRET: "" },
    { BETTER_AUTH_SECRET: "short" },
    { GOOGLE_CLIENT_ID: "only-one" },
    { GOOGLE_CLIENT_SECRET: "only-one" },
    { BETTER_AUTH_URL: "https://remote.example" },
    { BETTER_AUTH_URL: "http://localhost:3000/path" },
    { BETTER_AUTH_URL: "http://user:secret@localhost:3000" },
    { BETTER_AUTH_URL: "http://localhost:3000?host=evil" },
    { DATABASE_URL: "postgresql://routepay@localhost/arkhe" },
  ])("recusa configuração inválida sem revelar valores", (override) => {
    expect(() =>
      readAuthEnvironment({ ...authEnvironmentFixture(), ...override }),
    ).toThrow("configuração local");
  });
});
