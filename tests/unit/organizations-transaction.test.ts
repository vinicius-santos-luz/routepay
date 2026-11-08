import { describe, expect, it, vi } from "vitest";
import type { OrganizationActor } from "@/modules/organizations/application/access";
import { OrganizationError } from "@/modules/organizations/domain/errors";
import { withOrganizationTransaction } from "@/server/db/organization-transaction";
import {
  actor,
  organizationConnection,
  otherUserId,
  userId,
} from "../fixtures/organizations";

describe("transações de organizações com cliente simulado, sem PostgreSQL", () => {
  it("nega contexto ausente antes de reservar conexão", async () => {
    const db = organizationConnection();
    await expect(
      withOrganizationTransaction(
        db.pool,
        { userId } as OrganizationActor,
        async () => null,
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(db.connect).not.toHaveBeenCalled();
  });
  it("usa o mesmo cliente, contexto parametrizado local e limpeza após commit", async () => {
    const db = organizationConnection();
    const operation = vi.fn(async (client) => {
      expect(client).toBe(db.client);
      return "done";
    });
    await expect(
      withOrganizationTransaction(db.pool, await actor(), operation),
    ).resolves.toBe("done");
    expect(db.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL READ COMMITTED",
      "SELECT pg_catalog.set_config('routepay.user_id', $1, true)",
      "SET LOCAL lock_timeout = '2s'",
      "COMMIT",
      "RESET routepay.user_id",
    ]);
    expect(db.query.mock.calls[1]?.[1]).toEqual([userId]);
    expect(db.release).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("falha fechada quando não consegue reservar conexão", async () => {
    const db = organizationConnection();
    db.connect.mockRejectedValue(new Error("private-connect-detail"));
    await expect(
      withOrganizationTransaction(db.pool, await actor(), async () => null),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(db.query).not.toHaveBeenCalled();
    expect(db.release).not.toHaveBeenCalled();
  });
  it.each([
    "BEGIN ISOLATION LEVEL READ COMMITTED",
    "SELECT pg_catalog.set_config('routepay.user_id', $1, true)",
    "SET LOCAL lock_timeout = '2s'",
  ])("não executa operação se %s falhar", async (failed) => {
    const db = organizationConnection(async (sql) => {
      if (sql === failed) throw new Error("private-db-detail");
      return [];
    });
    const operation = vi.fn();
    await expect(
      withOrganizationTransaction(db.pool, await actor(), operation),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(operation).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalledWith("COMMIT");
    expect(db.release).toHaveBeenCalledTimes(1);
  });
  it("faz rollback de falha na criação e remove o contexto", async () => {
    const db = organizationConnection();
    await expect(
      withOrganizationTransaction(db.pool, await actor(), async () => {
        throw new Error("private-insert-detail");
      }),
    ).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: new OrganizationError("UNAVAILABLE").message,
    });
    expect(db.query).toHaveBeenCalledWith("ROLLBACK");
    expect(db.query).not.toHaveBeenCalledWith("COMMIT");
    expect(db.query).toHaveBeenLastCalledWith("RESET routepay.user_id");
    expect(db.release).toHaveBeenCalledExactlyOnceWith(false);
  });
  it("preserva erro seguro original mesmo se rollback falhar e descarta cliente", async () => {
    const db = organizationConnection(async (sql) => {
      if (sql === "ROLLBACK") throw new Error("private-rollback-detail");
      return [];
    });
    const error = new OrganizationError("ACCESS_DENIED");
    await expect(
      withOrganizationTransaction(db.pool, await actor(), async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(db.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("não repete criação após resultado de commit desconhecido", async () => {
    const db = organizationConnection(async (sql) => {
      if (sql === "COMMIT") throw new Error("private-commit-detail");
      return [];
    });
    const operation = vi.fn(async () => "created");
    await expect(
      withOrganizationTransaction(db.pool, await actor(), operation),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith("ROLLBACK");
    expect(db.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("descarta cliente se limpeza falhar após commit confirmado", async () => {
    const db = organizationConnection(async (sql) => {
      if (sql.startsWith("RESET")) throw new Error("private-reset-detail");
      return [];
    });
    await expect(
      withOrganizationTransaction(
        db.pool,
        await actor(),
        async () => "created",
      ),
    ).resolves.toBe("created");
    expect(db.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("mantém atores concorrentes em clientes distintos (somente contrato simulado)", async () => {
    const first = organizationConnection();
    const second = organizationConnection();
    await Promise.all([
      withOrganizationTransaction(first.pool, await actor(), async () => null),
      withOrganizationTransaction(
        second.pool,
        await actor(otherUserId),
        async () => null,
      ),
    ]);
    expect(first.query.mock.calls[1]?.[1]).toEqual([userId]);
    expect(second.query.mock.calls[1]?.[1]).toEqual([otherUserId]);
  });

  it("interrompe operação pendente quando o cliente emite error assíncrono, sem afirmar rollback", async () => {
    const db = organizationConnection();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const operation = vi.fn(async () => {
      expect(db.events.listenerCount("error")).toBe(1);
      setImmediate(() =>
        db.events.emit("error", new Error("private-client-detail")),
      );
      return new Promise<never>(() => {});
    });
    await expect(
      withOrganizationTransaction(db.pool, await actor(), operation),
    ).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: new OrganizationError("UNAVAILABLE").message,
    });
    expect(db.query).not.toHaveBeenCalledWith("COMMIT");
    expect(db.query).not.toHaveBeenCalledWith("ROLLBACK");
    expect(db.query).not.toHaveBeenCalledWith("RESET routepay.user_id");
    expect(db.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(db.events.listeners("error")).toEqual([db.idleError]);
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    "BEGIN ISOLATION LEVEL READ COMMITTED",
    "SELECT pg_catalog.set_config('routepay.user_id', $1, true)",
    "SET LOCAL lock_timeout = '2s'",
    "COMMIT",
  ])("descarta cliente e sanitiza evento durante %s", async (failed) => {
    const db = organizationConnection(async (sql) => {
      if (sql === failed) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        db.events.emit("error", new Error("private-event-detail"));
      }
      return [];
    });
    const operation = vi.fn(async () => "created");
    await expect(
      withOrganizationTransaction(db.pool, await actor(), operation),
    ).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: new OrganizationError("UNAVAILABLE").message,
    });
    if (failed !== "COMMIT") expect(operation).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalledWith("ROLLBACK");
    expect(db.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(db.events.listeners("error")).toEqual([db.idleError]);
  });

  it("preserva erro original quando a conexão é perdida durante rollback", async () => {
    const db = organizationConnection(async (sql) => {
      if (sql === "ROLLBACK") {
        await new Promise<void>((resolve) => setImmediate(resolve));
        db.events.emit("error", new Error("private-rollback-event"));
      }
      return [];
    });
    const original = new OrganizationError("ACCESS_DENIED");
    await expect(
      withOrganizationTransaction(db.pool, await actor(), async () => {
        throw original;
      }),
    ).rejects.toBe(original);
    expect(db.release).toHaveBeenCalledExactlyOnceWith(true);
    expect(db.query).not.toHaveBeenCalledWith("RESET routepay.user_id");
  });

  it("preserva commit simulado já confirmado se um evento ocorre apenas na limpeza", async () => {
    const db = organizationConnection(async (sql) => {
      if (sql.startsWith("RESET"))
        db.events.emit("error", new Error("private-cleanup-event"));
      return [];
    });
    await expect(
      withOrganizationTransaction(
        db.pool,
        await actor(),
        async () => "created",
      ),
    ).resolves.toBe("created");
    expect(db.query).toHaveBeenCalledWith("COMMIT");
    expect(db.release).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("não acumula listeners ao reutilizar um cliente do mesmo pool simulado", async () => {
    const db = organizationConnection();
    const existing = vi.fn();
    db.events.on("error", existing);
    for (let attempt = 0; attempt < 25; attempt++) {
      await withOrganizationTransaction(db.pool, await actor(), async () => {
        expect(db.events.listenerCount("error")).toBe(2);
      });
      expect(db.events.listeners("error")).toEqual([existing, db.idleError]);
    }
    expect(db.release).toHaveBeenCalledTimes(25);
    expect(() =>
      db.events.emit("error", new Error("synthetic-idle-event")),
    ).not.toThrow();
    expect(existing).toHaveBeenCalledTimes(1);
    expect(db.idleError).toHaveBeenCalledTimes(1);
  });

  it("protege a entrega ao listener do pool e remove apenas o próprio listener", async () => {
    const db = organizationConnection();
    db.release.mockImplementation(() => {
      db.events.on("error", db.idleError);
      expect(() =>
        db.events.emit("error", new Error("synthetic-release-event")),
      ).not.toThrow();
    });
    await withOrganizationTransaction(
      db.pool,
      await actor(),
      async () => "done",
    );
    expect(db.events.listeners("error")).toEqual([db.idleError]);
  });
});
