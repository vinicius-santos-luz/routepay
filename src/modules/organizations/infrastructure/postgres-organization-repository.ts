import "server-only";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import type { OrganizationActor } from "../application/access";
import type {
  OrganizationRepository,
  OrganizationSummary,
} from "../application/repository";
import { OrganizationError } from "../domain/errors";
import {
  membershipRoles,
  organizationStatuses,
  parseOrganizationId,
  parseOrganizationName,
  parseUuid,
  type MembershipRole,
  type OrganizationId,
  type OrganizationStatus,
} from "../domain/organization";
import { assertOrganizationPermission } from "../domain/permissions";
import { withOrganizationTransaction } from "@/server/db/organization-transaction";

const summaryQuery = `SELECT o.id, o.name, o.status, o.created_at, o.updated_at,
  o.lock_version::text AS version, m.role,
  m.id AS membership_id, m.user_id AS member_user_id, m.status AS member_status
FROM public.organizations AS o
JOIN public.organization_memberships AS m ON m.organization_id = o.id
WHERE m.user_id = $1::uuid AND m.status = 'ACTIVE'
  AND (o.status = 'ACTIVE' OR m.role = 'OWNER')`;

function timestamp(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new OrganizationError("UNAVAILABLE");
  }
  return value.toISOString();
}

function summary(
  row: QueryResultRow,
  actor: OrganizationActor,
): OrganizationSummary {
  const id = parseOrganizationId(row.id);
  if (
    !organizationStatuses.includes(row.status) ||
    !membershipRoles.includes(row.role) ||
    row.member_status !== "ACTIVE" ||
    typeof row.version !== "string" ||
    !/^[1-9]\d*$/.test(row.version)
  ) {
    throw new OrganizationError("UNAVAILABLE");
  }
  const status = row.status as OrganizationStatus;
  const role = row.role as MembershipRole;
  assertOrganizationPermission(
    actor.userId,
    { id, status },
    {
      id: parseUuid(row.membership_id),
      userId: parseUuid(row.member_user_id),
      organizationId: id,
      status: row.member_status,
      role,
    },
    "READ_BASIC",
  );
  return {
    id,
    name: parseOrganizationName(row.name),
    status,
    role,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    version: row.version,
  };
}

async function findWithClient(
  client: PoolClient,
  actor: OrganizationActor,
  id: OrganizationId,
) {
  const result = await client.query(`${summaryQuery} AND o.id = $2::uuid`, [
    actor.userId,
    id,
  ]);
  const row = result.rows[0];
  if (!row) return null;
  const organization = summary(row, actor);
  if (organization.id !== id) throw new OrganizationError("ACCESS_DENIED");
  return organization;
}

export class PostgresOrganizationRepository implements OrganizationRepository {
  constructor(private readonly pool: () => Pick<Pool, "connect">) {}

  create(actor: OrganizationActor, name: string) {
    return withOrganizationTransaction(this.pool(), actor, async (client) => {
      const result = await client.query(
        "SELECT public.routepay_create_organization($1::text) AS id",
        [parseOrganizationName(name)],
      );
      const id = parseOrganizationId(result.rows[0]?.id);
      const organization = await findWithClient(client, actor, id);
      if (
        !organization ||
        organization.role !== "OWNER" ||
        organization.status !== "ACTIVE"
      ) {
        throw new OrganizationError("UNAVAILABLE");
      }
      return organization;
    });
  }

  list(actor: OrganizationActor) {
    return withOrganizationTransaction(this.pool(), actor, async (client) => {
      const result = await client.query(
        `${summaryQuery} ORDER BY o.created_at, o.id`,
        [actor.userId],
      );
      return result.rows.map((row) => summary(row, actor));
    });
  }

  find(actor: OrganizationActor, id: OrganizationId) {
    return withOrganizationTransaction(this.pool(), actor, (client) =>
      findWithClient(client, actor, parseOrganizationId(id)),
    );
  }
}
