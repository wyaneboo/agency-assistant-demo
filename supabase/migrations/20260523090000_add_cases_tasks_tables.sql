create sequence if not exists public.case_number_seq start with 1008;
create sequence if not exists public.claim_number_seq start with 5;
create sequence if not exists public.task_number_seq start with 7;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from anon, authenticated, public;

create table public.cases (
  id text primary key default ('C-' || nextval('public.case_number_seq'::regclass)::text),
  client_name text not null,
  agent_id text not null,
  product_type text not null,
  premium numeric(12,2) not null check (premium >= 0),
  anp_estimate numeric(12,2) not null check (anp_estimate >= 0),
  status text not null check (
    status in (
      'Draft',
      'Submitted',
      'Pending Underwriting',
      'Pending Payment',
      'Approved',
      'Issued',
      'Closed',
      'Rejected'
    )
  ),
  missing_documents text[] not null default '{}',
  submitted_date date not null,
  follow_up_date date,
  priority text not null check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null
);

create trigger cases_set_updated_at
before update on public.cases
for each row execute function public.set_updated_at();

alter table public.cases enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.cases to authenticated;
grant usage, select on sequence public.case_number_seq to authenticated;

create policy "Authenticated users can view cases"
on public.cases for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can create cases"
on public.cases for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "Authenticated users can update cases"
on public.cases for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create table public.claims (
  id text primary key default ('CL-' || nextval('public.claim_number_seq'::regclass)::text),
  client_name text not null,
  claim_type text not null,
  assigned_admin_id text not null,
  status text not null check (
    status in (
      'Reported',
      'Collecting Documents',
      'Submitted',
      'Pending',
      'Approved',
      'Rejected',
      'Appealed',
      'Closed'
    )
  ),
  missing_documents text[] not null default '{}',
  submission_date date not null,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index claims_assigned_admin_id_idx on public.claims (assigned_admin_id);
create index claims_status_idx on public.claims (status);
create index claims_submission_date_idx on public.claims (submission_date);

create trigger claims_set_updated_at
before update on public.claims
for each row execute function public.set_updated_at();

alter table public.claims enable row level security;

grant select, insert, update on public.claims to authenticated;
grant usage, select on sequence public.claim_number_seq to authenticated;

create policy "Authenticated users can view claims"
on public.claims for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can create claims"
on public.claims for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "Authenticated users can update claims"
on public.claims for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create table public.tasks (
  id text primary key default ('T-' || nextval('public.task_number_seq'::regclass)::text),
  title text not null,
  description text,
  assigned_to text not null,
  board_date date not null,
  carry_source_id text,
  carry_source_date date,
  due_date date not null,
  priority text not null check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  status text not null check (status in ('To Do', 'In Progress', 'Waiting', 'Completed', 'Overdue')),
  related_case_id text references public.cases(id) on update cascade on delete set null,
  related_claim_id text references public.claims(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text not null
);

create index tasks_board_date_idx on public.tasks (board_date);
create index tasks_assigned_to_idx on public.tasks (assigned_to);
create index tasks_related_case_id_idx on public.tasks (related_case_id);
create index tasks_status_idx on public.tasks (status);

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

grant select, insert, update on public.tasks to authenticated;
grant usage, select on sequence public.task_number_seq to authenticated;

create policy "Authenticated users can view tasks"
on public.tasks for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can create tasks"
on public.tasks for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "Authenticated users can update tasks"
on public.tasks for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

insert into public.cases (
  id,
  client_name,
  agent_id,
  product_type,
  premium,
  anp_estimate,
  status,
  missing_documents,
  submitted_date,
  follow_up_date,
  priority,
  remarks,
  created_at,
  updated_at,
  created_by
) values
  (
    'C-1001',
    'Tan Wei Ming',
    'u3',
    'Whole Life',
    4800,
    4800,
    'Pending Underwriting',
    array['Medical Report'],
    date '2026-05-18',
    date '2026-05-25',
    'High',
    'Awaiting GP report.',
    timestamptz '2026-05-18 12:00:00+08',
    now(),
    'u3'
  ),
  (
    'C-1002',
    'Rachel Goh',
    'u4',
    'ILP',
    12000,
    12000,
    'Pending Payment',
    '{}'::text[],
    date '2026-05-11',
    date '2026-05-22',
    'Urgent',
    'Payment due - chase today.',
    timestamptz '2026-05-11 12:00:00+08',
    now(),
    'u4'
  ),
  (
    'C-1003',
    'Ahmad Razak',
    'u3',
    'Term Life',
    1800,
    1800,
    'Approved',
    '{}'::text[],
    date '2026-05-03',
    null,
    'Medium',
    null,
    timestamptz '2026-05-03 12:00:00+08',
    now(),
    'u3'
  ),
  (
    'C-1004',
    'Linda Chua',
    'u5',
    'Endowment',
    6000,
    6000,
    'Issued',
    '{}'::text[],
    date '2026-04-23',
    null,
    'Low',
    null,
    timestamptz '2026-04-23 12:00:00+08',
    now(),
    'u5'
  ),
  (
    'C-1005',
    'Kenji Yeo',
    'u6',
    'Whole Life',
    3200,
    3200,
    'Submitted',
    array['NRIC copy'],
    date '2026-05-21',
    date '2026-05-26',
    'Medium',
    null,
    timestamptz '2026-05-21 12:00:00+08',
    now(),
    'u6'
  ),
  (
    'C-1006',
    'Mary Tan',
    'u4',
    'Critical Illness',
    2400,
    2400,
    'Rejected',
    '{}'::text[],
    date '2026-04-13',
    null,
    'Low',
    'Pre-existing condition.',
    timestamptz '2026-04-13 12:00:00+08',
    now(),
    'u4'
  ),
  (
    'C-1007',
    'Vincent Ho',
    'u5',
    'ILP',
    9600,
    9600,
    'Draft',
    array['Application Form'],
    date '2026-05-23',
    null,
    'Medium',
    null,
    timestamptz '2026-05-23 12:00:00+08',
    now(),
    'u5'
  )
on conflict (id) do nothing;

insert into public.claims (
  id,
  client_name,
  claim_type,
  assigned_admin_id,
  status,
  missing_documents,
  submission_date,
  remarks,
  created_at,
  updated_at
) values
  (
    'CL-1',
    'Tan Wei Ming',
    'Hospitalization',
    'u2',
    'Collecting Documents',
    array['Discharge summary'],
    date '2026-05-20',
    'Patient still hospitalized.',
    timestamptz '2026-05-20 12:00:00+08',
    now()
  ),
  (
    'CL-2',
    'Linda Chua',
    'Critical Illness',
    'u2',
    'Submitted',
    '{}'::text[],
    date '2026-05-13',
    null,
    timestamptz '2026-05-13 12:00:00+08',
    now()
  ),
  (
    'CL-3',
    'Ahmad Razak',
    'Death',
    'u2',
    'Pending',
    array['Coroner report'],
    date '2026-05-03',
    null,
    timestamptz '2026-05-03 12:00:00+08',
    now()
  ),
  (
    'CL-4',
    'Rachel Goh',
    'Outpatient',
    'u2',
    'Approved',
    '{}'::text[],
    date '2026-04-23',
    null,
    timestamptz '2026-04-23 12:00:00+08',
    now()
  )
on conflict (id) do nothing;

insert into public.tasks (
  id,
  title,
  assigned_to,
  board_date,
  due_date,
  priority,
  status,
  related_case_id,
  related_claim_id,
  created_at,
  updated_at,
  created_by
) values
  (
    'T-1',
    'Chase medical report for Tan Wei Ming',
    'u3',
    date '2026-05-23',
    date '2026-05-22',
    'High',
    'In Progress',
    'C-1001',
    null,
    timestamptz '2026-05-20 12:00:00+08',
    now(),
    'u2'
  ),
  (
    'T-2',
    'Call Rachel Goh re: premium payment',
    'u4',
    date '2026-05-23',
    date '2026-05-20',
    'Urgent',
    'Overdue',
    'C-1002',
    null,
    timestamptz '2026-05-21 12:00:00+08',
    now(),
    'u2'
  ),
  (
    'T-3',
    'Prepare Q4 production report',
    'u1',
    date '2026-05-23',
    date '2026-05-26',
    'Medium',
    'To Do',
    null,
    null,
    timestamptz '2026-05-22 12:00:00+08',
    now(),
    'u1'
  ),
  (
    'T-4',
    'Prepare Q4 team presentation',
    'u2',
    date '2026-05-23',
    date '2026-05-23',
    'Medium',
    'To Do',
    null,
    null,
    timestamptz '2026-05-22 12:00:00+08',
    now(),
    'u1'
  ),
  (
    'T-5',
    'Submit claim documents - Linda Chua',
    'u2',
    date '2026-05-23',
    date '2026-05-24',
    'High',
    'Waiting',
    null,
    'CL-2',
    timestamptz '2026-05-21 12:00:00+08',
    now(),
    'u2'
  ),
  (
    'T-6',
    'Weekly team sync notes',
    'u1',
    date '2026-05-23',
    date '2026-05-18',
    'Low',
    'Completed',
    null,
    null,
    timestamptz '2026-05-16 12:00:00+08',
    now(),
    'u1'
  )
on conflict (id) do nothing;

select setval(
  'public.case_number_seq',
  (
    select greatest(
      coalesce(max(substring(id from '^C-(\d+)$')::bigint), 1007) + 1,
      1008
    )
    from public.cases
    where id ~ '^C-\d+$'
  ),
  false
);

select setval(
  'public.claim_number_seq',
  (
    select greatest(
      coalesce(max(substring(id from '^CL-(\d+)$')::bigint), 4) + 1,
      5
    )
    from public.claims
    where id ~ '^CL-\d+$'
  ),
  false
);

select setval(
  'public.task_number_seq',
  (
    select greatest(
      coalesce(max(substring(id from '^T-(\d+)$')::bigint), 6) + 1,
      7
    )
    from public.tasks
    where id ~ '^T-\d+$'
  ),
  false
);
