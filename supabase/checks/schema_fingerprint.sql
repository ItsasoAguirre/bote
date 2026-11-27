-- Fingerprint of the app's schema, to check that two environments match.
-- Run it in each project (SQL Editor or MCP) and compare the hashes: equal hash = same definition.
with parts(kind, item) as (
  select 'columns', table_name || '.' || column_name || ' ' || data_type || ' ' || is_nullable || ' ' || coalesce(column_default, '')
    from information_schema.columns where table_schema = 'public'
  union all
  select 'constraints', conrelid::regclass || ' ' || conname || ' ' || pg_get_constraintdef(oid)
    from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'indexes', indexdef from pg_indexes where schemaname = 'public'
  union all
  select 'policies', tablename || ' ' || policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '')
    from pg_policies where schemaname = 'public'
  union all
  select 'table_grants', table_name || ' ' || grantee || ' ' || privilege_type
    from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all
  select 'column_grants', table_name || '.' || column_name || ' ' || grantee || ' ' || privilege_type
    from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all
  select 'functions', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid))
    || ' acl=' || coalesce(p.proacl::text, '')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private')
  union all
  select 'rls', relname || ' ' || relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
  union all
  select 'realtime', tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
  union all
  select 'cron', jobname || ' ' || schedule || ' ' || command from cron.job
  union all
  select 'triggers', t.tgrelid::regclass || ' ' || t.tgname || ' ' || pg_get_triggerdef(t.oid)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  union all
  select 'migrations', version || ' ' || name from supabase_migrations.schema_migrations
)
select kind, count(*) as items, md5(string_agg(item, E'\n' order by item)) as hash
from parts group by kind
union all
select 'ALL', count(*), md5(string_agg(kind || ':' || item, E'\n' order by kind, item)) from parts
order by kind;
