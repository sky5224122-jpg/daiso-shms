-- 이미 schema.sql을 실행한 프로젝트에 한 번만 실행합니다.
-- 로그인한 모든 신규 사용자는 작성·수정 가능(safety), 삭제는 master만 가능합니다.

alter table public.shms_profiles alter column role set default 'safety';

create table if not exists public.shms_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  login_id text,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists shms_audit_log_created_idx on public.shms_audit_log (created_at desc);
alter table public.shms_audit_log enable row level security;
drop policy if exists shms_audit_read on public.shms_audit_log;
create policy shms_audit_read on public.shms_audit_log for select to authenticated using (true);
drop policy if exists shms_audit_insert on public.shms_audit_log;
create policy shms_audit_insert on public.shms_audit_log for insert to authenticated with check (actor_id = auth.uid());

create or replace function public.shms_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shms_profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email), 'safety')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.shms_can_delete()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shms_profiles p
    where p.id = auth.uid() and p.role = 'master'
  );
$$;

drop policy if exists shms_audit_delete on public.shms_audit_log;
create policy shms_audit_delete on public.shms_audit_log for delete to authenticated using (public.shms_can_delete());

drop policy if exists shms_profiles_admin_write on public.shms_profiles;
drop policy if exists shms_profiles_master_update on public.shms_profiles;
drop policy if exists shms_profiles_self_read on public.shms_profiles;
create policy shms_profiles_self_read on public.shms_profiles
  for select to authenticated
  using (id = auth.uid() or public.shms_can_delete());
create policy shms_profiles_master_update on public.shms_profiles
  for update to authenticated
  using (public.shms_can_delete())
  with check (public.shms_can_delete());

do $$
declare t text;
begin
  foreach t in array array['shms_records','shms_documents','shms_inspections','shms_capa','shms_evidence','shms_org']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.shms_can_edit())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.shms_can_edit()) with check (public.shms_can_edit())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.shms_can_delete())', t || '_delete', t);
  end loop;
end $$;

-- 첫 마스터 계정 가입 후, 아래 이메일만 실제 이메일로 바꿔 실행합니다.
-- update public.shms_profiles set role = 'master', name = '마스터 관리자' where email = 'YOUR-EMAIL@example.com';
