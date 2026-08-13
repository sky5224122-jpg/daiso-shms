-- ============================================================
-- 안전보건관리체계 이행 관리 시스템 (SHMS)
-- Supabase 스키마 · RLS 정책
-- ------------------------------------------------------------
-- 실행 방법
--   1) Supabase 대시보드 → SQL Editor → New query
--   2) 이 파일 전체를 붙여넣고 Run
--   3) Authentication → Users 에서 사용자 생성
--   4) 아래 "초기 관리자 등록" 블록으로 role 부여
-- ============================================================

-- ── 0. 공통 ───────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── 1. 사용자 프로필 (권한) ────────────────────────────────
create table if not exists public.shms_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text,
  dept       text,
  -- master | safety | head : 작성·수정 가능
  -- auditor | part | store | ref : 읽기 전용
  role       text not null default 'ref',
  created_at timestamptz not null default now()
);

comment on table public.shms_profiles is '사용자 권한 프로필 — 앱의 편집 권한은 role 값으로 결정된다';

-- 신규 가입자 자동 프로필 생성
create or replace function public.shms_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.shms_profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email), 'ref')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists shms_on_auth_user_created on auth.users;
create trigger shms_on_auth_user_created
  after insert on auth.users
  for each row execute function public.shms_handle_new_user();

-- 편집 권한 판정 함수 (RLS 정책에서 사용)
create or replace function public.shms_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.shms_profiles p
    where p.id = auth.uid() and p.role in ('master', 'safety', 'head')
  );
$$;

-- ── 2. 법령/ISO 조항별 이행 기록 ───────────────────────────
create table if not exists public.shms_records (
  item_id        text not null,          -- 예: MSSA-4-3, OSHA-036, ISO-6.1.2
  half           text not null,          -- 예: 2026-H2
  status         text not null default 'none',   -- done|progress|hold|none|na
  owner          text default '',
  due_date       date,
  last_checked   date,
  implementation text default '',        -- ① 이행 현황 (수기)
  evidence       text default '',        -- ② 보유 증빙자료 (수기)
  findings       text default '',        -- ③ 미흡사항 (수기)
  user_docs      text default '',        -- 작성·보관자료 수기 보완
  user_status    text default '',        -- 당사 준비현황 수기 보완
  user_evidence  text default '',        -- 증빙자료 목록 수기 보완
  attachments    jsonb not null default '[]'::jsonb, -- 링크/R2·로컬 첨부 메타데이터
  updated_at     timestamptz not null default now(),
  updated_by     text default '',
  primary key (item_id, half)
);
create index if not exists shms_records_half_idx on public.shms_records (half);

