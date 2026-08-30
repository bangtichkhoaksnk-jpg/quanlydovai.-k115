begin;

-- Server-only access required by API routes that evaluate private RLS helpers.
-- Public and anonymous roles remain blocked.
grant usage on schema private to service_role;
grant execute on function private.is_active_user() to service_role;
grant execute on function private.is_admin() to service_role;

commit;
