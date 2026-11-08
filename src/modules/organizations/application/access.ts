import { OrganizationError } from "../domain/errors";
import { parseUuid } from "../domain/organization";

export type OrganizationIdentityReader = () => Promise<{ id: string } | null>;

/** Process-local capability. Never deserialize this object from browser input. */
export class OrganizationActor {
  private constructor(readonly userId: string) {}

  static async fromSession(reader: OrganizationIdentityReader) {
    let user;
    try {
      user = await reader();
    } catch {
      throw new OrganizationError("UNAVAILABLE");
    }
    if (!user) throw new OrganizationError("UNAUTHENTICATED");
    return new OrganizationActor(parseUuid(user.id));
  }
}

export function assertOrganizationActor(actor: OrganizationActor) {
  if (!(actor instanceof OrganizationActor)) {
    throw new OrganizationError("UNAUTHENTICATED");
  }
  parseUuid(actor.userId);
}
