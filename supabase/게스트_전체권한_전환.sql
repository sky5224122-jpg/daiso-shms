-- 게스트 계정을 공동 운영 전체 권한 계정으로 전환합니다.
-- 적용 범위: 조회·등록·수정·첨부·삭제 및 전체 프로필 조회·수정.
-- 게스트 계정: guest01, guest02, guest03

create or replace function public.shms_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shms_profiles (id, login_id, email, name, role, dept)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'login_id', split_part(new.email, '@', 1))),
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'login_id', new.email),
    case
      when lower(coalesce(new.raw_user_meta_data->>'login_id', split_part(new.email, '@', 1))) in ('guest01','guest02','guest03') then 'guest'
      else 'safety'
    end,
    case
      when lower(coalesce(new.raw_user_meta_data->>'login_id', split_part(new.email, '@', 1))) in ('guest01','guest02','guest03') then '외부 게스트'
      else null
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.shms_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shms_profiles p
    where p.id = auth.uid()
      and p.role in ('master', 'safety', 'head', 'guest')
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
    select 1 from public.shms_profiles p
    where p.id = auth.uid()
      and p.role in ('master', 'guest')
  );
$$;

update public.shms_profiles
set role = 'guest',
    name = case login_id
      when 'guest01' then '게스트 01'
      when 'guest02' then '게스트 02'
      when 'guest03' then '게스트 03'
      else name
    end,
    dept = '외부 게스트'
where login_id in ('guest01','guest02','guest03');

-- 적용 결과를 바로 확인합니다. 아직 최초 로그인 전인 계정은 결과에 나오지 않습니다.
select login_id, name, dept, role
from public.shms_profiles
where login_id in ('guest01','guest02','guest03')
order by login_id;
