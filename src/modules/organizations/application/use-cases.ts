import { OrganizationActor, type OrganizationIdentityReader } from "./access";
import type { OrganizationRepository } from "./repository";
import { OrganizationError } from "../domain/errors";
import {
  parseOrganizationId,
  parseOrganizationName,
} from "../domain/organization";

export function organizationUseCases(
  readIdentity: OrganizationIdentityReader,
  repository: OrganizationRepository,
) {
  async function execute<T>(
    operation: (actor: OrganizationActor) => Promise<T>,
  ) {
    const actor = await OrganizationActor.fromSession(readIdentity);
    try {
      return await operation(actor);
    } catch (error) {
      if (error instanceof OrganizationError) throw error;
      throw new OrganizationError("UNAVAILABLE");
    }
  }
  return {
    create: (name: unknown) =>
      execute((actor) => repository.create(actor, parseOrganizationName(name))),
    list: () => execute((actor) => repository.list(actor)),
    find: (id: unknown) =>
      execute(async (actor) => {
        const result = await repository.find(actor, parseOrganizationId(id));
        if (!result) throw new OrganizationError("ACCESS_DENIED");
        return result;
      }),
  };
}
