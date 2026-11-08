-- RoutePay organizations, PostgreSQL 18+. Prepared only; never applied at startup.
-- Trust boundary: routepay_app is a trusted server identity, NOT an end user.
-- Transaction-local routepay.user_id is supplied after Better Auth verification.
-- Possession of the application DB credential allows impersonating this context.
-- Names: 1..120 Unicode code points, canonical ECMAScript trim(), no Cc/Cf.
-- Explicit Unicode 17.0 ranges avoid locale-dependent character classes.
-- NUL and isolated surrogates cannot be represented in PostgreSQL UTF-8 text.
-- Keep both predicates aligned with domain/name tests; no normalization to NFC.

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id uuid NOT NULL REFERENCES public.auth_users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  lock_version bigint NOT NULL DEFAULT 1,
  CONSTRAINT organizations_name CHECK (
    name = btrim(name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    AND char_length(name) BETWEEN 1 AND 120
    AND name COLLATE "C" !~ U&'[\0001-\001F\007F-\009F\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B-\200F\202A-\202E\2060-\2064\2066-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]'
  ),
  CONSTRAINT organizations_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT organizations_deactivation CHECK (
    (status = 'INACTIVE') = (deactivated_at IS NOT NULL)
  ),
  CONSTRAINT organizations_version CHECK (lock_version > 0)
);
CREATE INDEX organizations_created_by_idx ON public.organizations (created_by_user_id);

CREATE TABLE public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.auth_users(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  CONSTRAINT organization_memberships_identity UNIQUE (organization_id, user_id),
  CONSTRAINT organization_memberships_role CHECK (role IN ('OWNER', 'ADMIN', 'OPERATOR')),
  CONSTRAINT organization_memberships_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REMOVED')),
  CONSTRAINT organization_memberships_removal CHECK (
    (status = 'REMOVED') = (removed_at IS NOT NULL)
  ),
  CONSTRAINT organization_memberships_version CHECK (version > 0)
);
CREATE INDEX organization_memberships_user_idx
  ON public.organization_memberships (user_id, organization_id);
CREATE INDEX organization_memberships_active_owners_idx
  ON public.organization_memberships (organization_id)
  WHERE status = 'ACTIVE' AND role = 'OWNER';

-- Internal trigger functions deliberately inspect all rows as the table owner.
-- Do not FORCE RLS without redesigning and testing this integrity path.
CREATE FUNCTION public.routepay_guard_organization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $body$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Exclusão física de organização não permitida.';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Identidade de organização imutável.';
  END IF;
  NEW.updated_at := pg_catalog.statement_timestamp();
  NEW.lock_version := OLD.lock_version + 1;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER organizations_guard
  BEFORE UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.routepay_guard_organization();

CREATE FUNCTION public.routepay_guard_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $body$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Exclusão física de vínculo não permitida.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Identidade de vínculo imutável.';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'ACTIVE' AND NEW.status IN ('SUSPENDED', 'REMOVED'))
      OR (OLD.status = 'SUSPENDED' AND NEW.status IN ('ACTIVE', 'REMOVED'))
      OR (OLD.status = 'REMOVED' AND NEW.status = 'ACTIVE')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Transição de vínculo não permitida.';
    END IF;
    NEW.updated_at := pg_catalog.statement_timestamp();
    NEW.version := OLD.version + 1;
  END IF;

  -- A real parent UPDATE serializes all membership writes and changes its MVCC
  -- version. Merely counting owners, or locking only in a deferred trigger,
  -- would permit write skew. Future admin routines must lock parent FIRST.
  UPDATE public.organizations AS o SET lock_version = o.lock_version + 1
    WHERE o.id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Organização inválida.';
  END IF;
  RETURN NEW;
END;
$body$;

CREATE TRIGGER organization_memberships_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.routepay_guard_membership();

CREATE FUNCTION public.routepay_require_active_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $body$
DECLARE
  organization_uuid uuid;
