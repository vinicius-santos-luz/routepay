import "server-only";
import { getSessionState } from "@/server/auth/session";
import { readAuthEnvironment } from "@/server/auth/environment";
import { getAuthPool } from "@/server/db/pool";
import { organizationUseCases } from "@/modules/organizations/application/use-cases";
import { OrganizationError } from "@/modules/organizations/domain/errors";
import { PostgresOrganizationRepository } from "@/modules/organizations/infrastructure/postgres-organization-repository";

/** Composition root: no actor/userId is accepted from routes or form data. */
export function getOrganizationUseCases() {
  return organizationUseCases(
    async () => {
      const state = await getSessionState();
      if (state.status === "unavailable")
        throw new OrganizationError("UNAVAILABLE");
      return state.status === "authenticated" ? { id: state.user.id } : null;
    },
    new PostgresOrganizationRepository(() =>
      getAuthPool(readAuthEnvironment(process.env).database),
    ),
  );
}
