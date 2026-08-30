-- Chạy một lần trong Supabase SQL Editor để bật đăng nhập bằng tên tài khoản.
alter table public.profiles
add column if not exists username text;

create unique index if not exists profiles_username_unique
on public.profiles (lower(username))
where username is not null;

update public.profiles
set username = 'ksnk.dk115',
    full_name = 'Phạm Văn Tú',
    role = 'ADMIN',
    active = true
where lower(email) = lower('cssdngoaikhoa115@gmail.com');
