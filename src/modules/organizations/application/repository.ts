import type { OrganizationActor } from "./access";
import type {
  MembershipRole,
  OrganizationId,
  OrganizationStatus,
} from "../domain/organization";

/** Minimal DTO; no emails, OAuth identities, tokens or other members. */
export interface OrganizationSummary {
  id: OrganizationId;
  name: string;
  status: OrganizationStatus;
  role: MembershipRole;
  createdAt: string;
  updatedAt: string;
  version: string;
}

export interface OrganizationRepository {
  create(actor: OrganizationActor, name: string): Promise<OrganizationSummary>;
  list(actor: OrganizationActor): Promise<OrganizationSummary[]>;
  find(
    actor: OrganizationActor,
    id: OrganizationId,
  ): Promise<OrganizationSummary | null>;
}
