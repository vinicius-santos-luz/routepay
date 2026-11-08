"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getOrganizationUseCases } from "@/server/authorization/organizations";
import { OrganizationError } from "../domain/errors";

export async function createOrganizationAction(
  _previous: { error: string | null },
  form: FormData,
): Promise<{ error: string | null }> {
  let id: string;
  try {
    if (form.getAll("name").length !== 1)
      throw new OrganizationError("INVALID_INPUT");
    const organization = await getOrganizationUseCases().create(
      form.get("name"),
    );
    id = organization.id;
  } catch (error) {
    return {
      error:
        error instanceof OrganizationError
          ? error.message
          : new OrganizationError("UNAVAILABLE").message,
    };
  }
  revalidatePath("/dashboard/organizations");
  redirect(`/dashboard/organizations/${id}`);
}
