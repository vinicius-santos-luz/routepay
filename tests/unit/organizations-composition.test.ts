import { describe, expect, it, vi } from "vitest";
import { organizationRow, userId } from "../fixtures/organizations";

const { session, environment, pool, list } = vi.hoisted(() => ({
  session: vi.fn(),
  environment: vi.fn(),
  pool: vi.fn(),
  list: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/session", () => ({ getSessionState: session }));
vi.mock("@/server/auth/environment", () => ({
  readAuthEnvironment: environment,
}));
vi.mock("@/server/db/pool", () => ({ getAuthPool: pool }));
vi.mock(
  "@/modules/organizations/infrastructure/postgres-organization-repository",
  () => ({
    PostgresOrganizationRepository: class {
      constructor(private readonly readPool: () => unknown) {}
      list(actor: unknown) {
        this.readPool();
        return list(actor);
      }
    },
  }),
);
import { getOrganizationUseCases } from "@/server/authorization/organizations";

describe("composição com a sessão Better Auth do servidor (simulada)", () => {
  it.each(["anonymous", "unavailable"])(
    "nega %s sem avaliar ambiente nem pool",
    async (status) => {
      session.mockResolvedValue({ status });
      await expect(getOrganizationUseCases().list()).rejects.toMatchObject({
        code: status === "anonymous" ? "UNAUTHENTICATED" : "UNAVAILABLE",
      });
      expect(environment).not.toHaveBeenCalled();
      expect(pool).not.toHaveBeenCalled();
      expect(list).not.toHaveBeenCalled();
    },
  );
  it("obtém a identidade somente da sessão validada, sem fallback de migração", async () => {
    session.mockResolvedValue({
      status: "authenticated",
      user: { id: userId },
    });
    environment.mockReturnValue({ database: { user: "routepay_app" } });
    list.mockResolvedValue([organizationRow()]);
    await getOrganizationUseCases().list();
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ userId }));
    expect(pool).toHaveBeenCalledWith({ user: "routepay_app" });
  });
});