BEGIN
  IF TG_TABLE_NAME = 'organizations' THEN
    organization_uuid := NEW.id;
  ELSE
    organization_uuid := NEW.organization_id;
  END IF;
  -- Inspect final state, not the NEW image captured when the event was queued.
  IF EXISTS (
    SELECT 1 FROM public.organizations AS o
    WHERE o.id = organization_uuid AND o.status = 'ACTIVE'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.organization_memberships AS m
    WHERE m.organization_id = organization_uuid
      AND m.role = 'OWNER' AND m.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Organização ativa exige proprietário ativo.';
  END IF;
  RETURN NULL;
END;
$body$;

CREATE CONSTRAINT TRIGGER organizations_require_owner
  AFTER INSERT OR UPDATE ON public.organizations
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.routepay_require_active_owner();
CREATE CONSTRAINT TRIGGER organization_memberships_require_owner
  AFTER INSERT OR UPDATE ON public.organization_memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.routepay_require_active_owner();

-- This is context validation, not authentication of a Google user by PostgreSQL.
CREATE FUNCTION public.routepay_current_actor()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $body$
DECLARE
  actor_text text := pg_catalog.current_setting('routepay.user_id', true);
  actor_uuid uuid;
BEGIN
  IF session_user <> 'routepay_app' OR actor_text IS NULL OR actor_text = '' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Contexto de acesso ausente.';
  END IF;
  BEGIN
    actor_uuid := actor_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Contexto de acesso inválido.';
  END;
  IF NOT EXISTS (
    SELECT 1 FROM public.auth_users AS u WHERE u.id = actor_uuid AND u.email_verified
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Identidade não autorizada.';
  END IF;
  RETURN actor_uuid;
END;
$body$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

-- No self-referencing membership policy, hence no recursive RLS evaluation.
CREATE POLICY organization_memberships_read_self
  ON public.organization_memberships FOR SELECT TO routepay_app
  USING (user_id = public.routepay_current_actor() AND status = 'ACTIVE');
CREATE POLICY organizations_read_member
  ON public.organizations FOR SELECT TO routepay_app
  USING (EXISTS (
    SELECT 1 FROM public.organization_memberships AS m
    WHERE m.organization_id = organizations.id
      AND m.user_id = public.routepay_current_actor() AND m.status = 'ACTIVE'
      AND (organizations.status = 'ACTIVE' OR m.role = 'OWNER')
  ));

-- The ONLY exposed mutation: no actor, role or owner is accepted as an argument.
-- Execute and ACL changes are committed atomically by the existing runner.
CREATE FUNCTION public.routepay_create_organization(organization_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $body$
DECLARE
  actor_uuid uuid := public.routepay_current_actor();
  organization_uuid uuid;
BEGIN
  IF organization_name IS NULL
    OR organization_name <> pg_catalog.btrim(organization_name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    OR pg_catalog.char_length(organization_name) NOT BETWEEN 1 AND 120
    OR organization_name COLLATE "C" ~ U&'[\0001-\001F\007F-\009F\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B-\200F\202A-\202E\2060-\2064\2066-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Nome de organização inválido.';
  END IF;
  INSERT INTO public.organizations (name, created_by_user_id)
    VALUES (organization_name, actor_uuid) RETURNING id INTO organization_uuid;
  -- Creation already owns its new parent row before inserting the first child.
  -- Future admin routines: lock existing parents first, then memberships, ordered
  -- by UUID at each level. The membership trigger alone cannot impose that order.
  INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
    VALUES (organization_uuid, actor_uuid, 'OWNER', 'ACTIVE');
  RETURN organization_uuid;
END;
$body$;

REVOKE ALL PRIVILEGES ON TABLE public.organizations, public.organization_memberships
  FROM PUBLIC, routepay_app;
GRANT SELECT ON TABLE public.organizations, public.organization_memberships TO routepay_app;

REVOKE ALL PRIVILEGES ON FUNCTION public.routepay_guard_organization(),
  public.routepay_guard_membership(), public.routepay_require_active_owner(),
  public.routepay_current_actor(), public.routepay_create_organization(text)
  FROM PUBLIC, routepay_app;
GRANT EXECUTE ON FUNCTION public.routepay_current_actor(),
  public.routepay_create_organization(text) TO routepay_app;

-- Abort rather than relying only on direct grants when inherited privileges exist.
DO $routepay_organization_permissions$
DECLARE
  relation_name text;
BEGIN
  IF current_user <> 'routepay_migrator'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname IN ('routepay_app', 'routepay_migrator')
        AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
    )
    OR pg_catalog.pg_has_role('routepay_app', 'routepay_migrator', 'MEMBER')
    OR pg_catalog.has_database_privilege('routepay_app', 'routepay_dev', 'CREATE, TEMPORARY')
    OR pg_catalog.has_schema_privilege('routepay_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Separação de privilégios RoutePay inválida.';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY['public.organizations', 'public.organization_memberships'] LOOP
    IF pg_catalog.has_table_privilege('routepay_app', relation_name,
      'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, SELECT WITH GRANT OPTION')
      OR (SELECT pg_catalog.pg_get_userbyid(c.relowner) <> 'routepay_migrator'
          FROM pg_catalog.pg_class AS c WHERE c.oid = relation_name::regclass) THEN
      RAISE EXCEPTION 'Permissões empresariais RoutePay excessivas.';
    END IF;
  END LOOP;
  IF pg_catalog.has_function_privilege('routepay_app', 'public.routepay_guard_organization()', 'EXECUTE')
    OR pg_catalog.has_function_privilege('routepay_app', 'public.routepay_guard_membership()', 'EXECUTE')
    OR pg_catalog.has_function_privilege('routepay_app', 'public.routepay_require_active_owner()', 'EXECUTE')
    OR pg_catalog.has_table_privilege('routepay_app', 'public.routepay_schema_migrations',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN') THEN
    RAISE EXCEPTION 'Acesso administrativo RoutePay não permitido.';
  END IF;
END;
$routepay_organization_permissions$;
