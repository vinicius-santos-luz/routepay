import { describe, expect, it } from "vitest";
import { parseApplicationEnvironment } from "@/shared/validation/application-environment";

describe("configuração de ambiente da fundação", () => {
  it("permite desenvolvimento sem credenciais ou arquivo de ambiente", () => {
    expect(parseApplicationEnvironment(undefined)).toBe("local");
  });

  it.each(["local", "test"] as const)("aceita o ambiente %s", (value) => {
    expect(parseApplicationEnvironment(value)).toBe(value);
  });

  it.each(["", "production", "mainnet", "devnet", "LOCAL"])(
    "rejeita configuração não suportada: %j",
    (value) => {
      expect(() => parseApplicationEnvironment(value)).toThrow(
        "APP_ENV inválido",
      );
    },
  );
});
