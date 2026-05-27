create table public.users (
  id text primary key,
  name text not null check (length(trim(name)) > 0),
  email text not null unique check (position('@' in email) > 1),
  role text not null check (role in ('GroupManager', 'Admin', 'Agent')),
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

alter table public.users enable row level security;

grant select, insert, update, delete on public.users to authenticated;

create policy "Authenticated users can view users"
on public.users for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can create users"
on public.users for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "Authenticated users can update users"
on public.users for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create policy "Authenticated users can delete users"
on public.users for delete
to authenticated
using ((select auth.uid()) is not null);

insert into public.users (id, name, email, role, phone)
values
  ('u1', 'Priya Sharma', 'priya@agency.com', 'GroupManager', null),
  ('u2', 'Marcus Lee', 'marcus@agency.com', 'Admin', null),
  ('u3', 'Aisha Tan', 'aisha@agency.com', 'Agent', '+65 9123 4567'),
  ('u4', 'Daniel Koh', 'daniel@agency.com', 'Agent', '+65 9234 5678'),
  ('u5', 'Sara Lim', 'sara@agency.com', 'Agent', '+65 9345 6789'),
  ('u6', 'Jonas Ng', 'jonas@agency.com', 'Agent', '+65 9456 7890')
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  role = excluded.role,
  phone = excluded.phone,
  avatar_url = excluded.avatar_url;
