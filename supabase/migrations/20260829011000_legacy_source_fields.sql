-- Traceability fields used while migrating the original Google Sheets database.

alter table public.catalog_items add column if not exists issuable boolean not null default true;
alter table public.issue_items add column if not exists source_id text unique;
alter table public.collections add column if not exists collection_type text;
alter table public.collections add column if not exists department_name text;
alter table public.collections add column if not exists shortage_document_url text;
alter table public.collection_items add column if not exists source_id text unique;
alter table public.inventory_items add column if not exists source_id text unique;

create index if not exists idx_issue_items_source_id on public.issue_items(source_id);
create index if not exists idx_collection_items_source_id on public.collection_items(source_id);
create index if not exists idx_inventory_items_source_id on public.inventory_items(source_id);
