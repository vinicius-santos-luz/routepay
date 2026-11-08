import { describe, expect, it } from "vitest";
import {
  parseApplicationDatabaseTarget,
  parseMigrationDatabaseTarget,
  requireMigrationConfirmation,
} from "@/server/db/target-policy";

const policies = [
  {
    label: "aplicação",
    parse: parseApplicationDatabaseTarget,
    user: "routepay_app",
    otherUser: "routepay_migrator",
    variable: "DATABASE_URL",
  },
  {
    label: "migrations",
    parse: parseMigrationDatabaseTarget,
    user: "routepay_migrator",
    otherUser: "routepay_app",
    variable: "MIGRATION_DATABASE_URL",
  },
];

describe.each(policies)(
  "alvo exclusivo para $label",
  ({ parse, user, otherUser, variable }) => {
    it.each(["localhost", "127.0.0.1", "[::1]"])(
      "aceita apenas routepay_dev e o papel correto em %s",
      (host) => {
        expect(
          parse(`postgresql://${user}@${host}:5433/routepay_dev`),
        ).toMatchObject({ database: "routepay_dev", port: 5433, user });
      },
    );
    it.each([undefined, "", "not a url"])(
      "rejeita credencial ausente ou inválida",
      (value) => {
        expect(() => parse(value)).toThrow(variable);
      },
    );
    it.each([
      "routepay",
      "routepay_test",
      "postgres",
      "arkhe",
      "other",
      "routepay_dev%2Fother",
    ])("recusa banco não autorizado %s", (database) => {
      expect(() => parse(`postgresql://${user}@localhost/${database}`)).toThrow(
        variable,
      );
    });
    it.each([
      "remote.example",
      "192.168.1.10",
      "127.0.0.2",
      "localhost.evil.example",
    ])("recusa host %s", (host) => {
      expect(() => parse(`postgresql://${user}@${host}/routepay_dev`)).toThrow(
        variable,
      );
    });
    it("recusa o papel da outra finalidade", () => {
      expect(() =>
        parse(`postgresql://${otherUser}@localhost/routepay_dev`),
      ).toThrow(variable);
    });
    it.each(["postgres", "routepay", "arbitrary"])(
      "recusa usuário %s",
      (role) => {
        expect(() =>
          parse(`postgresql://${role}@localhost/routepay_dev`),
        ).toThrow(variable);
      },
    );
    it.each([
      "?host=remote.example",
      "?database=arkhe",
      "?user=postgres",
      "#fragment",
    ])("recusa parâmetros e fragmentos %s", (suffix) => {
      expect(() =>
        parse(`postgresql://${user}@localhost/routepay_dev${suffix}`),
      ).toThrow(variable);
    });
    it("não revela detalhes sensíveis de conexão", () => {
      const value = `postgresql://${user}:unit-test-redaction-marker@remote.example/routepay_dev`;
      expect(() => parse(value)).toThrow(new RegExp(`^${variable} deve`));
      try {
        parse(value);
      } catch (error) {
        expect(String(error)).not.toContain("unit-test-redaction-marker");
        expect(String(error)).not.toContain("remote.example");
      }
    });
  },
);

describe("confirmação local", () => {
  const target = parseMigrationDatabaseTarget(
    "postgresql://routepay_migrator@localhost/routepay_dev",
  );
  it.each([undefined, "", "routepay", "routepay_test", "other"])(
    "exige o nome exato do banco",
    (confirmation) => {
      expect(() => requireMigrationConfirmation(target, confirmation)).toThrow(
        "não autorizada",
      );
    },
  );
  it("aceita somente a confirmação routepay_dev", () => {
    expect(() =>
      requireMigrationConfirmation(target, "routepay_dev"),
    ).not.toThrow();
  });
});
