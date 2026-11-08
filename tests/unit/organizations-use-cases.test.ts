import { describe, expect, it, vi } from "vitest";
import { organizationUseCases } from "@/modules/organizations/application/use-cases";
import type {
  OrganizationRepository,
  OrganizationSummary,
} from "@/modules/organizations/application/repository";
import { OrganizationError } from "@/modules/organizations/domain/errors";
import { organizationId, otherUserId, userId } from "../fixtures/organizations";

const summary: OrganizationSummary = {
  id: organizationId,
  name: "Empresa",
  status: "ACTIVE",
  role: "OWNER",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: "2",
};
function repository() {
  return {
    create: vi.fn(async () => summary),
    list: vi.fn(async () => [summary]),
    find: vi.fn(async () => summary as OrganizationSummary | null),
  } satisfies OrganizationRepository;
}

describe("casos de uso de organizações sem banco", () => {
  it.each(["create", "list", "find"] as const)(
    "nega usuário não autenticado em %s antes do repositório",
    async (operation) => {
      const repo = repository();
      const service = organizationUseCases(async () => null, repo);
      const request =
        operation === "create"
          ? service.create("Empresa")
          : operation === "find"
            ? service.find(organizationId)
            : service.list();
      await expect(request).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.list).not.toHaveBeenCalled();
      expect(repo.find).not.toHaveBeenCalled();
    },
  );
  it("usa a identidade do leitor confiável e normaliza a entrada", async () => {
    const repo = repository();
    const service = organizationUseCases(async () => ({ id: userId }), repo);
    await service.create("  Empresa  ");
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId }),
      "Empresa",
    );
    await expect(
      service.create({ name: "Empresa", userId: otherUserId, role: "OWNER" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.create).toHaveBeenCalledTimes(1);
  });
  it("revalida identidade a cada chamada; não mantém autorização em cache", async () => {
    const repo = repository();
    const read = vi
      .fn()
      .mockResolvedValueOnce({ id: userId })
      .mockResolvedValueOnce(null);
    const service = organizationUseCases(read, repo);
    await service.list();
    await expect(service.list()).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(repo.list).toHaveBeenCalledTimes(1);
  });
  it("uniformiza organização alheia/inexistente sem revelar sua existência", async () => {
    const repo = repository();
    repo.find.mockResolvedValue(null);
    await expect(
      organizationUseCases(async () => ({ id: userId }), repo).find(
        organizationId,
      ),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });
  it("recusa ID inválido antes da consulta", async () => {
    const repo = repository();
    await expect(
      organizationUseCases(async () => ({ id: userId }), repo).find(
        "../company",
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.find).not.toHaveBeenCalled();
  });
  it("sanitiza falhas de autenticação e do banco", async () => {
    const repo = repository();
    const failedReader = organizationUseCases(async () => {
      throw new Error("private-auth-detail");
    }, repo);
    await expect(failedReader.list()).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: new OrganizationError("UNAVAILABLE").message,
    });
    expect(repo.list).not.toHaveBeenCalled();
    repo.list.mockRejectedValue(new Error("private-database-detail"));
    await expect(
      organizationUseCases(async () => ({ id: userId }), repo).list(),
    ).rejects.toMatchObject({
      code: "UNAVAILABLE",
      message: new OrganizationError("UNAVAILABLE").message,
    });
  });
});
