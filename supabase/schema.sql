create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(), username text unique not null,
  password_hash text not null, full_name text not null, role text not null check (role in ('ADMIN','STAFF')),
  active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists settings (
  key text primary key, value text not null default '', description text, updated_at timestamptz default now()
);
create table if not exists departments (
  id uuid primary key default gen_random_uuid(), code text unique not null, name text not null,
  active boolean not null default true, sort_order int not null default 0
);
create table if not exists staff (
  id uuid primary key default gen_random_uuid(), code text unique not null, full_name text not null,
  department text, role text default 'NHAN_VIEN', active boolean not null default true
);
create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(), code text unique not null, name text not null,
  item_type text not null check (item_type in ('LINEN','SUPPLY')), item_group text,
  unit text not null default 'cái', default_qty numeric not null default 1,
  collectable boolean not null default true, active boolean not null default true, sort_order int default 0
);
create table if not exists issue_packages (
  id uuid primary key default gen_random_uuid(), code text unique not null, name text not null,
  active boolean not null default true, sort_order int default 0
);
create table if not exists issue_package_items (
  package_id uuid references issue_packages(id) on delete cascade,
  item_id uuid references catalog_items(id) on delete cascade,
  quantity numeric not null default 1, active boolean not null default true,
  primary key(package_id,item_id)
);
create table if not exists patients (
  id uuid primary key default gen_random_uuid(), medical_code text unique not null, full_name text not null,
  gender text, department_id uuid references departments(id), admission_date date not null default current_date,
  discharge_date date, status text not null default 'ACTIVE' check(status in ('ACTIVE','DISCHARGED')),
  note text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists issue_slips (
  id uuid primary key default gen_random_uuid(), slip_no text unique not null,
  patient_id uuid references patients(id), issue_date date not null, issuer text not null,
  receiver text, package_name text, note text, image_url text, created_at timestamptz default now()
);
create table if not exists issue_items (
  id uuid primary key default gen_random_uuid(), slip_id uuid references issue_slips(id) on delete cascade,
  item_id uuid references catalog_items(id), quantity numeric not null check(quantity>0), created_at timestamptz default now()
);
create table if not exists collections (
  id uuid primary key default gen_random_uuid(), patient_id uuid references patients(id), collection_date date not null,
  collector text not null, deliverer text, discharged boolean default false, note text, image_url text, created_at timestamptz default now()
);
create table if not exists collection_items (
  id uuid primary key default gen_random_uuid(), collection_id uuid references collections(id) on delete cascade,
  item_id uuid references catalog_items(id), borrowed_qty numeric not null default 0,
  returned_qty numeric not null default 0, missing_qty numeric not null default 0
);
create table if not exists losses (
  id uuid primary key default gen_random_uuid(), patient_id uuid references patients(id), collection_id uuid references collections(id),
  item_id uuid references catalog_items(id), loss_date date not null, quantity numeric not null,
  reason text, resolution text, recorder text, note text, created_at timestamptz default now()
);
create table if not exists warehouse_stock (
  item_id uuid primary key references catalog_items(id) on delete cascade,
  quantity numeric not null default 0, warning_level numeric not null default 10, updated_at timestamptz default now()
);
create table if not exists warehouse_transactions (
  id uuid primary key default gen_random_uuid(), transaction_date date not null default current_date,
  transaction_type text not null check(transaction_type in ('RECEIPT','ADMISSION_ISSUE','EMERGENCY_ISSUE','ADJUSTMENT')),
  item_id uuid references catalog_items(id), in_qty numeric not null default 0, out_qty numeric not null default 0,
  balance_after numeric not null, patient_id uuid references patients(id), department text,
  performed_by text not null, note text, created_at timestamptz default now()
);
create table if not exists inventories (
  id uuid primary key default gen_random_uuid(), inventory_time timestamptz not null default now(),
  department_id uuid references departments(id), scope text not null check(scope in ('DEPARTMENT','HOSPITAL')),
  performed_by text not null, patient_count int not null default 0, note text
);
create table if not exists inventory_items (
  id uuid primary key default gen_random_uuid(), inventory_id uuid references inventories(id) on delete cascade,
  item_id uuid references catalog_items(id), expected_qty numeric default 0, actual_qty numeric default 0
);
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(), user_name text, action text not null,
  entity text, entity_id text, detail text, created_at timestamptz default now()
);

