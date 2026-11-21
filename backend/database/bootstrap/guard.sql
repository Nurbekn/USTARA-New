-- No connection is opened here. Validate the dedicated session supplied by the operator.
DO $$
DECLARE
  schema_name TEXT := pg_catalog.current_schema();
  database_name TEXT := pg_catalog.current_database();
  schema_oid OID;
  public_schema_oid OID;
  btree_gist_oid OID;
  btree_gist_schema_oid OID;
  gist_int4_ops_oid OID;
  unexpected_objects TEXT;
BEGIN
  IF database_name NOT IN ('ustara_db','ustara_bootstrap_test') AND database_name !~ '^ustara_test_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'Fresh bootstrap: unexpected target database';
  END IF;
  IF (pg_catalog.inet_server_addr() IS NOT NULL
      AND NOT (pg_catalog.inet_server_addr() <<= '127.0.0.0/8'::inet
               OR pg_catalog.inet_server_addr() = '::1'::inet))
     OR (pg_catalog.inet_client_addr() IS NOT NULL
      AND NOT (pg_catalog.inet_client_addr() <<= '127.0.0.0/8'::inet
               OR pg_catalog.inet_client_addr() = '::1'::inet)) THEN
    RAISE EXCEPTION 'Fresh bootstrap: only a reviewed local server is allowed';
  END IF;
  IF schema_name IS NULL OR NOT (schema_name='public' OR
    ((database_name='ustara_bootstrap_test' OR database_name ~ '^ustara_test_[a-zA-Z0-9_]+$') AND schema_name ~ '^ustara_bootstrap_test_[a-z0-9_]+$')) THEN
    RAISE EXCEPTION 'Fresh bootstrap: unexpected target schema';
  END IF;
  -- Explicit pg_temp placement prevents implicit temporary-table shadowing.
  PERFORM pg_catalog.set_config('search_path',format('%I, pg_catalog, pg_temp',schema_name),false);
  PERFORM pg_catalog.set_config('lock_timeout','5s',false);
  -- Session lock spans the separately committed forward migrations. A dedicated
  -- session MUST disconnect on failure to release it. No blanket DDL guarantee.
  PERFORM pg_catalog.pg_advisory_lock(pg_catalog.hashtext(database_name),
    pg_catalog.hashtext('ustara-schema-ddl:' || schema_name));
  SELECT oid INTO schema_oid FROM pg_catalog.pg_namespace WHERE nspname=schema_name;
  SELECT oid INTO public_schema_oid FROM pg_catalog.pg_namespace WHERE nspname='public';

  SELECT e.oid,e.extnamespace INTO btree_gist_oid,btree_gist_schema_oid
  FROM pg_catalog.pg_extension e WHERE e.extname='btree_gist';
  IF btree_gist_oid IS NULL THEN
    RAISE EXCEPTION 'Fresh bootstrap: prerequisite missing; an administrator must install btree_gist in public';
  END IF;
  IF btree_gist_schema_oid IS DISTINCT FROM public_schema_oid THEN
    RAISE EXCEPTION 'Fresh bootstrap: btree_gist must be installed in public';
  END IF;
  SELECT opc.oid INTO gist_int4_ops_oid
  FROM pg_catalog.pg_opclass opc
  JOIN pg_catalog.pg_namespace n ON n.oid=opc.opcnamespace
  JOIN pg_catalog.pg_am am ON am.oid=opc.opcmethod
  WHERE n.nspname='public' AND opc.opcname='gist_int4_ops'
    AND am.amname='gist' AND opc.opcintype='integer'::regtype
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend d
      WHERE d.classid='pg_catalog.pg_opclass'::pg_catalog.regclass
        AND d.objid=opc.oid AND d.objsubid=0
        AND d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass
        AND d.refobjid=btree_gist_oid AND d.deptype='e'
    );
  IF gist_int4_ops_oid IS NULL THEN
    RAISE EXCEPTION 'Fresh bootstrap: prerequisite missing; public.gist_int4_ops must be owned by btree_gist';
  END IF;

  -- A custom bootstrap schema is always required to be empty. For public only,
  -- exempt objects that PostgreSQL records as members (or internal components)
  -- of this exact btree_gist extension. Do not whitelist by name.
  WITH RECURSIVE extension_owned(classid,objid,objsubid) AS (
    SELECT d.classid,d.objid,d.objsubid
    FROM pg_catalog.pg_depend d
    WHERE d.refclassid='pg_catalog.pg_extension'::pg_catalog.regclass
      AND d.refobjid=btree_gist_oid AND d.deptype='e'
    UNION
    SELECT d.classid,d.objid,d.objsubid
    FROM pg_catalog.pg_depend d
    JOIN extension_owned parent
      ON d.refclassid=parent.classid AND d.refobjid=parent.objid
     AND d.refobjsubid=parent.objsubid
    WHERE d.deptype='i'
  ), schema_objects(classid,objid,objsubid,object_schema,object_type,object_name) AS (
    SELECT 'pg_catalog.pg_class'::pg_catalog.regclass,c.oid,0::integer,c.relnamespace,
      'relation',c.relname::text FROM pg_catalog.pg_class c WHERE c.relnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_proc'::pg_catalog.regclass,p.oid,0::integer,p.pronamespace,
      'routine',p.proname::text FROM pg_catalog.pg_proc p WHERE p.pronamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_type'::pg_catalog.regclass,t.oid,0::integer,t.typnamespace,
      'type',t.typname::text FROM pg_catalog.pg_type t WHERE t.typnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_operator'::pg_catalog.regclass,o.oid,0::integer,o.oprnamespace,
      'operator',o.oprname::text FROM pg_catalog.pg_operator o WHERE o.oprnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_opclass'::pg_catalog.regclass,o.oid,0::integer,o.opcnamespace,
      'operator class',o.opcname::text FROM pg_catalog.pg_opclass o WHERE o.opcnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_opfamily'::pg_catalog.regclass,o.oid,0::integer,o.opfnamespace,
      'operator family',o.opfname::text FROM pg_catalog.pg_opfamily o WHERE o.opfnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_collation'::pg_catalog.regclass,c.oid,0::integer,c.collnamespace,
      'collation',c.collname::text FROM pg_catalog.pg_collation c WHERE c.collnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_conversion'::pg_catalog.regclass,c.oid,0::integer,c.connamespace,
      'conversion',c.conname::text FROM pg_catalog.pg_conversion c WHERE c.connamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_statistic_ext'::pg_catalog.regclass,s.oid,0::integer,s.stxnamespace,
      'extended statistic',s.stxname::text FROM pg_catalog.pg_statistic_ext s WHERE s.stxnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_ts_config'::pg_catalog.regclass,c.oid,0::integer,c.cfgnamespace,
      'text search configuration',c.cfgname::text FROM pg_catalog.pg_ts_config c WHERE c.cfgnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_ts_dict'::pg_catalog.regclass,d.oid,0::integer,d.dictnamespace,
      'text search dictionary',d.dictname::text FROM pg_catalog.pg_ts_dict d WHERE d.dictnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_ts_parser'::pg_catalog.regclass,p.oid,0::integer,p.prsnamespace,
      'text search parser',p.prsname::text FROM pg_catalog.pg_ts_parser p WHERE p.prsnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_ts_template'::pg_catalog.regclass,t.oid,0::integer,t.tmplnamespace,
      'text search template',t.tmplname::text FROM pg_catalog.pg_ts_template t WHERE t.tmplnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_extension'::pg_catalog.regclass,e.oid,0::integer,e.extnamespace,
      'extension',e.extname::text FROM pg_catalog.pg_extension e WHERE e.extnamespace=schema_oid
    UNION ALL
    SELECT 'pg_catalog.pg_default_acl'::pg_catalog.regclass,a.oid,0::integer,a.defaclnamespace,
      'default privilege',a.oid::text FROM pg_catalog.pg_default_acl a WHERE a.defaclnamespace=schema_oid
  )
  SELECT pg_catalog.string_agg(
      pg_catalog.format('%s %I',o.object_type,o.object_name),', '
      ORDER BY o.object_type,o.object_name)
    INTO unexpected_objects
  FROM schema_objects o
  WHERE o.object_schema=schema_oid
    AND NOT (
    schema_name='public'
    AND (
      (o.classid='pg_catalog.pg_extension'::pg_catalog.regclass AND o.objid=btree_gist_oid)
      OR EXISTS (SELECT 1 FROM extension_owned owned
        WHERE owned.classid=o.classid AND owned.objid=o.objid AND owned.objsubid=o.objsubid)
    )
  );
  IF unexpected_objects IS NOT NULL THEN
    RAISE EXCEPTION 'Fresh bootstrap: target schema contains non-bootstrap objects: %',unexpected_objects;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace=pg_catalog.pg_my_temp_schema()) THEN
    RAISE EXCEPTION 'Fresh bootstrap: session has temporary relations';
  END IF;
END $$;
