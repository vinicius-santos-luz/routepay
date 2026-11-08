import { describe, expect, it, vi } from "vitest";
import {
  handleAuthRequest,
  verifySignOutResponse,
} from "@/server/auth/http-policy";

describe("respostas HTTP de autenticação", () => {
  it("não revela configuração ou erros do banco", async () => {
    const response = await handleAuthRequest(async () => {
      throw new Error("postgresql://secret:password@host/database");
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Autenticação indisponível no momento.",
    });
  });
  it("normaliza erros internos devolvidos pelo handler", async () => {
    const response = await handleAuthRequest(
      async () => new Response("internal secret", { status: 500 }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("internal secret");
  });
  it("preserva negações de origem/CSRF", async () => {
    const response = await handleAuthRequest(
      async () => new Response("Forbidden", { status: 403 }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("preserva cookies e redirecionamento OAuth", async () => {
    const response = await handleAuthRequest(
      async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "/login", "Set-Cookie": "test=value; HttpOnly" },
        }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Location")).toBe("/login");
  });
  it("aceita redirects com headers imutáveis", async () => {
    const response = await handleAuthRequest(async () =>
      Response.redirect("http://localhost:3000/login"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/login",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("preserva múltiplos cookies independentes", async () => {
    const headers = new Headers();
    headers.append("Set-Cookie", "first=one; HttpOnly; Path=/");
    headers.append("Set-Cookie", "second=two; HttpOnly; Path=/");
    const response = await handleAuthRequest(
      async () => new Response(null, { headers }),
    );
    expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
  });
});

describe("confirmação do logout no servidor", () => {
  it("mantém a resposta e cookies quando a sessão foi revogada", async () => {
    const response = new Response(null, {
      headers: { "Set-Cookie": "session=; Max-Age=0" },
    });
    expect(await verifySignOutResponse(response, async () => null)).toBe(
      response,
    );
  });
  it("não confirma logout se a sessão ainda existir", async () => {
    const response = await verifySignOutResponse(
      new Response(null),
      async () => ({ session: {} }),
    );
    expect(response.status).toBe(503);
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });
  it("não confirma logout quando a verificação no banco falha", async () => {
    const response = await verifySignOutResponse(
      new Response(null),
      async () => {
        throw new Error("private");
      },
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });
  it("preserva erros de origem sem executar nova consulta", async () => {
    const reader = vi.fn(async () => null);
    const response = await verifySignOutResponse(
      new Response(null, { status: 403 }),
      reader,
    );
    expect(response.status).toBe(403);
    expect(reader).not.toHaveBeenCalled();
  });
});