create or replace function apply_stock_transaction(
  p_lines jsonb, p_type text, p_date date, p_patient_id uuid,
  p_department text, p_performed_by text, p_note text
) returns void language plpgsql security definer as $$
declare r jsonb; current_qty numeric; next_qty numeric; requested numeric; stock_item uuid;
begin
  if p_type not in ('RECEIPT','ADMISSION_ISSUE','EMERGENCY_ISSUE') then raise exception 'Loại giao dịch kho không hợp lệ'; end if;
  for r in select * from jsonb_array_elements(p_lines) loop
    stock_item := (r->>'itemId')::uuid; requested := (r->>'quantity')::numeric;
    if requested <= 0 then raise exception 'Số lượng phải lớn hơn 0'; end if;
    select quantity into current_qty from warehouse_stock where item_id=stock_item for update;
    if current_qty is null then raise exception 'Không tìm thấy mặt hàng trong kho'; end if;
    if p_type <> 'RECEIPT' and current_qty < requested then raise exception 'KHÔNG ĐỦ TỒN KHO: tồn %, cần %',current_qty,requested; end if;
  end loop;
  for r in select * from jsonb_array_elements(p_lines) loop
    stock_item := (r->>'itemId')::uuid; requested := (r->>'quantity')::numeric;
    update warehouse_stock set quantity=case when p_type='RECEIPT' then quantity+requested else quantity-requested end,updated_at=now() where item_id=stock_item returning quantity into next_qty;
    insert into warehouse_transactions(transaction_date,transaction_type,item_id,in_qty,out_qty,balance_after,patient_id,department,performed_by,note)
    values(coalesce(p_date,current_date),p_type,stock_item,case when p_type='RECEIPT' then requested else 0 end,case when p_type='RECEIPT' then 0 else requested end,next_qty,p_patient_id,p_department,p_performed_by,p_note);
  end loop;
