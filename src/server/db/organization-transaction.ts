import type { Pool, PoolClient } from "pg";
import {
  assertOrganizationActor,
  type OrganizationActor,
} from "@/modules/organizations/application/access";
import { OrganizationError } from "@/modules/organizations/domain/errors";

/** Internal server infrastructure; callers must never expose the callback as an API. */
export async function withOrganizationTransaction<T>(
  pool: Pick<Pool, "connect">,
  actor: OrganizationActor,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  assertOrganizationActor(actor);
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch {
    throw new OrganizationError("UNAVAILABLE");
  }
  let began = false;
  let commitAttempted = false;
  let discard = false;
  let connectionLost = false;
  const failure = Promise.withResolvers<never>();
  // An event can arrive between awaited operations; always observe this rejection.
  void failure.promise.catch(() => {});
  const onError = () => {
    connectionLost = true;
    discard = true;
    failure.reject(new OrganizationError("UNAVAILABLE"));
  };
  client.on("error", onError);

  async function connected<R>(work: () => Promise<R>): Promise<R> {
    if (connectionLost) throw new OrganizationError("UNAVAILABLE");
    const result = await Promise.race([work(), failure.promise]);
    if (connectionLost) throw new OrganizationError("UNAVAILABLE");
    return result;
  }

  try {
    await connected(() => client.query("BEGIN ISOLATION LEVEL READ COMMITTED"));
    began = true;
    await connected(() =>
      client.query(
        "SELECT pg_catalog.set_config('routepay.user_id', $1, true)",
        [actor.userId],
      ),
    );
    await connected(() => client.query("SET LOCAL lock_timeout = '2s'"));
    const result = await connected(() => operation(client));
    commitAttempted = true;
    await connected(() => client.query("COMMIT"));
    began = false;
    return result;
  } catch (error) {
    discard ||= connectionLost || !began || commitAttempted;
    // A lost connection cannot confirm rollback. Discard; never claim recovery.
    if (began && !connectionLost) {
      try {
        await connected(() => client.query("ROLLBACK"));
      } catch {
        discard = true;
      }
    }
    // No automatic retry: a lost COMMIT response can have an unknown outcome.
    if (error instanceof OrganizationError) throw error;
    throw new OrganizationError("UNAVAILABLE");
  } finally {
    if (!discard) {
      try {
        // SET LOCAL already expires at transaction end; also remove any previous
        // session-level value before returning this client to the shared pool.
        await connected(() => client.query("RESET routepay.user_id"));
      } catch {
        discard = true;
      }
    }
    try {
      // pg-pool installs its idle error listener synchronously during release.
      // Keep ours until that handoff completes; never remove other listeners.
      client.release(discard || connectionLost);
    } finally {
      client.removeListener("error", onError);
    }
  }
}
