/* ============================================================
   core.js — 공통 유틸 / 설정 / 데이터 계층(Store) / 인증
   저장소: Supabase(운영) + localStorage(캐시·오프라인 폴백)
   ============================================================ */

import { DOC_MASTER, DOC_TYPES, ALL_ITEMS } from './data/frameworks.js?v=20260731_pw';

export const APP = {
  name: '안전보건관리체계 이행 관리 시스템',
  short: 'SHMS',
  org: '아성다이소 안전보건팀',
  version: 'V1.0.0 (2026-07-30)'
};

/* ---------------- DOM 유틸 ---------------- */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  children.flat().forEach(c => {
    if (c === null || c === undefined || c === false) return;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return node;
}

/** HTML 이스케이프 — 수기 입력값을 화면에 넣을 때 반드시 사용 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}

export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function nowStamp() {
  const d = new Date();
  return `${today()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function fmtDate(v) {
  if (!v) return '—';
  const s = String(v);
  return s.length > 10 ? s.slice(0, 10) : s;
}
/** 오늘 기준 반기 문자열 (예: 2026-H2) */
export function currentHalf(d = new Date()) {
  return `${d.getFullYear()}-H${d.getMonth() < 6 ? 1 : 2}`;
}
export function halfLabel(h) {
  const [y, p] = String(h).split('-H');
  return `${y}년 ${p === '1' ? '상반기' : '하반기'}`;
}
export function recentHalves(n = 6) {
  const out = [];
  let y = new Date().getFullYear(), p = new Date().getMonth() < 6 ? 1 : 2;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-H${p}`);
    if (p === 1) { p = 2; y -= 1; } else { p = 1; }
  }
  return out;
}

let toastTimer = null;
export function toast(msg, kind = '') {
  let t = $('#toast');
  if (!t) { t = el('div', { id: 'toast', class: 'toast' }); document.body.append(t); }
  t.className = `toast show ${kind}`;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------------- Supabase 설정 ----------------
   운영 키는 소스에 하드코딩하지 않고, 아래 우선순위로 읽는다.
   1) localStorage('shms.supabase')  ← 앱 [설정] 화면에서 입력
   2) window.SHMS_SUPABASE           ← 배포 시 config.js 주입
   anon key는 공개되어도 되는 키이며, 실제 접근통제는 Supabase RLS가 수행한다.
------------------------------------------------- */
const CFG_KEY = 'shms.supabase';

export function getSupabaseConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) { const c = JSON.parse(raw); if (c && c.url && c.anonKey) return c; }
  } catch (_) { /* 손상된 설정은 무시 */ }
  const w = window.SHMS_SUPABASE;
  if (w && w.url && w.anonKey && !String(w.url).includes('YOUR-PROJECT')) return w;
  return null;
}
export function setSupabaseConfig(url, anonKey) {
  if (!url || !anonKey) { localStorage.removeItem(CFG_KEY); return null; }
  const cfg = { url: String(url).trim().replace(/\/+$/, ''), anonKey: String(anonKey).trim() };
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  return cfg;
}

/* ---------------- Supabase 클라이언트 ---------------- */
export const conn = { mode: 'local', client: null, error: '' };

export async function initSupabase() {
  const cfg = getSupabaseConfig();
  if (!cfg) { conn.mode = 'local'; conn.error = ''; return null; }
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
    conn.client = createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'shms.auth' }
    });
    conn.mode = 'supabase';
    conn.error = '';
    return conn.client;
  } catch (e) {
    conn.mode = 'local';
    conn.error = e?.message || String(e);
    console.warn('[SHMS] Supabase 초기화 실패 — 로컬 모드로 동작합니다.', e);
    return null;
  }
}

/* ---------------- 테이블 정의 ---------------- */
export const TABLES = {
  records:     'shms_records',      // 법령/ISO 조항별 이행 기록
  documents:   'shms_documents',    // 절차서·지침서
  capa:        'shms_capa',         // 개선조치
  inspections: 'shms_inspections',  // 반기 점검
  org:         'shms_org',          // 조직·선임 현황
  evidence:    'shms_evidence'      // 증빙 자료 목록
};

const LS_PREFIX = 'shms.data.';
const lsGet = (k, dflt) => {
  try { const v = localStorage.getItem(LS_PREFIX + k); return v ? JSON.parse(v) : dflt; }
  catch (_) { return dflt; }
};
const lsSet = (k, v) => { try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); } catch (_) {} };

/* ---------------- 상태 ---------------- */
export const state = {
  user: null,
  half: currentHalf(),
  records: {},      // { [itemId + '@' + half]: record }
  documents: [],
  capa: [],
  inspections: [],
  org: [],
  evidence: [],
  loaded: false
};

const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

export const recordKey = (itemId, half = state.half) => `${itemId}@${half}`;

export function getRecord(itemId, half = state.half) {
  return state.records[recordKey(itemId, half)] || {
    item_id: itemId, half, status: 'none',
    owner: '', due_date: '', last_checked: '',
    implementation: '', evidence: '', findings: '',
    updated_at: '', updated_by: ''
  };
}

/* ---------------- 초기 문서 생성(문서체계 마스터 기반) ---------------- */
function seedDocuments() {
  return DOC_MASTER.map(m => ({
    id: `doc_${m.docNo}`,
    doc_no: m.docNo,
    type: m.type,
    title: m.title,
    category: m.category,
    version: '',
    status: 'draft',
    owner: '',
    approver: '',
    issued_date: '',
    revised_date: '',
    next_review: '',
    purpose: m.purpose,
    scope: '',
    body: '',
    iso_refs: m.isoRefs || [],
    law_refs: m.lawRefs || [],
    revisions: [],
    updated_at: '',
    updated_by: ''
  }));
}

/* ---------------- 로드 ---------------- */
export async function loadAll() {
  state.records     = lsGet('records', {});
  state.documents   = lsGet('documents', null) || seedDocuments();
  state.capa        = lsGet('capa', []);
  state.inspections = lsGet('inspections', []);
  state.org         = lsGet('org', []);
  state.evidence    = lsGet('evidence', []);

  if (conn.mode === 'supabase') {
    try {
      const [rec, doc, capa, insp, org, evi] = await Promise.all([
        conn.client.from(TABLES.records).select('*'),
        conn.client.from(TABLES.documents).select('*'),
        conn.client.from(TABLES.capa).select('*'),
        conn.client.from(TABLES.inspections).select('*'),
        conn.client.from(TABLES.org).select('*'),
        conn.client.from(TABLES.evidence).select('*')
      ]);
      const firstErr = [rec, doc, capa, insp, org, evi].find(r => r.error);
      if (firstErr) throw firstErr.error;

      if (rec.data) {
        const map = {};
        rec.data.forEach(r => { map[recordKey(r.item_id, r.half)] = r; });
        state.records = map;
      }
      // 문서는 원격이 비어 있으면 마스터 시드를 그대로 사용(첫 구축 시점)
      if (doc.data && doc.data.length) {
        const byNo = new Map(doc.data.map(d => [d.doc_no, d]));
        state.documents = seedDocuments().map(s => byNo.has(s.doc_no) ? { ...s, ...byNo.get(s.doc_no) } : s);
        doc.data.filter(d => !DOC_MASTER.some(m => m.docNo === d.doc_no))
                .forEach(d => state.documents.push(d));
      }
      state.capa        = capa.data || [];
      state.inspections = insp.data || [];
      state.org         = org.data  || [];
      state.evidence    = evi.data  || [];
      persistAll();
    } catch (e) {
      conn.error = e?.message || String(e);
      console.warn('[SHMS] 원격 조회 실패 — 로컬 캐시로 표시합니다.', e);
    }
  }
  state.loaded = true;
  emit();
}

function persistAll() {
  lsSet('records', state.records);
  lsSet('documents', state.documents);
  lsSet('capa', state.capa);
  lsSet('inspections', state.inspections);
  lsSet('org', state.org);
  lsSet('evidence', state.evidence);
}

/* ---------------- 저장 (upsert) ---------------- */
async function remoteUpsert(table, row, conflict) {
  if (conn.mode !== 'supabase') return { ok: true, local: true };
  try {
    const q = conn.client.from(table).upsert(row, conflict ? { onConflict: conflict } : undefined);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    conn.error = e?.message || String(e);
    return { ok: false, error: conn.error };
  }
}
async function remoteDelete(table, id) {
  if (conn.mode !== 'supabase') return { ok: true, local: true };
  try {
    const { error } = await conn.client.from(table).delete().eq('id', id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    conn.error = e?.message || String(e);
    return { ok: false, error: conn.error };
  }
}

const stamp = () => ({ updated_at: new Date().toISOString(), updated_by: state.user?.name || '미상' });

export async function saveRecord(itemId, patch, half = state.half) {
  const key = recordKey(itemId, half);
  const row = { ...getRecord(itemId, half), ...patch, item_id: itemId, half, ...stamp() };
  state.records[key] = row;
  lsSet('records', state.records);
  emit();
  return remoteUpsert(TABLES.records, row, 'item_id,half');
}

export async function saveDocument(doc) {
  const row = { ...doc, ...stamp() };
  const i = state.documents.findIndex(d => d.id === row.id);
  if (i >= 0) state.documents[i] = row; else state.documents.push(row);
  lsSet('documents', state.documents);
  emit();
  return remoteUpsert(TABLES.documents, row, 'id');
}

export async function saveRow(kind, row) {
  const table = TABLES[kind];
  const list = state[kind];
  const r = { ...row, id: row.id || uid(kind), ...stamp() };
  const i = list.findIndex(x => x.id === r.id);
  if (i >= 0) list[i] = r; else list.push(r);
  lsSet(kind, list);
  emit();
  return remoteUpsert(table, r, 'id');
}

export async function deleteRow(kind, id) {
  state[kind] = state[kind].filter(x => x.id !== id);
  lsSet(kind, state[kind]);
  emit();
  return remoteDelete(TABLES[kind], id);
}

/* ---------------- 통계 ---------------- */
/** 이행률: 해당없음(na) 제외, 상태 점수 평균 */
export function progressOf(items, half = state.half) {
  let sum = 0, n = 0, counts = { done:0, progress:0, hold:0, none:0, na:0 };
  items.forEach(it => {
    const r = getRecord(it.id, half);
    const s = r.status || 'none';
    counts[s] = (counts[s] || 0) + 1;
    const score = { done:100, progress:60, hold:30, none:0 }[s];
    if (score !== undefined) { sum += score; n++; }
  });
  return { pct: n ? Math.round(sum / n) : 0, counts, total: items.length, evaluated: n };
}

/** 기한 임박/초과 항목 */
export function dueSoon(days = 30, half = state.half) {
  const now = new Date(); const limit = new Date(now.getTime() + days * 864e5);
  return ALL_ITEMS.map(it => ({ it, r: getRecord(it.id, half) }))
    .filter(({ r }) => r.due_date && r.status !== 'done' && r.status !== 'na')
    .map(({ it, r }) => ({ it, r, d: new Date(r.due_date) }))
    .filter(({ d }) => !isNaN(d) && d <= limit)
    .sort((a, b) => a.d - b.d);
}

export function docStats() {
  const by = {};
  Object.keys(DOC_TYPES).forEach(t => { by[t] = { total: 0, approved: 0 }; });
  state.documents.forEach(d => {
    if (!by[d.type]) by[d.type] = { total: 0, approved: 0 };
    by[d.type].total++;
    if (d.status === 'approved') by[d.type].approved++;
  });
  const total = state.documents.length;
  const approved = state.documents.filter(d => d.status === 'approved').length;
  return { by, total, approved, pct: total ? Math.round(approved / total * 100) : 0 };
}

/* ---------------- 인증 (공용 비밀번호 방식) ----------------
   아이디 없이 공용 비밀번호 하나로 진입한다.
   ⚠ 이 해시는 소스에 포함되므로 외부 유출을 막는 보안장치가 아니라
     "아무나 실수로 들어오지 않게 하는 문턱"이다.
     실제 데이터 접근 통제는 Supabase 연결 시 RLS 정책이 수행해야 한다.
   비밀번호를 바꾸려면 새 해시를 만들어 GATE_HASH 를 교체한다.
     node -e "console.log(require('crypto').createHash('sha256').update('새비밀번호','utf8').digest('hex'))"
------------------------------------------------------------- */
const SESSION_KEY = 'shms.session';
const GATE_HASH = 'f2e5aafc64a04ac704c644ce38c34d1d7f7493561687c66e43eeda8186744134';

/** 진입 성공 시 부여되는 사용자 (작성·수정 권한) */
const GATE_USER = {
  id: 'shms_gate', email: '', name: '안전보건팀',
  role: 'safety', dept: '안전보건팀', source: 'gate'
};

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function restoreSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (raw) { state.user = JSON.parse(raw); return state.user; }
  } catch (_) {}
  return null;
}

export async function signIn({ password, remember }) {
  const pw = String(password || '');
  if (!pw) throw new Error('비밀번호를 입력하세요.');
  if (!window.crypto?.subtle) {
    throw new Error('보안 연결(https) 또는 localhost 에서만 로그인할 수 있습니다.');
  }
  if (await sha256Hex(pw) !== GATE_HASH) throw new Error('비밀번호가 올바르지 않습니다.');

  state.user = { ...GATE_USER };
  const raw = JSON.stringify(state.user);
  sessionStorage.setItem(SESSION_KEY, raw);
  if (remember) localStorage.setItem(SESSION_KEY, raw); else localStorage.removeItem(SESSION_KEY);
  return state.user;
}

export async function signOut() {
  if (conn.mode === 'supabase') { try { await conn.client.auth.signOut(); } catch (_) {} }
  state.user = null;
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}

/** 쓰기 권한 여부 */
export function canEdit() {
  return ['master', 'safety', 'head'].includes(state.user?.role);
}
