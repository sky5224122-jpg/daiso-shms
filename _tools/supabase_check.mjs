/* ============================================================
   supabase_check.mjs — Supabase 연결 및 스키마 점검 도구
   ------------------------------------------------------------
   사용법
     node _tools/supabase_check.mjs <PROJECT_URL> <ANON_KEY>
   또는 config.js 값을 그대로 쓰려면
     node _tools/supabase_check.mjs
   ------------------------------------------------------------
   확인 항목
     1) URL/키 형식
     2) REST 엔드포인트 응답
     3) 7개 테이블 존재 여부
     4) 익명(비로그인) 상태에서 조회가 차단되는지 (RLS 정상 동작 확인)
   ※ 이 스크립트는 데이터를 쓰지 않습니다. 읽기 점검만 수행합니다.
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TABLES = [
  'shms_profiles', 'shms_records', 'shms_documents',
  'shms_inspections', 'shms_capa', 'shms_evidence', 'shms_org'
];

function readConfigJs() {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '..', 'config.js'), 'utf8');
    const url = src.match(/url:\s*'([^']+)'/)?.[1];
    const key = src.match(/anonKey:\s*'([^']+)'/)?.[1];
    return { url, key };
  } catch { return {}; }
}

const argv = process.argv.slice(2);
let url = argv[0];
let key = argv[1];
if (!url || !key) {
  const c = readConfigJs();
  url = url || c.url;
  key = key || c.key;
}

const line = (s = '') => console.log(s);
const ok   = s => console.log('  \x1b[32m✔\x1b[0m ' + s);
const bad  = s => console.log('  \x1b[31m✘\x1b[0m ' + s);
const warn = s => console.log('  \x1b[33m!\x1b[0m ' + s);

line();
line('=== Supabase 연결 점검 ===');
line();

if (!url || !key || url.includes('YOUR-PROJECT') || key.includes('YOUR-ANON')) {
  bad('Project URL 또는 anon key가 설정되지 않았습니다.');
  line();
  line('  사용법: node _tools/supabase_check.mjs https://xxxx.supabase.co eyJhbGciOi...');
  line('  (Supabase 대시보드 → Project Settings → API 에서 확인)');
  line();
  process.exit(1);
}

url = url.replace(/\/+$/, '');

if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) {
  warn(`URL 형식이 일반적이지 않습니다: ${url}`);
} else {
  ok(`URL 형식 정상 — ${url}`);
}

if (key.includes('service_role')) {
  bad('service_role 키가 입력되었습니다. anon public 키를 사용하십시오. 점검을 중단합니다.');
  process.exit(1);
}
try {
  const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  if (payload.role && payload.role !== 'anon') {
    bad(`키의 role이 '${payload.role}' 입니다. anon 키를 사용하십시오. 점검을 중단합니다.`);
    process.exit(1);
  }
  ok(`anon 키 확인 (role=${payload.role || 'anon'})`);
} catch {
  warn('키를 해석하지 못했습니다. 형식이 맞는지 확인하십시오.');
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

line();
line('--- 엔드포인트 응답 ---');
try {
  const res = await fetch(`${url}/rest/v1/`, { headers });
  if (res.ok || res.status === 404) ok(`REST 엔드포인트 응답 (HTTP ${res.status})`);
  else { bad(`REST 엔드포인트 오류 (HTTP ${res.status})`); process.exit(1); }
} catch (e) {
  bad(`접속 실패: ${e.message}`);
  process.exit(1);
}

line();
line('--- 테이블 존재 여부 ---');
let missing = [];
let readable = [];
for (const t of TABLES) {
  try {
    const res = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers });
    if (res.status === 404) { bad(`${t} — 테이블 없음 (schema.sql 실행 필요)`); missing.push(t); }
    else if (res.status === 200) { ok(`${t} — 존재, 익명 조회 허용됨`); readable.push(t); }
    else if (res.status === 401 || res.status === 403) ok(`${t} — 존재, 익명 조회 차단(RLS 정상)`);
    else {
      const body = await res.text();
      if (/does not exist/i.test(body)) { bad(`${t} — 테이블 없음 (schema.sql 실행 필요)`); missing.push(t); }
      else warn(`${t} — HTTP ${res.status}: ${body.slice(0, 120)}`);
    }
  } catch (e) {
    bad(`${t} — 조회 실패: ${e.message}`);
  }
}

line();
line('--- 결과 ---');
if (missing.length) {
  bad(`테이블 ${missing.length}개 누락: ${missing.join(', ')}`);
  line('    → Supabase 대시보드 → SQL Editor 에서 supabase/schema.sql 을 실행하십시오.');
} else {
  ok('7개 테이블 모두 존재합니다.');
}
if (readable.length) {
  warn(`익명(비로그인) 상태에서 조회가 허용된 테이블 ${readable.length}개: ${readable.join(', ')}`);
  line('    → RLS가 꺼져 있거나 anon 역할에 select 권한이 열려 있을 수 있습니다.');
  line('    → schema.sql 의 "alter table ... enable row level security" 실행 여부를 확인하십시오.');
} else if (!missing.length) {
  ok('익명 조회가 모두 차단되었습니다. RLS가 정상 동작합니다.');
}
line();
line(missing.length ? '점검 결과: 조치 필요' : '점검 결과: 정상');
line();
