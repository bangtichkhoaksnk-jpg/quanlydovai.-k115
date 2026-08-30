-- Supabase Auth + RLS for QLDV Turbo 1.2.0 / web 2.1.0.
-- This migration is additive and keeps all existing operational data.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('ADMIN', 'STAFF')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_invites (
  email text primary key,
  full_name text not null,
  role text not null check (role in ('ADMIN', 'STAFF')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.user_invites(email, full_name, role, active)
values ('cssdngoaikhoa115@gmail.com', 'Phạm Văn Tú', 'ADMIN', true)
on conflict (email) do update
set full_name = excluded.full_name, role = excluded.role, active = excluded.active;

create or replace function private.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare invited public.user_invites%rowtype;
begin
  select * into invited
  from public.user_invites
  where lower(email) = lower(new.email);

  if invited.email is null then
    raise exception 'Tài khoản chưa được quản trị viên cấp quyền.';
  end if;

  insert into public.profiles(id, email, full_name, role, active)
  values (new.id, lower(new.email), invited.full_name, invited.role, invited.active)
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      active = excluded.active,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_qldv on auth.users;
create trigger on_auth_user_created_qldv
after insert or update of email on auth.users
for each row execute function private.create_profile_for_auth_user();

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active and role = 'ADMIN'
  );
$$;

revoke all on function private.is_active_user() from public, anon;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_admin() to authenticated;

alter table public.patients add column if not exists source_id text unique;
alter table public.collections add column if not exists collection_no text unique;
alter table public.losses add column if not exists source_id text unique;
alter table public.inventories add column if not exists inventory_no text unique;
alter table public.audit_logs add column if not exists source_id text unique;

create index if not exists idx_patients_department_id on public.patients(department_id);
create index if not exists idx_patients_active_department on public.patients(department_id) where status = 'ACTIVE';
create index if not exists idx_issue_slips_patient_date on public.issue_slips(patient_id, issue_date desc);
create index if not exists idx_issue_items_slip_id on public.issue_items(slip_id);
create index if not exists idx_issue_items_item_id on public.issue_items(item_id);
create index if not exists idx_collections_patient_date on public.collections(patient_id, collection_date desc);
create index if not exists idx_collection_items_collection_id on public.collection_items(collection_id);
create index if not exists idx_collection_items_item_id on public.collection_items(item_id);
create index if not exists idx_losses_patient_id on public.losses(patient_id);
create index if not exists idx_losses_collection_id on public.losses(collection_id);
create index if not exists idx_losses_item_date on public.losses(item_id, loss_date desc);
create index if not exists idx_warehouse_transactions_item_date on public.warehouse_transactions(item_id, transaction_date desc);
create index if not exists idx_warehouse_transactions_patient_id on public.warehouse_transactions(patient_id);
create index if not exists idx_inventories_department_id on public.inventories(department_id);
create index if not exists idx_inventory_items_inventory_id on public.inventory_items(inventory_id);
create index if not exists idx_inventory_items_item_id on public.inventory_items(item_id);

create or replace function public.apply_stock_transaction(
  p_lines jsonb,
  p_type text,
  p_date date,
  p_patient_id uuid,
  p_department text,
  p_performed_by text,
  p_note text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stock_item uuid;
  requested numeric;
  current_qty numeric;
  next_qty numeric;
begin
  if not private.is_active_user() then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_type not in ('RECEIPT', 'ADMISSION_ISSUE', 'EMERGENCY_ISSUE') then
    raise exception 'Loại giao dịch kho không hợp lệ';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Phiếu kho chưa có mặt hàng';
  end if;

  -- Aggregate duplicate items and lock rows in a stable UUID order.
  for stock_item, requested in
    select (line->>'itemId')::uuid, sum((line->>'quantity')::numeric)
    from jsonb_array_elements(p_lines) as line
    group by (line->>'itemId')::uuid
    order by (line->>'itemId')::uuid
  loop
    if requested <= 0 then
      raise exception 'Số lượng phải lớn hơn 0';
    end if;

    select quantity into current_qty
    from public.warehouse_stock
    where item_id = stock_item
    for update;

    if current_qty is null then
      raise exception 'Không tìm thấy mặt hàng trong kho';
    end if;

    if p_type <> 'RECEIPT' and current_qty < requested then
      raise exception 'KHÔNG ĐỦ TỒN KHO: tồn %, cần %', current_qty, requested;
    end if;

    update public.warehouse_stock
    set quantity = case when p_type = 'RECEIPT' then quantity + requested else quantity - requested end,
        updated_at = now()
    where item_id = stock_item
    returning quantity into next_qty;

    insert into public.warehouse_transactions(
      transaction_date, transaction_type, item_id, in_qty, out_qty,
      balance_after, patient_id, department, performed_by, note
    ) values (
      coalesce(p_date, current_date), p_type, stock_item,
      case when p_type = 'RECEIPT' then requested else 0 end,
      case when p_type = 'RECEIPT' then 0 else requested end,
      next_qty, p_patient_id, p_department, p_performed_by, p_note
    );
  end loop;
end;
$$;

revoke all on function public.apply_stock_transaction(jsonb,text,date,uuid,text,text,text) from public, anon;
grant execute on function public.apply_stock_transaction(jsonb,text,date,uuid,text,text,text) to authenticated;

alter table public.profiles enable row level security;
alter table public.user_invites enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists invites_admin_all on public.user_invites;
create policy invites_admin_all on public.user_invites
for all to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- Active staff can use operational records; only admins can edit configuration.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'patients','issue_slips','issue_items','collections','collection_items','losses',
    'warehouse_stock','warehouse_transactions','inventories','inventory_items','audit_logs'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists active_user_all on public.%I', table_name);
    execute format(
      'create policy active_user_all on public.%I for all to authenticated using ((select private.is_active_user())) with check ((select private.is_active_user()))',
      table_name
    );
  end loop;

  foreach table_name in array array[
    'settings','departments','staff','catalog_items','issue_packages','issue_package_items'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists active_user_read on public.%I', table_name);
    execute format('drop policy if exists admin_write on public.%I', table_name);
    execute format(
      'create policy active_user_read on public.%I for select to authenticated using ((select private.is_active_user()))',
      table_name
    );
    execute format(
      'create policy admin_write on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
      table_name
    );
  end loop;
end $$;

revoke all on all tables in schema public from anon;
revoke all on public.app_users from authenticated;

grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.user_invites to authenticated;
grant select on public.settings, public.departments, public.staff, public.catalog_items,
  public.issue_packages, public.issue_package_items to authenticated;
grant insert, update, delete on public.settings, public.departments, public.staff,
  public.catalog_items, public.issue_packages, public.issue_package_items to authenticated;
grant select, insert, update, delete on public.patients, public.issue_slips,
  public.issue_items, public.collections, public.collection_items, public.losses,
  public.warehouse_stock, public.warehouse_transactions, public.inventories,
  public.inventory_items, public.audit_logs to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 8388608,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects
for select to authenticated
using (
  bucket_id = 'documents' and
  ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
);

drop policy if exists documents_insert_own on storage.objects;
create policy documents_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'documents' and
  (storage.foldername(name))[1] = (select auth.uid())::text and
  (select private.is_active_user())
);

drop policy if exists documents_update_own on storage.objects;
create policy documents_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'documents' and
  ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
)
with check (
  bucket_id = 'documents' and
  ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
);

drop policy if exists documents_delete_own on storage.objects;
create policy documents_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'documents' and
  ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
);
