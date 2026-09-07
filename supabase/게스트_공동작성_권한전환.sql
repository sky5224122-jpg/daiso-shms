-- 게스트 계정을 Supabase 공동작성 계정으로 전환합니다.
-- 조회·등록·수정 가능, 삭제는 기존대로 master만 가능합니다.

create or replace function public.shms_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shms_profiles (id, login_id, email, name, role)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'login_id', split_part(new.email, '@', 1))),
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'login_id', new.email),
    case
      when lower(coalesce(new.raw_user_meta_data->>'login_id', split_part(new.email, '@', 1))) in ('guest01','guest02','guest03') then 'guest'
      else 'safety'
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