-- 기존 구축 DB에도 신규 수기·첨부 필드를 안전하게 추가
alter table public.shms_records add column if not exists user_docs text default '';
alter table public.shms_records add column if not exists user_status text default '';
alter table public.shms_records add column if not exists user_evidence text default '';
alter table public.shms_records add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ── 3. 안전보건 문서체계 ───────────────────────────────────
create table if not exists public.shms_documents (
  id           text primary key,
  doc_no       text not null,
  type         text not null default 'procedure',  -- manual|procedure|instruction|form
  title        text not null,
  category     text default '',
  version      text default '',
  status       text default 'draft',               -- draft|review|approved|obsolete
  owner        text default '',
  approver     text default '',
  issued_date  date,
  revised_date date,
  next_review  date,
  purpose      text default '',
  scope        text default '',
  body         text default '',                    -- 본문 (수기)
  iso_refs     jsonb default '[]'::jsonb,
  law_refs     jsonb default '[]'::jsonb,
  revisions    jsonb default '[]'::jsonb,          -- 제·개정 이력
  attachments  jsonb not null default '[]'::jsonb, -- 원본·승인본·링크 메타데이터
  updated_at   timestamptz not null default now(),
  updated_by   text default ''
);
create unique index if not exists shms_documents_docno_idx on public.shms_documents (doc_no);
alter table public.shms_documents add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ── 4. 이행 점검 기록 ──────────────────────────────────────
create table if not exists public.shms_inspections (
  id            text primary key,
  half          text not null,
  date          date,
  kind          text default '',
  scope         text default '',
  method        text default '',
  result        text default '',
  finding       text default '',
  action        text default '',
  action_needed text default 'N',
  inspector     text default '',
  attachments   jsonb not null default '[]'::jsonb, -- 점검표·사진·결과보고서 메타데이터
  updated_at    timestamptz not null default now(),
  updated_by    text default ''
);
create index if not exists shms_inspections_half_idx on public.shms_inspections (half);
alter table public.shms_inspections add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ── 5. 개선조치 (CAPA) ─────────────────────────────────────
create table if not exists public.shms_capa (
  id          text primary key,
  raised_date date,
  source      text default '',
  title       text default '',
  item_id     text default '',
  description text default '',
  root_cause  text default '',
  action      text default '',
  owner       text default '',
  due_date    date,
  verify      text default '',
  status      text default 'open',   -- open|analyzing|acting|verifying|closed
  attachments jsonb not null default '[]'::jsonb, -- 조치 전후·완료 근거 메타데이터
  updated_at  timestamptz not null default now(),
  updated_by  text default ''
);
create index if not exists shms_capa_status_idx on public.shms_capa (status);
alter table public.shms_capa add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ── 6. 증빙 자료 등록부 ────────────────────────────────────
create table if not exists public.shms_evidence (
  id         text primary key,
  date       date,
  item_id    text default '',
  title      text default '',
  location   text default '',
  url        text default '',
  note       text default '',
  attachments jsonb not null default '[]'::jsonb, -- 보조 파일·링크 메타데이터
  updated_at timestamptz not null default now(),
  updated_by text default ''
);
alter table public.shms_evidence add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ── 7. 조직 · 법정 선임 현황 ───────────────────────────────
create table if not exists public.shms_org (
  id              text primary key,
  position        text default '',
  name            text default '',
  site            text default '',
  appointed_date  date,
  qualification   text default '',
  training_date   date,
  eval_date       date,
  eval_result     text default '',
  note            text default '',
  attachments     jsonb not null default '[]'::jsonb, -- 선임신고서·자격증·교육수료증 메타데이터
  updated_at      timestamptz not null default now(),
  updated_by      text default ''
);
alter table public.shms_org add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ============================================================
-- RLS (행 수준 보안)
--   · 로그인한 사용자는 전체 조회 가능
--   · 작성/수정/삭제는 shms_can_edit() = true 인 사용자만 가능
-- ============================================================

alter table public.shms_profiles    enable row level security;
alter table public.shms_records     enable row level security;
alter table public.shms_documents   enable row level security;
alter table public.shms_inspections enable row level security;
alter table public.shms_capa        enable row level security;
alter table public.shms_evidence    enable row level security;
alter table public.shms_org         enable row level security;

-- 프로필: 본인 것만 조회, 관리자는 전체 조회·수정
drop policy if exists shms_profiles_self_read on public.shms_profiles;
create policy shms_profiles_self_read on public.shms_profiles
  for select to authenticated
  using (id = auth.uid() or public.shms_can_edit());

drop policy if exists shms_profiles_admin_write on public.shms_profiles;
create policy shms_profiles_admin_write on public.shms_profiles
  for all to authenticated
  using (public.shms_can_edit())
  with check (public.shms_can_edit());

-- 업무 테이블 공통 정책 생성
do $$
declare t text;
begin
  foreach t in array array['shms_records','shms_documents','shms_inspections','shms_capa','shms_evidence','shms_org']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.shms_can_edit()) with check (public.shms_can_edit())',
      t || '_write', t);
  end loop;
end $$;

-- ============================================================
-- 초기 관리자 등록
--   Authentication → Users 에서 계정을 먼저 만든 뒤, 아래를 실행합니다.
--   (이메일은 실제 사용할 안전보건팀 계정으로 바꿔서 실행)
-- ============================================================
-- update public.shms_profiles
--    set role = 'master', name = '안전보건팀 관리자', dept = '안전보건팀'
--  where email = 'safeteam119@gmail.com';

-- 권한 값 참고
--   master  : 시스템 관리자 (작성·수정)
--   safety  : 안전보건팀    (작성·수정)
--   head    : 안전보건팀장  (작성·수정)
--   auditor : 심사원        (읽기 전용)
--   part    : 파트장        (읽기 전용)
--   store   : 점장          (읽기 전용)
--   ref     : 참조          (읽기 전용, 기본값)
