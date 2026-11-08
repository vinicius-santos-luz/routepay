import { vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Pool, PoolClient } from "pg";
import { OrganizationActor } from "@/modules/organizations/application/access";
import { parseOrganizationId } from "@/modules/organizations/domain/organization";

export const organizationId = parseOrganizationId(
  "11111111-1111-4111-8111-111111111111",
);
export const otherOrganizationId = parseOrganizationId(
  "22222222-2222-4222-8222-222222222222",
);
export const userId = "33333333-3333-4333-8333-333333333333";
export const otherUserId = "44444444-4444-4444-8444-444444444444";
export const membershipId = "55555555-5555-4555-8555-555555555555";

export function actor(id = userId) {
  return OrganizationActor.fromSession(async () => ({ id }));
}

export function organizationRow(override: Record<string, unknown> = {}) {
  return {
    id: organizationId,
    name: "Empresa de teste",
    status: "ACTIVE",
    role: "OWNER",
    member_user_id: userId,
    member_status: "ACTIVE",
    membership_id: membershipId,
    created_at: new Date("2026-01-01T12:00:00Z"),
    updated_at: new Date("2026-01-01T12:00:00Z"),
    version: "2",
    ...override,
  };
}

/** A structural pg double. No Pool/Client instance, network or database exists. */
export function organizationConnection(
  handler: (
    sql: string,
    values?: unknown[],
  ) => Promise<Record<string, unknown>[]> = async () => [],
) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => ({
    rows: await handler(sql, values),
  }));
  const events = new EventEmitter();
  const idleError = vi.fn();
  const release = vi.fn(() => {
    events.on("error", idleError);
  });
  const client = Object.assign(events, {
    query,
    release,
  }) as unknown as PoolClient;
  const connect = vi.fn(async () => {
    events.removeListener("error", idleError);
    return client;
  });
  const pool = { connect } as unknown as Pick<Pool, "connect">;
  return { pool, client, connect, query, release, events, idleError };
}
