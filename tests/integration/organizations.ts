import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { OrganizationActor } from "../../src/modules/organizations/application/access.ts";
import { organizationUseCases } from "../../src/modules/organizations/application/use-cases.ts";
import { OrganizationError } from "../../src/modules/organizations/domain/errors.ts";
import {
  parseOrganizationId,
  parseOrganizationName,
} from "../../src/modules/organizations/domain/organization.ts";
import { PostgresOrganizationRepository } from "../../src/modules/organizations/infrastructure/postgres-organization-repository.ts";
import { withOrganizationTransaction } from "../../src/server/db/organization-transaction.ts";
import {
  identityQuery,
  integrationTarget,
  IntegrationSafetyError,
  verifyIdentity,
  type IntegrationRole,
} from "./postgres-target.ts";

type Status = "APROVADO" | "REPROVADO" | "NAO_EXECUTADO";
type Evidence = Record<string, unknown>;
interface Result {
  name: string;
  status: Status;
  evidence?: Evidence;
  code?: string;
}
class CheckFailure extends Error {
  constructor() {
    super("Verificação de integração reprovada.");
  }
}
const sqlState = (error: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  return typeof code === "string" && /^[A-Z0-9]{5}$/.test(code)
    ? code
    : "UNEXPECTED";
};
async function denied(
  operation: () => Promise<unknown>,
  codes: readonly string[],
) {
  try {
    await operation();
  } catch (error) {
    if (!codes.includes(sqlState(error))) throw error;
    return sqlState(error);
  }
  throw new CheckFailure();
}
const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

