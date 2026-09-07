-- 첨부자료 공동 저장 오류 복구
-- 실행 대상: daiso-shms 프로젝트의 Supabase SQL Editor
-- 목적: 로그인한 master/safety/head 사용자가 이행기록과 첨부 메타데이터를 저장하고,
--       삭제는 master만 하도록 shms_records RLS를 현재 스키마 기준으로 재생성합니다.

create or replace function public.shms_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.shms_profiles p
     where p.id = auth.uid()
       and p.role in ('master', 'safety', 'head')
  );
$$;

create or replace function public.shms_can_delete()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.shms_profiles p
     where p.id = auth.uid()
       and p.role = 'master'
  );
$$;

grant execute on function public.shms_can_edit() to authenticated;
grant execute on function public.shms_can_delete() to authenticated;

alter table public.shms_records enable row level security;
drop policy if exists shms_records_write on public.shms_records;
drop policy if exists shms_records_insert on public.shms_records;
drop policy if exists shms_records_update on public.shms_records;
drop policy if exists shms_records_delete on public.shms_records;

create policy shms_records_insert on public.shms_records
  for insert to authenticated
  with check (public.shms_can_edit());

create policy shms_records_update on public.shms_records
  for update to authenticated
  using (public.shms_can_edit())
  with check (public.shms_can_edit());

create policy shms_records_delete on public.shms_records
  for delete to authenticated
  using (public.shms_can_delete());

-- 다른 공동 운영 테이블도 같은 권한 규칙으로 맞춥니다.
do $$
declare t text;
begin
  foreach t in array array[
    'shms_documents','shms_inspections','shms_capa','shms_evidence',
    'shms_org','shms_memos','shms_audit_overview'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.shms_can_edit())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.shms_can_edit()) with check (public.shms_can_edit())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.shms_can_delete())', t || '_delete', t);
  end loop;
end $$;

-- 확인용: 현재 로그인 계정의 서버 권한은 true여야 합니다.
select auth.uid() as current_user_id, public.shms_can_edit() as can_edit, public.shms_can_delete() as can_delete;
