import { describe, expect, it } from "vitest";
import {
  protectedDestination,
  resolveSession,
  type AuthSession,
} from "@/server/auth/session-policy";

const now = new Date("2026-01-01T12:00:00Z");
const active: AuthSession = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Usuário de teste",
    email: "user@example.test",
    emailVerified: true,
  },
  session: {
    id: "22222222-2222-4222-8222-222222222222",
    expiresAt: new Date("2026-01-01T13:00:00Z"),
  },
};

describe("negação de acesso protegido", () => {
  it("não libera acesso sem sessão", async () => {
    const state = await resolveSession(async () => null, now);
    expect(protectedDestination(state)).toBe("/login");
  });
  it("não libera acesso quando banco/autenticação falham", async () => {
    const state = await resolveSession(async () => {
      throw new Error("database password must not leak");
    }, now);
    expect(state).toEqual({ status: "unavailable" });
    expect(protectedDestination(state)).toBe("/login?error=unavailable");
  });
  it.each([new Date("2026-01-01T11:59:59Z"), now, new Date("invalid")])(
    "recusa sessão expirada ou inválida",
    async (expiresAt) => {
      expect(
        (
          await resolveSession(
            async () => ({
              ...active,
              session: { ...active.session, expiresAt },
            }),
            now,
          )
        ).status,
      ).toBe("anonymous");
    },
  );
  it("recusa identidade sem e-mail verificado", async () => {
    expect(
      (
        await resolveSession(
          async () => ({
            ...active,
            user: { ...active.user, emailVerified: false },
          }),
          now,
        )
      ).status,
    ).toBe("anonymous");
  });
  it("retorna apenas a identidade validada, sem token de sessão", async () => {
    const state = await resolveSession(async () => active, now);
    expect(state).toEqual({ status: "authenticated", user: active.user });
    expect(protectedDestination(state)).toBeNull();
    expect(state).not.toHaveProperty("session");
  });
});