/** Real PostgreSQL test runner. No migrations, dotenv, production URLs or external services. */
export async function runOrganizationIntegration(credentials: {
  app: string;
  migrator: string;
}) {
  const runId = randomUUID();
  const users = { A: randomUUID(), B: randomUUID() };
  const orgs: string[] = [];
  let alfa = "";
  let beta = "";
  let halted = false;
  let connectionFailure = false;
  let realIdentities: Evidence[] = [];
  const results: Result[] = [];
  const pools = new Map<IntegrationRole, Pool>();
  const report = {
    runId,
    target: integrationTarget,
    identities: realIdentities,
    results,
    fixtures: { users, organizations: orgs },
    retained: {} as Evidence,
    conclusion: "BLOQUEADA" as "APROVADA" | "BLOQUEADA",
    authentication:
      "Identidades sintéticas de teste; Google OAuth e autenticação HTTP não são testados.",
    migrationsExecuted: false,
  };

  function pool(role: IntegrationRole) {
    let instance = pools.get(role);
    if (!instance) {
      const password =
        role === "routepay_app" ? credentials.app : credentials.migrator;
      if (!password) throw new IntegrationSafetyError();
      instance = new Pool({
        host: integrationTarget.host,
        port: integrationTarget.port,
        database: integrationTarget.database,
        user: role,
        password,
        ssl: false,
        options: `-c search_path=public -c application_name=routepay-integration-${runId}`,
        max: role === "routepay_app" ? 2 : 4,
        connectionTimeoutMillis: 3000,
        statement_timeout: 15000,
        query_timeout: 20000,
        idleTimeoutMillis: 1000,
      });
      instance.on("error", () => {
        connectionFailure = true;
      });
      pools.set(role, instance);
    }
    return instance;
  }
  const guarded = (role: IntegrationRole, override?: Pool) =>
    ({
      connect: async () => {
        const client = await (override ?? pool(role)).connect();
        let invalid = false;
        const onError = () => {
          invalid = true;
          connectionFailure = true;
        };
        client.on("error", onError);
        const release = client.release.bind(client);
        client.release = (error?: Error | boolean) => {
          try {
            release(error || invalid);
          } finally {
            client.removeListener("error", onError);
          }
        };
        try {
          const row = (await client.query(identityQuery)).rows[0];
          verifyIdentity(row, role);
          return client;
        } catch (error) {
          client.release(true);
          throw error;
        }
      },
    }) as Pick<Pool, "connect">;
  async function using<T>(
    role: IntegrationRole,
    work: (client: PoolClient) => Promise<T>,
  ) {
    const client = await guarded(role).connect();
    try {
      return await work(client);
    } finally {
      client.release();
    }
  }
  async function begin(client: PoolClient) {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await client.query("SET LOCAL lock_timeout = '5s'");
  }
  async function rollback(client: PoolClient) {
    try {
      await client.query("ROLLBACK");
    } catch {
      connectionFailure = true;
    }
  }
  async function transaction<T>(
    role: IntegrationRole,
    user: string | null,
    work: (client: PoolClient) => Promise<T>,
  ) {
    return using(role, async (client) => {
      await begin(client);
      try {
        if (user)
          await client.query(
            "SELECT set_config('routepay.user_id', $1, true)",
            [user],
          );
        return await work(client);
      } finally {
        await rollback(client);
      }
    });
  }
  async function test(name: string, work: () => Promise<Evidence | void>) {
    if (halted) {
      results.push({
        name,
        status: "NAO_EXECUTADO",
        code: "DEPENDENCY_FAILED",
      });
      return;
    }
    try {
      if (connectionFailure) throw new CheckFailure();
      const evidence = await work();
      results.push({
        name,
        status: "APROVADO",
        ...(evidence ? { evidence } : {}),
      });
    } catch (error) {
      halted = true;
      const driverCode =
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined;
      const code =
        error instanceof IntegrationSafetyError
          ? "TARGET_MISMATCH"
          : error instanceof CheckFailure
            ? "EXPECTED_RESULT_MISSING"
            : error instanceof assert.AssertionError
              ? "ASSERTION_FAILED"
              : typeof driverCode === "string" &&
                  [
                    "ECONNREFUSED",
                    "ECONNRESET",
                    "ETIMEDOUT",
                    "EHOSTUNREACH",
                  ].includes(driverCode)
                ? driverCode
                : sqlState(error);
      results.push({ name, status: "REPROVADO", code });
    }
  }
  const actor = (user: string) =>
    OrganizationActor.fromSession(async () => ({ id: user }));
  const repository = new PostgresOrganizationRepository(() =>
    guarded("routepay_app"),
  );
  const service = (user: string) =>
    organizationUseCases(async () => ({ id: user }), repository);
  async function count(id: string) {
    return using("routepay_migrator", async (client) => {
      const row = (
        await client.query(
          `SELECT
        (SELECT count(*)::integer FROM public.organizations WHERE id=$1) AS organizations,
        (SELECT count(*)::integer FROM public.organization_memberships WHERE organization_id=$1) AS memberships`,
          [id],
        )
      ).rows[0];
      return row as { organizations: number; memberships: number };
    });
  }
  async function waitBlocked(waiter: number, blocker: number) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const blocked = await using(
        "routepay_migrator",
        async (client) =>
          (
            await client.query(
              "SELECT $2::integer = ANY(pg_catalog.pg_blocking_pids($1::integer)) AS blocked",
              [waiter, blocker],
            )
          ).rows[0]?.blocked,
      );
      if (blocked) return;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    }
    throw new CheckFailure();
  }
  async function pid(client: PoolClient) {
    return Number(
      (await client.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid,
    );
  }

  try {
    await test("0. Identidade real e alvo exclusivo antes de qualquer escrita", async () => {
      realIdentities = await Promise.all(
        (["routepay_app", "routepay_migrator"] as const).map((role) =>
          using(role, async (client) =>
            verifyIdentity((await client.query(identityQuery)).rows[0], role),
          ),
        ),
      );
      report.identities = realIdentities;
      return {
        validatedRoles: realIdentities.map((identity) => identity.role),
        writesBeforeValidation: 0,
      };
    });
    await test("0. Histórico, checksums, sete tabelas, RLS e privilégios", async () => {
      await using("routepay_migrator", async (client) => {
        const roleSeparation = (
          await client.query(`SELECT
          pg_has_role('routepay_app','routepay_migrator','MEMBER') AS inherited,
          has_database_privilege('routepay_app','routepay_dev','CREATE,TEMPORARY') AS ddl,
          has_schema_privilege('routepay_app','public','CREATE') AS schema_ddl`)
        ).rows[0];
        assert.equal(roleSeparation.inherited, false);
        assert.equal(roleSeparation.ddl, false);
        assert.equal(roleSeparation.schema_ddl, false);
        const history = (
          await client.query(
            "SELECT name,checksum FROM public.routepay_schema_migrations ORDER BY name",
          )
        ).rows;
        assert.deepEqual(
          history.map((row) => row.name),
          ["0001_better_auth.sql", "0002_organizations.sql"],
        );
        for (const row of history) {
          const source = await readFile(
            new URL(`../../db/migrations/${row.name}`, import.meta.url),
          );
          assert.equal(
            row.checksum,
            createHash("sha256").update(source).digest("hex"),
          );
        }
        const names = [
          "auth_users",
          "auth_accounts",
          "auth_sessions",
          "auth_verifications",
          "organizations",
          "organization_memberships",
          "routepay_schema_migrations",
        ];
        const tables = (
          await client.query(
            `SELECT c.relname, c.relrowsecurity, pg_get_userbyid(c.relowner) AS owner
          FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind='r'`,
            [names],
          )
        ).rows;
        assert.equal(tables.length, 7);
        assert(tables.every((row) => row.owner === "routepay_migrator"));
        assert(
          tables
            .filter((row) =>
              ["organizations", "organization_memberships"].includes(
                row.relname,
              ),
            )
            .every((row) => row.relrowsecurity),
        );
        const grants = (
          await client.query(
            `SELECT name,
          has_table_privilege('routepay_app',name,'SELECT') AS read,
          has_table_privilege('routepay_app',name,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN') AS excessive
          FROM unnest($1::text[]) AS name`,
            [["public.organizations", "public.organization_memberships"]],
          )
        ).rows;
        assert(grants.every((row) => row.read && !row.excessive));
        const funcs = (
          await client.query(
            `SELECT p.proname,p.prosecdef,p.proconfig,
          pg_get_userbyid(p.proowner) AS owner,
          has_function_privilege('routepay_app',p.oid,'EXECUTE') AS app_execute,
          EXISTS (SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) AS a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute
          FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.proname=ANY($1::text[])`,
            [
              [
                "routepay_guard_organization",
                "routepay_guard_membership",
                "routepay_require_active_owner",
                "routepay_current_actor",
                "routepay_create_organization",
              ],
            ],
          )
        ).rows;
        assert.equal(funcs.length, 5);
        for (const fn of funcs) {
          assert.equal(fn.owner, "routepay_migrator");
          assert(fn.proconfig?.includes("search_path=pg_catalog, pg_temp"));
          assert.equal(fn.prosecdef, fn.proname !== "routepay_current_actor");
          assert.equal(
            fn.app_execute,
            ["routepay_current_actor", "routepay_create_organization"].includes(
              fn.proname,
            ),
          );
          assert.equal(fn.public_execute, false);
        }
      });
      return { migrationsMatchSource: true, tables: 7, rlsTables: 2 };
    });
    await test("1. Duas identidades fictícias, sem contas Google ou sessões", async () => {
      await using("routepay_migrator", async (client) => {
        await begin(client);
        try {
          await client.query(
            `INSERT INTO public.auth_users (id,name,email,email_verified) VALUES
            ($1,'Usuário A de integração',$3,true),($2,'Usuário B de integração',$4,true)`,
            [
              users.A,
              users.B,
              `routepay-${runId}-a@example.invalid`,
              `routepay-${runId}-b@example.invalid`,
            ],
          );
          await client.query("COMMIT");
        } catch (error) {
          await rollback(client);
          throw error;
        }
      });
      return {
        users,
        fictional: true,
        googleAccountsCreated: 0,
        sessionsCreated: 0,
      };
    });
    await test("3. Usuário existente sem membership não acessa organizações", async () => {
      assert.deepEqual(await service(users.A).list(), []);
      return { actor: "A antes da criação", visibleOrganizations: 0 };
    });
    await test("2. Criação real de Alfa e Beta pela implementação da aplicação", async () => {
      const a = await service(users.A).create("Empresa Alfa");
      alfa = a.id;
      orgs.push(alfa);
      const b = await service(users.B).create("Empresa Beta");
      beta = b.id;
      orgs.push(beta);
      assert.notEqual(alfa, beta);
      assert.equal(a.role, "OWNER");
      assert.equal(b.role, "OWNER");
      await using("routepay_migrator", async (client) => {
        const rows = (
          await client.query(
            `SELECT o.id,o.created_by_user_id,m.user_id,m.role,m.status
          FROM public.organizations o JOIN public.organization_memberships m ON m.organization_id=o.id
          WHERE o.id=ANY($1::uuid[])`,
            [[alfa, beta]],
          )
        ).rows;
        assert.equal(rows.length, 2);
        for (const row of rows) {
          const user = row.id === alfa ? users.A : users.B;
          assert.equal(row.created_by_user_id, user);
          assert.equal(row.user_id, user);
          assert.equal(row.role, "OWNER");
          assert.equal(row.status, "ACTIVE");
        }
      });
      return { alfa, beta, activeOwners: 2 };
    });
    await test("2. Atomicidade e rollback integral de criação", async () => {
      let rolledBackId = "";
      await assert.rejects(
        () =>
          withOrganizationTransaction(
            guarded("routepay_app"),
            // The reader is a test fixture, never represented as a Google session.
            // The actual transaction helper, pg driver and SQL function are used.
            Object.create(null) as OrganizationActor,
            async () => null,
          ),
        OrganizationError,
      );
      const identity = await actor(users.A);
      const sentinel = new OrganizationError("INVALID_INPUT");
      await assert.rejects(
        () =>
          withOrganizationTransaction(
            guarded("routepay_app"),
            identity,
            async (client) => {
              rolledBackId = (
                await client.query(
                  "SELECT public.routepay_create_organization($1) AS id",
                  ["Criação para rollback"],
                )
              ).rows[0].id;
              throw sentinel;
            },
          ),
        (error) => error === sentinel,
      );
      assert(rolledBackId);
      assert.deepEqual(await count(rolledBackId), {
        organizations: 0,
        memberships: 0,
      });
      return { organizationsAfterRollback: 0, membershipsAfterRollback: 0 };
    });
    await test("3. RLS e IDOR: A vê Alfa, B vê Beta, sem acesso cruzado", async () => {
      const evidence: Evidence = {};
      for (const [label, user, own, other] of [
        ["A", users.A, alfa, beta],
        ["B", users.B, beta, alfa],
      ]) {
        const list = await service(user!).list();
        assert.deepEqual(
          list.map((row) => row.id),
          [own],
        );
        assert.equal((await service(user!).find(own)).id, own);
        await assert.rejects(
          () => service(user!).find(other),
          (error) =>
            error instanceof OrganizationError &&
            error.code === "ACCESS_DENIED",
        );
        await transaction("routepay_app", user!, async (client) => {
          const rows = (
            await client.query(
              "SELECT id FROM public.organizations WHERE id=ANY($1::uuid[])",
              [[alfa, beta]],
            )
          ).rows;
          assert.deepEqual(
            rows.map((row) => row.id),
            [own],
          );
          const tampered = (
            await client.query(
              "SELECT id FROM public.organizations WHERE id=$1::uuid",
              [other],
            )
          ).rows;
          assert.equal(tampered.length, 0);
          const members = (
            await client.query(
              "SELECT user_id FROM public.organization_memberships WHERE organization_id=$1::uuid",
              [other],
            )
          ).rows;
          assert.equal(members.length, 0);
        });
        evidence[label!] = {
          ownVisible: true,
          foreignOrganizationVisible: false,
          foreignMembershipVisible: false,
        };
      }
      return evidence;
    });
    for (const context of [null, "not-a-uuid", randomUUID()]) {
      await test(`3. Contexto ${context === null ? "ausente" : context === "not-a-uuid" ? "inválido" : "inexistente"} não expõe dados`, async () => {
        await transaction("routepay_app", context, async (client) => {
          await denied(
            () => client.query("SELECT public.routepay_current_actor()"),
            ["42501"],
          );
        });
        await transaction("routepay_app", context, async (client) => {
          try {
            const rows = (
              await client.query(
                "SELECT id FROM public.organizations WHERE id=ANY($1::uuid[])",
                [[alfa, beta]],
              )
            ).rows;
            assert.equal(rows.length, 0);
          } catch (error) {
            if (sqlState(error) !== "42501") throw error;
          }
        });
        return { unauthorizedRows: 0 };
      });
    }
    const prohibited = [
      [
        "INSERT organizations",
        "INSERT INTO public.organizations(name,created_by_user_id) VALUES ('Negado',$1)",
        [users.A],
      ],
      [
        "UPDATE organizations",
        "UPDATE public.organizations SET name='Negado' WHERE id=$1",
        [alfa],
      ],
      [
        "DELETE organizations",
        "DELETE FROM public.organizations WHERE id=$1",
        [alfa],
      ],
      [
        "INSERT memberships",
        "INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES ($1,$2,'OWNER')",
        [alfa, users.B],
      ],
      [
        "UPDATE memberships",
        "UPDATE public.organization_memberships SET role='ADMIN' WHERE organization_id=$1 AND user_id=$2",
        [alfa, users.A],
      ],
      [
        "DELETE memberships",
        "DELETE FROM public.organization_memberships WHERE organization_id=$1 AND user_id=$2",
        [alfa, users.A],
      ],
      [
        "SELECT histórico",
        "SELECT name FROM public.routepay_schema_migrations",
        [],
      ],
    ] as const;
    for (const [label, query, values] of prohibited)
      await test(`4. routepay_app não possui ${label}`, async () => {
        await transaction("routepay_app", users.A, async (client) => {
          await denied(() => client.query(query, [...values]), ["42501"]);
        });
        return { sqlState: "42501", persistentEffects: 0 };
      });
    await test("5. Membership duplicada", async () => {
      await transaction("routepay_migrator", null, async (client) => {
        await denied(
          () =>
            client.query(
              "INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES ($1,$2,'OWNER')",
              [alfa, users.A],
            ),
          ["23505"],
        );
      });
      return { sqlState: "23505" };
    });
    await test("5. COMMIT rejeita organização ativa sem OWNER", async () => {
      const id = randomUUID();
      orgs.push(id);
      await transaction("routepay_migrator", null, async (client) => {
        await client.query(
          "INSERT INTO public.organizations(id,name,created_by_user_id) VALUES ($1,'Sem proprietário',$2)",
          [id, users.A],
        );
        await denied(() => client.query("COMMIT"), ["23514"]);
      });
      assert.deepEqual(await count(id), { organizations: 0, memberships: 0 });
      return { commitSqlState: "23514", persistedOrganizations: 0 };
    });
    for (const [label, query] of [
      [
        "suspensão",
        "UPDATE public.organization_memberships SET status='SUSPENDED' WHERE organization_id=$1 AND user_id=$2",
      ],
      [
        "remoção lógica",
        "UPDATE public.organization_memberships SET status='REMOVED',removed_at=now() WHERE organization_id=$1 AND user_id=$2",
      ],
      [
        "rebaixamento",
        "UPDATE public.organization_memberships SET role='ADMIN' WHERE organization_id=$1 AND user_id=$2",
      ],
    ])
      await test(`5. COMMIT impede ${label} do último OWNER`, async () => {
        await transaction("routepay_migrator", null, async (client) => {
          await client.query(query!, [alfa, users.A]);
          await denied(() => client.query("COMMIT"), ["23514"]);
        });
        assert.equal((await service(users.A).find(alfa)).role, "OWNER");
        return { commitSqlState: "23514", activeOwnerPreserved: true };
      });
    const invalidChanges: [string, string, unknown[], string][] = [
      [
        "DELETE físico do vínculo",
        "DELETE FROM public.organization_memberships WHERE organization_id=$1 AND user_id=$2",
        [alfa, users.A],
        "23514",
      ],
      [
        "estado da organização",
        "UPDATE public.organizations SET status='UNKNOWN' WHERE id=$1",
        [alfa],
        "23514",
      ],
      [
        "estado do vínculo",
        "UPDATE public.organization_memberships SET status='UNKNOWN' WHERE organization_id=$1",
        [alfa],
        "23514",
      ],
      [
        "papel inválido",
        "UPDATE public.organization_memberships SET role='ROOT' WHERE organization_id=$1",
        [alfa],
        "23514",
      ],
      [
        "data de remoção incoerente",
        "UPDATE public.organization_memberships SET removed_at=now() WHERE organization_id=$1",
        [alfa],
        "23514",
      ],
      [
        "data de desativação incoerente",
        "UPDATE public.organizations SET deactivated_at=now() WHERE id=$1",
        [alfa],
        "23514",
      ],
      [
        "created_at imutável",
        "UPDATE public.organizations SET created_at=now()+interval '1 day' WHERE id=$1",
        [alfa],
        "23514",
      ],
      [
        "FK de usuário",
        "INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES ($1,$2,'OPERATOR')",
        [alfa, randomUUID()],
        "23503",
      ],
      [
        "FK de organização",
        "INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES ($1,$2,'OPERATOR')",
        [randomUUID(), users.A],
        "23503",
      ],
    ];
    for (const [label, query, values, code] of invalidChanges)
      await test(`5. Rejeita ${label}`, async () => {
        await transaction("routepay_migrator", null, async (client) => {
          await denied(() => client.query(query, values), [code]);
        });
        return { sqlState: code };
      });
    await test("5. Timestamps, versões e rollback de atualização", async () => {
      let version = "";
      await transaction("routepay_migrator", null, async (client) => {
        const before = (
          await client.query(
            "SELECT created_at,updated_at,lock_version::text AS version FROM public.organizations WHERE id=$1",
            [alfa],
          )
        ).rows[0];
        version = before.version;
        assert(before.created_at instanceof Date);
        assert(before.updated_at instanceof Date);
        const after = (
          await client.query(
            "UPDATE public.organizations SET name='Nome para rollback' WHERE id=$1 RETURNING created_at,updated_at,lock_version::text AS version",
            [alfa],
          )
        ).rows[0];
        assert.equal(after.created_at.getTime(), before.created_at.getTime());
        assert(after.updated_at >= after.created_at);
        assert.equal(BigInt(after.version), BigInt(version) + 1n);
      });
      const restored = await service(users.A).find(alfa);
      assert.equal(restored.name, "Empresa Alfa");
      assert.equal(restored.version, version);
      return {
        immutableCreation: true,
        versionIncrement: true,
        rollbackRestored: true,
      };
    });
    const validNames = [
      "Empresa Ágil",
      "🚀".repeat(120),
      "e\u0301".repeat(60),
      "\u00A0\u3000 Empresa Unicode \uFEFF",
    ];
    for (const [index, input] of validNames.entries())
      await test(`6. Unicode válido ${index + 1}`, async () => {
        const name = parseOrganizationName(input);
        let id = "";
        await transaction("routepay_app", users.A, async (client) => {
          id = (
            await client.query(
              "SELECT public.routepay_create_organization($1) AS id",
              [name],
            )
          ).rows[0].id;
          const row = (
            await client.query(
              "SELECT name,char_length(name) AS length FROM public.organizations WHERE id=$1",
              [id],
            )
          ).rows[0];
          assert.equal(row.name, name);
          assert.equal(row.length, [...name].length);
          await client.query("SET CONSTRAINTS ALL IMMEDIATE");
        });
        assert.deepEqual(await count(id), { organizations: 0, memberships: 0 });
        return {
          codePoints: [...name].length,
          sqlAndTypeScriptAgree: true,
          rolledBack: true,
        };
      });
    const invalidNames = [
      "",
      " ",
      "🚀".repeat(121),
      "e\u0301".repeat(61),
      "Empresa\u200B",
      "A\uFEFFB",
      "A\nB",
      "A\u0085B",
      "A\u{E0001}B",
      "👨‍👩‍👧‍👦",
    ];
    for (const [index, name] of invalidNames.entries())
      await test(`6. Unicode inválido ${index + 1}: função e CHECK`, async () => {
        assert.throws(() => parseOrganizationName(name), OrganizationError);
        await transaction("routepay_app", users.A, async (client) => {
          await denied(
            () =>
              client.query("SELECT public.routepay_create_organization($1)", [
                name,
              ]),
            ["22023"],
          );
        });
        await transaction("routepay_migrator", null, async (client) => {
          await denied(
            () =>
              client.query(
                "INSERT INTO public.organizations(name,created_by_user_id) VALUES ($1,$2)",
                [name, users.A],
              ),
            ["23514"],
          );
        });
        return {
          functionSqlState: "22023",
          checkSqlState: "23514",
          sqlAndTypeScriptAgree: true,
        };
      });
    await test("7. Criações simultâneas em conexões independentes com rollback", async () => {
      const first = await guarded("routepay_app").connect();
      const second = await guarded("routepay_app").connect();
      const ids: string[] = [];
      try {
        assert.notEqual(await pid(first), await pid(second));
        await Promise.all(
          [
            [first, users.A],
            [second, users.B],
          ].map(async ([c, user]) => {
            const client = c as PoolClient;
            await begin(client);
            await client.query(
              "SELECT set_config('routepay.user_id',$1,true)",
              [user],
            );
            ids.push(
              (
                await client.query(
                  "SELECT public.routepay_create_organization($1) AS id",
                  ["Criação concorrente de teste"],
                )
              ).rows[0].id,
            );
            await client.query("SET CONSTRAINTS ALL IMMEDIATE");
          }),
        );
        assert.equal(ids.length, 2);
        assert.notEqual(ids[0], ids[1]);
      } finally {
        await Promise.all([rollback(first), rollback(second)]);
        first.release();
        second.release();
      }
      for (const id of ids)
        assert.deepEqual(await count(id), { organizations: 0, memberships: 0 });
      return {
        independentConnections: 2,
        creations: 2,
        persistedOrganizations: 0,
      };
    });
    await test("7. Timeout de lock e rollback sem alteração persistente", async () => {
      const first = await guarded("routepay_migrator").connect();
      const second = await guarded("routepay_migrator").connect();
      try {
        await begin(first);
        await begin(second);
        await first.query(
          "SELECT id FROM public.organizations WHERE id=$1 FOR UPDATE",
          [alfa],
        );
        await second.query("SET LOCAL lock_timeout='300ms'");
        await denied(
          () =>
            second.query(
              "UPDATE public.organizations SET name='Timeout de teste' WHERE id=$1",
              [alfa],
            ),
          ["55P03"],
        );
      } finally {
        await Promise.all([rollback(first), rollback(second)]);
        first.release();
        second.release();
      }
      assert.equal((await service(users.A).find(alfa)).name, "Empresa Alfa");
      return { sqlState: "55P03", originalNamePreserved: true };
    });
    await test("7. Deadlock real controlado e rollback das duas transações", async () => {
      const first = await guarded("routepay_migrator").connect();
      const second = await guarded("routepay_migrator").connect();
      try {
        await begin(first);
        await begin(second);
        await first.query(
          "SELECT id FROM public.organizations WHERE id=$1 FOR UPDATE",
          [alfa],
        );
        await second.query(
          "SELECT id FROM public.organizations WHERE id=$1 FOR UPDATE",
          [beta],
        );
        const firstPid = await pid(first);
        const secondPid = await pid(second);
        const left = settle(
          first.query(
            "SELECT id FROM public.organizations WHERE id=$1 FOR UPDATE",
            [beta],
          ),
        );
        await waitBlocked(firstPid, secondPid);
        const right = settle(
          second.query(
            "SELECT id FROM public.organizations WHERE id=$1 FOR UPDATE",
            [alfa],
          ),
        );
        const finish = async (
          result: Awaited<typeof left>,
          client: PoolClient,
        ) => {
          await rollback(client);
          return result;
        };
        const outcomes = await Promise.all([
          left.then((value) => finish(value, first)),
          right.then((value) => finish(value, second)),
        ]);
        assert.equal(
          outcomes.filter(
            (value) => !value.ok && sqlState(value.error) === "40P01",
          ).length,
          1,
        );
        assert.equal(outcomes.filter((value) => value.ok).length, 1);
      } finally {
        await Promise.all([rollback(first), rollback(second)]);
        first.release();
        second.release();
      }
      return { sqlState: "40P01", victimTransactions: 1, persistentEffects: 0 };
    });
    await test("7. Último OWNER protegido após espera concorrente e COMMIT", async () => {
      await using("routepay_migrator", async (client) => {
        await begin(client);
        try {
          await client.query(
            "INSERT INTO public.organization_memberships(organization_id,user_id,role) VALUES ($1,$2,'OWNER')",
            [alfa, users.B],
          );
          await client.query("COMMIT");
        } catch (error) {
          await rollback(client);
          throw error;
        }
      });
      const first = await guarded("routepay_migrator").connect();
      const second = await guarded("routepay_migrator").connect();
      try {
        await begin(first);
        await begin(second);
        const firstPid = await pid(first);
        const secondPid = await pid(second);
        await first.query(
          "UPDATE public.organization_memberships SET status='SUSPENDED' WHERE organization_id=$1 AND user_id=$2",
          [alfa, users.A],
        );
        const pending = settle(
          second.query(
            "UPDATE public.organization_memberships SET status='SUSPENDED' WHERE organization_id=$1 AND user_id=$2",
            [alfa, users.B],
          ),
        );
        await waitBlocked(secondPid, firstPid);
        await first.query("COMMIT");
        const updated = await pending;
        if (!updated.ok) throw updated.error;
        await denied(() => second.query("COMMIT"), ["23514"]);
      } finally {
        await Promise.all([rollback(first), rollback(second)]);
        first.release();
        second.release();
      }
      await using("routepay_migrator", async (client) => {
        const owners = (
          await client.query(
            "SELECT user_id FROM public.organization_memberships WHERE organization_id=$1 AND role='OWNER' AND status='ACTIVE'",
            [alfa],
          )
        ).rows;
        assert.deepEqual(
          owners.map((row) => row.user_id),
          [users.B],
        );
        await begin(client);
        try {
          await client.query(
            "SELECT id FROM public.organizations WHERE id=$1 FOR UPDATE",
            [alfa],
          );
          await client.query(
            "UPDATE public.organization_memberships SET status='ACTIVE' WHERE organization_id=$1 AND user_id=$2",
            [alfa, users.A],
          );
          await client.query(
            "UPDATE public.organization_memberships SET status='REMOVED',removed_at=now() WHERE organization_id=$1 AND user_id=$2",
            [alfa, users.B],
          );
          await client.query("COMMIT");
        } catch (error) {
          await rollback(client);
          throw error;
        }
      });
      assert.equal((await service(users.A).find(alfa)).role, "OWNER");
      assert.equal(
        await repository.find(await actor(users.B), parseOrganizationId(alfa)),
        null,
      );
      return {
        blockingObserved: true,
        secondCommitSqlState: "23514",
        originalOwnerRestored: true,
        extraMembership: "REMOVED",
      };
    });
    await test("8. Contexto e reutilização real de cliente após COMMIT/ROLLBACK", async () => {
      const single = new Pool({
        host: integrationTarget.host,
        port: integrationTarget.port,
        database: integrationTarget.database,
        user: "routepay_app",
        password: credentials.app,
        ssl: false,
        options: "-c search_path=public",
        max: 1,
        connectionTimeoutMillis: 3000,
        statement_timeout: 5000,
        query_timeout: 8000,
      });
      single.on("error", () => {
        connectionFailure = true;
      });
      let originalPid = 0;
      try {
        for (const [index, user] of [users.A, users.B, users.A].entries()) {
          const identity = await actor(user);
          const body = async (client: PoolClient) => {
            const row = (
              await client.query(
                "SELECT pg_backend_pid() AS pid, public.routepay_current_actor() AS actor",
              )
            ).rows[0];
            assert.equal(row.actor, user);
            if (!originalPid) originalPid = row.pid;
            assert.equal(row.pid, originalPid);
            if (index === 1) throw new OrganizationError("INVALID_INPUT");
          };
          if (index === 1)
            await assert.rejects(
              () =>
                withOrganizationTransaction(
                  guarded("routepay_app", single),
                  identity,
                  body,
                ),
              OrganizationError,
            );
          else
            await withOrganizationTransaction(
              guarded("routepay_app", single),
              identity,
              body,
            );
          const client = await guarded("routepay_app", single).connect();
          try {
            const row = (
              await client.query(
                "SELECT pg_backend_pid() AS pid, current_setting('routepay.user_id',true) AS context",
              )
            ).rows[0];
            assert.equal(row.pid, originalPid);
            assert(!row.context);
            await denied(
              () => client.query("SELECT public.routepay_current_actor()"),
              ["42501"],
            );
          } finally {
            client.release();
          }
        }
      } finally {
        await single.end();
      }
      return {
        sameBackendReused: true,
        commitClearedContext: true,
        rollbackClearedContext: true,
      };
    });
    await test("8. GUC customizado não prova identidade Google", async () => {
      await transaction("routepay_app", users.A, async (client) => {
        await client.query("SELECT set_config('routepay.user_id',$1,true)", [
          users.B,
        ]);
        const rows = (
          await client.query(
            "SELECT id FROM public.organizations WHERE id=ANY($1::uuid[])",
            [[alfa, beta]],
          )
        ).rows;
        assert.deepEqual(
          rows.map((row) => row.id),
          [beta],
        );
      });
      return {
        databaseCredentialCanChooseActor: true,
        cryptographicGoogleProof: false,
        knownTrustBoundary: true,
      };
    });
  } finally {
    // Read only our generated UUIDs. Do not delete data or bypass integrity triggers.
    if (realIdentities.length === 2) {
      try {
        report.retained = await using("routepay_migrator", async (client) => ({
          users: (
            await client.query(
              "SELECT id,name FROM public.auth_users WHERE id=ANY($1::uuid[])",
              [Object.values(users)],
            )
          ).rows,
          organizations: (
            await client.query(
              "SELECT id,name,status FROM public.organizations WHERE created_by_user_id=ANY($1::uuid[])",
              [Object.values(users)],
            )
          ).rows,
          memberships: (
            await client.query(
              `SELECT m.id,m.organization_id,m.user_id,m.role,m.status
            FROM public.organization_memberships m JOIN public.organizations o ON o.id=m.organization_id
            WHERE o.created_by_user_id=ANY($1::uuid[])`,
              [Object.values(users)],
            )
          ).rows,
        }));
      } catch {
        report.retained = { inspectionFailed: true };
        halted = true;
      }
    }
    await Promise.all(
      [...pools.values()].map(async (instance) => {
        try {
          await instance.end();
        } catch {
          connectionFailure = true;
        }
      }),
    );
  }
  report.conclusion =
    !halted &&
    !connectionFailure &&
    results.every((result) => result.status === "APROVADO")
      ? "APROVADA"
      : "BLOQUEADA";
  return report;
}
