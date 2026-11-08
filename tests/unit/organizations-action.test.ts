import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationError } from "@/modules/organizations/domain/errors";
import { organizationId, otherUserId } from "../fixtures/organizations";

const { create, redirect, revalidatePath } = vi.hoisted(() => ({
  create: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  revalidatePath: vi.fn(),
}));
vi.mock("@/server/authorization/organizations", () => ({
  getOrganizationUseCases: () => ({ create }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath }));
import { createOrganizationAction } from "@/modules/organizations/presentation/create-organization-action";

beforeEach(() => {
  create.mockReset();
});

describe("fronteira da Server Action de criação", () => {
  it("ignora identidade e papel enviados pelo navegador e redireciona após sucesso", async () => {
    const form = new FormData();
    form.set("name", "Empresa");
    form.set("userId", otherUserId);
    form.set("role", "OWNER");
    create.mockResolvedValue({ id: organizationId });
    await expect(
      createOrganizationAction({ error: "ignored" }, form),
    ).rejects.toThrow(`redirect:/dashboard/organizations/${organizationId}`);
    expect(create).toHaveBeenCalledExactlyOnceWith("Empresa");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/organizations");
  });
  it("recusa nomes ambíguos antes do caso de uso", async () => {
    const form = new FormData();
    form.append("name", "Primeiro");
    form.append("name", "Segundo");
    const result = await createOrganizationAction({ error: null }, form);
    expect(result.error).toBe(new OrganizationError("INVALID_INPUT").message);
    expect(create).not.toHaveBeenCalled();
  });
  it.each([
    new OrganizationError("UNAUTHENTICATED"),
    new Error("private-driver-detail"),
  ])("não redireciona nem expõe detalhes de falha %s", async (error) => {
    create.mockRejectedValue(error);
    const form = new FormData();
    form.set("name", "Empresa");
    const result = await createOrganizationAction({ error: null }, form);
    expect(result.error).not.toContain("private-driver-detail");
    expect(result.error).toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
