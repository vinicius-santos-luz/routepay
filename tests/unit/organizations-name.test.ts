import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  organizationNameMaxLength,
  parseOrganizationName,
} from "@/modules/organizations/domain/organization";
import { validateOrganizationNameInput } from "@/modules/organizations/presentation/organization-name-input";

const sql = readFileSync(
  new URL("../../db/migrations/0002_organizations.sql", import.meta.url),
  "utf8",
);
function decodeUnicodeLiteral(literal: string) {
  return literal.replace(
    /\\(?:\+([0-9A-F]{6})|([0-9A-F]{4}))/g,
    (_, astral: string | undefined, bmp: string | undefined) =>
      String.fromCodePoint(Number.parseInt((astral ?? bmp)!, 16)),
  );
}
const patterns = [...sql.matchAll(/COLLATE "C" !?~ U&'([^']+)'/g)].map(
  (match) => match[1]!,
);
const trims = [
  ...sql.matchAll(/btrim\((?:name|organization_name), U&'([^']+)'\)/g),
].map((match) => match[1]!);
const forbidden = new RegExp(decodeUnicodeLiteral(patterns[0]!), "u");
const trimCharacters = decodeUnicodeLiteral(trims[0]!);

// In-memory model of the SQL text contract. This does NOT execute PostgreSQL.
function matchesSqlNameContract(name: string) {
  return (
    [...name].length >= 1 &&
    [...name].length <= organizationNameMaxLength &&
    !trimCharacters.includes([...name][0]!) &&
    !trimCharacters.includes([...name].at(-1)!) &&
    !forbidden.test(name) &&
    !/[\u0000\p{Cs}]/u.test(name)
  );
}

const accepted = [
  "Empresa",
  "á".repeat(120),
  "🚀".repeat(120),
  "  🚀".repeat(1) + "🚀".repeat(119) + "  ",
  "e\u0301".repeat(60),
  "Empresa\u00A0Brasil",
  "\u00A0\u3000Empresa\uFEFF",
  "\tEmpresa\n",
];
const rejected = [
  "",
  " ",
  "\u00A0\u3000",
  "🚀".repeat(121),
  "a".repeat(121),
  "e\u0301".repeat(61),
  "Empresa\u200B",
  "Empresa\uFEFFBrasil",
  "👨‍👩‍👧‍👦",
  "Empresa\nBrasil",
  "A\u0000B",
  "A\u007FB",
  "A\u0085B",
  "A\u{E0001}B",
  "A\u{E0020}B",
  "A\uD800B",
  "A\uDC00B",
];

describe("nomes Unicode consistentes na interface, servidor e contrato SQL", () => {
  it.each(accepted.map((value, index) => ({ value, index })))(
    "aceita e normaliza caso $index em todos os contratos",
    ({ value }) => {
      const name = parseOrganizationName(value);
      const setCustomValidity = vi.fn();
      validateOrganizationNameInput({ value, setCustomValidity });
      expect(setCustomValidity).toHaveBeenCalledExactlyOnceWith("");
      expect(matchesSqlNameContract(name)).toBe(true);
    },
  );
  it.each(rejected.map((value, index) => ({ value, index })))(
    "rejeita caso $index no navegador e no servidor",
    ({ value }) => {
      const setCustomValidity = vi.fn();
      validateOrganizationNameInput({ value, setCustomValidity });
      expect(setCustomValidity).toHaveBeenCalledWith(expect.any(String));
      expect(setCustomValidity.mock.calls[0]?.[0]).not.toBe("");
      expect(() => parseOrganizationName(value)).toThrow(
        expect.objectContaining({ code: "INVALID_INPUT" }),
      );
      expect(matchesSqlNameContract(value)).toBe(false);
    },
  );
  it("conta pontos de código, preservando sequências combinadas sem normalização NFC", () => {
    expect("🚀".repeat(120).length).toBe(240);
    expect([...parseOrganizationName("🚀".repeat(120))]).toHaveLength(120);
    expect(parseOrganizationName("e\u0301")).toBe("e\u0301");
  });
  it("limpa mensagem anterior ao corrigir uma entrada", () => {
    const input = { value: "🚀".repeat(121), setCustomValidity: vi.fn() };
    validateOrganizationNameInput(input);
    input.value = "🚀".repeat(120);
    validateOrganizationNameInput(input);
    expect(input.setCustomValidity).toHaveBeenLastCalledWith("");
  });
  it("mantém os dois predicados SQL iguais e o limite do domínio", () => {
    expect(patterns).toHaveLength(2);
    expect(patterns[0]).toBe(patterns[1]);
    expect(trims).toHaveLength(2);
    expect(trims[0]).toBe(trims[1]);
    expect(sql).toContain(
      `char_length(name) BETWEEN 1 AND ${organizationNameMaxLength}`,
    );
    expect(sql).toContain(
      `char_length(organization_name) NOT BETWEEN 1 AND ${organizationNameMaxLength}`,
    );
    expect(sql).not.toContain("[[:cntrl:]]");
  });
  it("compara as faixas SQL decodificadas com Cc/Cf e trim do runtime para todos os escalares Unicode", () => {
    const differences: number[] = [];
    for (let code = 1; code <= 0x10ffff; code++) {
      if (code >= 0xd800 && code <= 0xdfff) continue;
      const char = String.fromCodePoint(code);
      if (
        forbidden.test(char) !== /[\p{Cc}\p{Cf}]/u.test(char) ||
        trimCharacters.includes(char) !== (char.trim() === "")
      ) {
        differences.push(code);
        if (differences.length === 10) break;
      }
    }
    expect(differences).toEqual([]);
  });
  it("não aplica limite HTML em unidades UTF-16 nem remove validação server-side", () => {
    const form = readFileSync(
      new URL(
        "../../src/modules/organizations/presentation/create-organization-form.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const useCases = readFileSync(
      new URL(
        "../../src/modules/organizations/application/use-cases.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(form).not.toMatch(/maxLength\s*=/);
    expect(form).toContain(
      "validateOrganizationNameInput(event.currentTarget)",
    );
    expect(useCases).toContain("parseOrganizationName(name)");
  });
});
