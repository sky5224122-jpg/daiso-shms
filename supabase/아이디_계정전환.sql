-- 기존 공동운영 RLS를 적용한 Supabase 프로젝트에서 1회 실행합니다.
-- 앱 화면에서는 이메일 대신 login_id(예: safety02)를 사용합니다.

alter table public.shms_profiles add column if not exists login_id text;

update public.shms_profiles
set login_id = lower(split_part(email, '@', 1))
where login_id is null and email is not null;

create unique index if not exists shms_profiles_login_id_uidx
  on public.shms_profiles (login_id)
  where login_id is not null;

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
    'safety'
  )
  on conflict (id) do update set
    login_id = excluded.login_id,
    email = excluded.email,
    name = coalesce(public.shms_profiles.name, excluded.name);
  return new;
end;
$$;

-- 계정 생성 후 대표님 계정만 아래 문장을 실행해 master 권한을 부여합니다.
update public.shms_profiles
set name = case login_id
  when 'master' then '강동현'
  when 'safety02' then '박찬욱'
  when 'safety03' then '유준하'
  when 'safety04' then '서유림'
  when 'health01' then '박윤하'
  when 'health02' then '윤정인'
  else name end,
  role = case when login_id = 'master' then 'master' else 'safety' end
where login_id in ('master', 'safety02', 'safety03', 'safety04', 'health01', 'health02');

-- 위 UPDATE는 이미 가입된 계정에만 적용됩니다. 먼저 앱에서 각 아이디 계정을 생성하세요.
