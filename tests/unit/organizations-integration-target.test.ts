import { describe, expect, it } from "vitest";
import {
  identityQuery,
  verifyIdentity,
  integrationTarget,
} from "../integration/postgres-target";

const row = {
  database: "routepay_dev",
  role: "routepay_app",
  login_role: "routepay_app",
  address: "127.0.0.1",
  port: 5433,
  version: 180006,
  cluster: "18/routepay_test",
  owner: "routepay_migrator",
  encoding: "UTF8",
  standard_strings: "on",
  superuser: false,
  bypassrls: false,
  createdb: false,
  createrole: false,
  replication: false,
  pid: 1234,
};

describe("barreira exclusiva do PostgreSQL de integração (sem conexão)", () => {
  it("aceita somente a identidade real autorizada e papéis separados", () => {
    expect(integrationTarget.port).toBe(5433);
    expect(Object.isFrozen(integrationTarget)).toBe(true);
    expect(verifyIdentity(row, "routepay_app").port).toBe(5433);
    expect(
      verifyIdentity(
        { ...row, role: "routepay_migrator", login_role: "routepay_migrator" },
        "routepay_migrator",
      ).owner,
    ).toBe("routepay_migrator");
    expect(identityQuery).toContain("pg_catalog.host(inet_server_addr())");
  });
  it.each([
    { port: 5432 },
    { port: "5433" },
    { port: null },
    { database: "another_db" },
    { role: "postgres" },
    { login_role: "postgres" },
    { owner: "postgres" },
    { address: "::1" },
    { address: "localhost" },
    { address: "10.0.0.1" },
    { address: null },
    { version: 170006 },
    { version: "180006" },
    { cluster: "18/main" },
    { cluster: "" },
    { encoding: "LATIN1" },
    { standard_strings: "off" },
    { superuser: true },
    { bypassrls: true },
    { createdb: true },
    { createrole: true },
    { replication: true },
    { pid: null },
  ])("interrompe alvo divergente %s", (change) => {
    expect(() => verifyIdentity({ ...row, ...change }, "routepay_app")).toThrow(
      "interrompida",
    );
  });
  it("recusa resposta ausente e migrator como aplicação", () => {
    expect(() => verifyIdentity(undefined, "routepay_app")).toThrow();
    expect(() => verifyIdentity(row, "routepay_migrator")).toThrow();
  });
});
