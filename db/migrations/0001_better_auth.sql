-- Better Auth 1.7.18, built-in PostgreSQL adapter.
-- Names/fields match src/server/auth/options.ts; IDs use generateId: "uuid".
-- Applied only by the guarded RoutePay local migration runner, never at startup.

CREATE TABLE public.auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  email_verified boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX auth_users_email_lower_idx ON public.auth_users (lower(email));

CREATE TABLE public.auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_expiration CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_id_idx ON public.auth_sessions (user_id);
CREATE INDEX auth_sessions_expires_at_idx ON public.auth_sessions (expires_at);

CREATE TABLE public.auth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  account_id text NOT NULL,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_accounts_provider_identity UNIQUE (provider_id, account_id),
  CONSTRAINT auth_accounts_no_password CHECK (password IS NULL)
);
CREATE INDEX auth_accounts_user_id_idx ON public.auth_accounts (user_id);

CREATE TABLE public.auth_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_verifications_identifier_idx ON public.auth_verifications (identifier);
CREATE INDEX auth_verifications_expires_at_idx ON public.auth_verifications (expires_at);

-- Explicit local ACLs: the runner creates the history table before this file.
-- Reset direct/default grants before assigning the minimum set.
REVOKE CREATE, TEMPORARY ON DATABASE routepay_dev FROM PUBLIC, routepay_app;
GRANT CONNECT ON DATABASE routepay_dev TO routepay_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, routepay_app;
GRANT USAGE ON SCHEMA public TO routepay_app;

REVOKE ALL PRIVILEGES ON TABLE
  public.auth_users,
  public.auth_sessions,
  public.auth_accounts,
  public.auth_verifications,
  public.routepay_schema_migrations
FROM PUBLIC, routepay_app;

GRANT SELECT, INSERT, UPDATE ON TABLE public.auth_users TO routepay_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.auth_sessions,
  public.auth_accounts,
  public.auth_verifications
TO routepay_app;

-- PostgreSQL has no DENY: inherited grants can survive a direct REVOKE.
-- Abort instead of modifying cluster-wide role memberships.
DO $routepay_permissions$
DECLARE
  auth_table text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN ('routepay_app', 'routepay_migrator')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) OR pg_catalog.pg_has_role('routepay_app', 'routepay_migrator', 'MEMBER') THEN
    RAISE EXCEPTION 'Papéis RoutePay incompatíveis com a separação de privilégios.';
  END IF;

  IF pg_catalog.has_database_privilege('routepay_app', 'routepay_dev', 'CREATE, TEMPORARY')
    OR pg_catalog.has_schema_privilege('routepay_app', 'public', 'CREATE')
    OR pg_catalog.has_table_privilege('routepay_app', 'public.routepay_schema_migrations',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
    OR pg_catalog.has_table_privilege('routepay_app', 'public.auth_users', 'DELETE') THEN
    RAISE EXCEPTION 'Permissões efetivas RoutePay excedem o escopo autorizado.';
  END IF;

  FOREACH auth_table IN ARRAY ARRAY[
    'public.auth_users', 'public.auth_sessions',
    'public.auth_accounts', 'public.auth_verifications'
  ] LOOP
    IF pg_catalog.has_table_privilege('routepay_app', auth_table,
      'TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, SELECT WITH GRANT OPTION, INSERT WITH GRANT OPTION, UPDATE WITH GRANT OPTION, DELETE WITH GRANT OPTION') THEN
      RAISE EXCEPTION 'Permissões efetivas RoutePay excedem o escopo autorizado.';
    END IF;
  END LOOP;
END;
$routepay_permissions$;
