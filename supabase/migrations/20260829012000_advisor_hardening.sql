-- Address actionable Supabase Security/Performance Advisor findings.

create index if not exists idx_issue_package_items_item_id
on public.issue_package_items(item_id);

alter function public.apply_stock_transaction(jsonb,text,date,uuid,text,text,text)
security invoker;

drop policy if exists app_users_no_direct_access on public.app_users;
create policy app_users_no_direct_access on public.app_users
for all to public
using (false)
with check (false);

drop policy if exists profiles_admin_write on public.profiles;
drop policy if exists profiles_admin_insert on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_insert on public.profiles
for insert to authenticated
with check ((select private.is_admin()));
create policy profiles_admin_update on public.profiles
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
create policy profiles_admin_delete on public.profiles
for delete to authenticated
using ((select private.is_admin()));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'settings','departments','staff','catalog_items','issue_packages','issue_package_items'
  ] loop
    execute format('drop policy if exists admin_write on public.%I', table_name);
    execute format('drop policy if exists admin_insert on public.%I', table_name);
    execute format('drop policy if exists admin_update on public.%I', table_name);
    execute format('drop policy if exists admin_delete on public.%I', table_name);
    execute format(
      'create policy admin_insert on public.%I for insert to authenticated with check ((select private.is_admin()))',
      table_name
    );
    execute format(
      'create policy admin_update on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      table_name
    );
    execute format(
      'create policy admin_delete on public.%I for delete to authenticated using ((select private.is_admin()))',
      table_name
    );
  end loop;
end $$;