end $$;
revoke all on function apply_stock_transaction(jsonb,text,date,uuid,text,text,text) from public,anon,authenticated;
grant execute on function apply_stock_transaction(jsonb,text,date,uuid,text,text,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documents','documents',false,8388608,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=8388608;

create index if not exists idx_patients_status on patients(status);
create index if not exists idx_issue_patient on issue_slips(patient_id);
create index if not exists idx_loss_date on losses(loss_date);
create index if not exists idx_warehouse_date on warehouse_transactions(transaction_date);

insert into settings(key,value,description) values
 ('HOSPITAL_NAME','BỆNH VIỆN NGOẠI KHOA 115 NGHỆ AN','Tên bệnh viện'),
 ('DEPARTMENT_NAME','KHOA KIỂM SOÁT NHIỄM KHUẨN','Đơn vị quản lý'),
 ('APP_TITLE','HỆ THỐNG QUẢN LÝ ĐỒ VẢI','Tên phần mềm'),
 ('MANAGER_NAME','Phạm Văn Tú','Người quản lý'),
 ('SLOGAN','Tận tâm – Tận tình – Nâng tầm chất lượng','Khẩu hiệu'),
 ('LOGO_URL','','Đường dẫn logo')
on conflict(key) do nothing;

insert into departments(code,name,sort_order) values
 ('HSTC','Khoa Hồi sức tích cực',1),('CTCH','Khoa Chấn thương chỉnh hình',2),
 ('NGTH','Khoa Ngoại tổng hợp',3),('TKLCK','Khoa Thần kinh - Lồng ngực',4),
 ('GMHS','Khoa Gây mê hồi sức',5),('CC','Khoa Cấp cứu',6),('KB','Khoa Khám bệnh',7)
on conflict(code) do nothing;

insert into staff(code,full_name,department,role) values
 ('NV001','Phạm Văn Tú','Khoa Kiểm soát nhiễm khuẩn','QUAN_LY')
on conflict(code) do nothing;

insert into catalog_items(code,name,item_type,item_group,unit,default_qty,collectable,sort_order) values
 ('DV001','Áo người bệnh nam','LINEN','TUI_NAM','cái',1,true,1),
 ('DV002','Quần người bệnh nam','LINEN','TUI_NAM','cái',1,true,2),
 ('DV003','Áo người bệnh nữ','LINEN','TUI_NU','cái',1,true,3),
 ('DV004','Váy người bệnh nữ','LINEN','TUI_NU','cái',1,true,4),
 ('DV005','Ga giường','LINEN','DUNG_CHUNG','cái',1,true,5),
 ('DV006','Vỏ gối','LINEN','DUNG_CHUNG','cái',1,true,6),
 ('DV007','Ruột gối','LINEN','VAT_TU_KHAC','cái',1,true,7),
 ('DV008','Chăn','LINEN','VAT_TU_KHAC','cái',1,true,8),
 ('DV009','Gác chân','LINEN','VAT_TU_KHAC','cái',1,true,9),
 ('DV010','Tã vải','LINEN','VAT_TU_KHAC','cái',1,true,10),
 ('DV011','Áo trẻ em','LINEN','TRE_EM','cái',1,true,11),
 ('DV012','Quần trẻ em','LINEN','TRE_EM','cái',1,true,12),
 ('VT001','Giấy vệ sinh','SUPPLY','VAT_TU','cuộn',1,false,101),
 ('VT002','Túi đựng đồ cá nhân','SUPPLY','VAT_TU','túi',1,false,102),
 ('VT003','Khăn giấy','SUPPLY','VAT_TU','gói',1,false,103)
on conflict(code) do nothing;

insert into issue_packages(code,name,sort_order) values
 ('GOI_NAM','Túi nam',1),('GOI_NU','Túi nữ',2),('GOI_TRE_EM','Túi trẻ em',3),('GOI_PYC','Phòng yêu cầu',4)
on conflict(code) do nothing;

insert into issue_package_items(package_id,item_id,quantity)
select p.id,i.id,1 from issue_packages p join catalog_items i on
 (p.code='GOI_NAM' and i.code in ('DV001','DV002','DV005','DV006')) or
 (p.code='GOI_NU' and i.code in ('DV003','DV004','DV005','DV006')) or
 (p.code='GOI_TRE_EM' and i.code in ('DV011','DV012','DV005','DV006')) or
 (p.code='GOI_PYC' and i.code in ('DV005','DV006','DV007','DV008','VT001','VT002','VT003'))
on conflict(package_id,item_id) do nothing;

insert into warehouse_stock(item_id,quantity,warning_level)
select id,0,10 from catalog_items on conflict(item_id) do nothing;

alter table app_users enable row level security;
alter table settings enable row level security;
alter table departments enable row level security;
alter table staff enable row level security;
alter table catalog_items enable row level security;
alter table issue_packages enable row level security;
alter table issue_package_items enable row level security;
alter table patients enable row level security;
alter table issue_slips enable row level security;
alter table issue_items enable row level security;
alter table collections enable row level security;
alter table collection_items enable row level security;
alter table losses enable row level security;
alter table warehouse_stock enable row level security;
alter table warehouse_transactions enable row level security;
alter table inventories enable row level security;
alter table inventory_items enable row level security;
alter table audit_logs enable row level security;

-- Không tạo policy công khai. Website chỉ truy cập bằng Service Role ở máy chủ Vercel.

