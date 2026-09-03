/* ============================================================
   core.js — 공통 유틸 / 설정 / 데이터 계층(Store) / 인증
   저장소: Supabase(운영) + localStorage(캐시·오프라인 폴백)
   ============================================================ */

import { DOC_MASTER, DOC_TYPES, ALL_ITEMS } from './data/frameworks.js?v=20260903_stat';

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
  const now = new Date();
  let y = now.getFullYear(), p = now.getMonth() < 6 ? 1 : 2;
  // 다음 반기 1개를 포함하여 계획·평가 수립 가능하게 한다
  if (p === 1) { out.push(`${y}-H2`); } else { out.push(`${y + 1}-H1`); }
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

export function showSpinner(msg = '처리 중…') {
  let ov = $('#spinnerOverlay');
  if (!ov) {
    ov = el('div', { id: 'spinnerOverlay', class: 'spinner-overlay' });
    ov.innerHTML = `<div class="spinner-box"><div class="spinner-ring"></div><div class="spinner-msg"></div></div>`;
    document.body.append(ov);
  }
  ov.querySelector('.spinner-msg').textContent = msg;
  ov.classList.add('show');
}

export function hideSpinner() {
  const ov = $('#spinnerOverlay');
  if (ov) ov.classList.remove('show');
}

/* ---------------- Supabase 설정 ----------------
   운영 키는 소스에 하드코딩하지 않고, 아래 우선순위로 읽는다.
   1) window.SHMS_SUPABASE           ← 배포 시 config.js 주입(공식 공동 운영 연결)
   2) localStorage('shms.supabase')  ← 공식 연결이 없을 때만 앱 [설정] 화면 값 사용
   anon key는 공개되어도 되는 키이며, 실제 접근통제는 Supabase RLS가 수행한다.
------------------------------------------------- */
const CFG_KEY = 'shms.supabase';
// GitHub Pages에서 config.js가 차단되거나 이전 캐시가 남은 경우에도
// 공식 공동 운영 프로젝트로 연결하기 위한 공개 키 보조값이다.
// 이 키는 RLS가 적용되는 publishable 키이며 service_role 키가 아니다.
const DEPLOYED_SUPABASE = {
  url: 'https://zjnjbvkbxzpxtswqzoau.supabase.co',
  anonKey: 'sb_publishable_T0loyctj480POqvxD7a7HQ_pG1b_sOw'
};

export function getSupabaseConfig() {
  const w = window.SHMS_SUPABASE;
  // 배포본에 연결 정보가 있으면 이전 브라우저의 임시 설정보다 항상 우선한다.
  // 서로 다른 Supabase 프로젝트를 잘못 바라봐 로그인에 실패하는 일을 막는다.
  if (w && w.url && w.anonKey && !String(w.url).includes('YOUR-PROJECT')) return w;
  if (DEPLOYED_SUPABASE.url && DEPLOYED_SUPABASE.anonKey) return DEPLOYED_SUPABASE;
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) { const c = JSON.parse(raw); if (c && c.url && c.anonKey) return c; }
  } catch (_) { /* 손상된 설정은 무시 */ }
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

/* ---------------- 첨부파일 저장소 ----------------
   · Cloudflare Worker가 설정되면 R2에 저장
   · 미설정 로컬 모드에서는 IndexedDB에 Blob 저장
   · 링크는 파일 저장소를 사용하지 않고 레코드 메타데이터로만 보관
------------------------------------------------- */
const FILE_DB = 'shms.attachments';
const FILE_STORE = 'files';
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
// 50KB는 목표값일 뿐이며, 품질 보호 압축본은 모든 첨부와 동일하게 15MB까지 허용한다.
export const MAX_IMAGE_BYTES = MAX_ATTACHMENT_BYTES;
const IMAGE_TARGET_BYTES = 49 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 30 * 1024 * 1024;
// config.js가 브라우저에서 실행되지 않는 경우에도 공식 R2 Worker를 사용한다.
// Worker URL은 공개 주소이며 실제 파일 접근은 Supabase 로그인 JWT로 검증한다.
const DEPLOYED_ATTACHMENT_API_URL = 'https://daiso-shms-attachments.sky5224122.workers.dev';
// 50KB는 비용 절감 목표값이다. 식별성을 해치지 않도록 최소 긴 변 560px·품질 0.42까지만 낮춘다.
// 이 기준에서도 50KB를 넘으면 가장 작은 안전 품질본을 그대로 저장한다.
const IMAGE_DIMENSIONS = [1280, 1080, 900, 765, 650, 560];
const IMAGE_QUALITIES = [0.72, 0.60, 0.52, 0.46, 0.42];
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx',
  'jpg', 'jpeg', 'png', 'webp', 'txt', 'csv', 'zip'
]);
const COMPRESSIBLE_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const COMPRESSIBLE_DOCUMENT_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx', 'txt', 'csv', 'zip'
]);
let zipLibraryPromise = null;

function attachmentApiUrl() {
  const raw = window.SHMS_ATTACHMENT_API?.url;
  const configured = raw && !String(raw).includes('YOUR-WORKER') ? raw : DEPLOYED_ATTACHMENT_API_URL;
  if (!configured) return '';
  return String(configured).trim().replace(/\/+$/, '');
}

export function attachmentStorageMode() {
  return attachmentApiUrl() ? 'r2' : 'local-idb';
}

function fileExtension(name = '') {
  return String(name).split('.').pop().toLowerCase();
}

function attachmentFileName(name = '') {
  const safe = String(name).replace(/[\\/:*?"<>|]/g, '_').trim();
  return safe || 'attachment';
}

function baseFileName(name = '') {
  return attachmentFileName(name).replace(/\.[^.]+$/, '') || 'photo';
}

function allowedAttachmentFile(file) {
  const ext = fileExtension(file?.name);
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) {
    throw new Error('PDF, Office, 한글, 사진, TXT, CSV, ZIP 형식만 첨부할 수 있습니다.');
  }
  return ext;
}

function canvasBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

async function imageBitmapFromFile(file) {
  if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' });
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('사진을 읽을 수 없습니다.')); };
    img.src = url;
  });
}

async function compressImageFile(file) {
  if (file.size <= IMAGE_TARGET_BYTES) {
    return { file, originalSize: file.size, compressed: false };
  }
  const source = await imageBitmapFromFile(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    if (typeof source.close === 'function') source.close();
    throw new Error('이 브라우저에서는 사진 압축을 처리할 수 없습니다.');
  }
  let fallback = null;
  try {
    for (const maxDimension of IMAGE_DIMENSIONS) {
      const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (const quality of IMAGE_QUALITIES) {
        const blob = await canvasBlob(canvas, 'image/webp', quality);
        if (blob && (!fallback || blob.size < fallback.size)) fallback = blob;
        if (blob && blob.size <= IMAGE_TARGET_BYTES) {
          return {
            file: new File([blob], `${baseFileName(file.name)}.webp`, { type: 'image/webp', lastModified: file.lastModified }),
            originalSize: file.size,
            compressed: true
          };
        }
      }
    }
  } finally {
    if (typeof source.close === 'function') source.close();
  }
  if (fallback && fallback.size <= MAX_IMAGE_BYTES) {
    return {
      file: new File([fallback], `${baseFileName(file.name)}.webp`, { type: 'image/webp', lastModified: file.lastModified }),
      originalSize: file.size,
      compressed: true,
      targetReached: false
    };
  }
  throw new Error('사진 압축 처리에 실패했습니다. 원본 파일을 다시 선택해 주세요.');
}

async function zipLibrary() {
  if (!zipLibraryPromise) {
    zipLibraryPromise = import('https://esm.sh/jszip@3.10.1?bundle')
      .then(module => module.default || module);
  }
  return zipLibraryPromise;
}

async function compressDocumentFile(file, ext) {
  if (file.size <= MAX_ATTACHMENT_BYTES) {
    return { file, originalSize: file.size, compressed: false };
  }
  const JSZip = await zipLibrary();
  const zip = new JSZip();
  if (ext === 'zip') {
    const source = await JSZip.loadAsync(file);
    for (const [name, entry] of Object.entries(source.files)) {
      if (!entry.dir) zip.file(name, await entry.async('uint8array'), { binary: true, compression: 'DEFLATE' });
    }
  } else {
    zip.file(attachmentFileName(file.name), file, { binary: true, compression: 'DEFLATE' });
  }
  const blob = await zip.generateAsync({
    type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 }
  });
  const compressedFile = new File([blob], `${baseFileName(file.name)}.zip`, {
    type: 'application/zip', lastModified: file.lastModified
  });
  if (compressedFile.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('자동 압축 후에도 문서·ZIP이 15MB를 넘습니다. PDF는 원본 이미지 해상도를 낮춘 뒤 다시 첨부해 주세요.');
  }
  return { file: compressedFile, originalSize: file.size, compressed: true };
}

export async function attachmentHash(file) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}

export async function prepareAttachmentFile(file) {
  if (!(file instanceof Blob)) throw new Error('첨부할 파일을 선택해 주세요.');
  const ext = allowedAttachmentFile(file);
  if (!COMPRESSIBLE_IMAGE_EXTENSIONS.has(ext)) {
    const prepared = COMPRESSIBLE_DOCUMENT_EXTENSIONS.has(ext)
      ? await compressDocumentFile(file, ext)
      : { file, originalSize: file.size, compressed: false };
    return { ...prepared, contentHash: await attachmentHash(prepared.file) };
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error('사진 원본은 30MB 이하만 선택해 주세요.');
  const prepared = await compressImageFile(file);
  if (prepared.file.size > MAX_IMAGE_BYTES) throw new Error('사진은 압축 후 15MB 이하만 등록할 수 있습니다.');
  return { ...prepared, contentHash: await attachmentHash(prepared.file) };
}

function openFileDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('이 브라우저는 로컬 첨부파일 저장을 지원하지 않습니다.')); return; }
    const req = indexedDB.open(FILE_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(FILE_STORE)) req.result.createObjectStore(FILE_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('로컬 첨부파일 저장소를 열 수 없습니다.'));
  });
}

async function fileDbRequest(mode, action) {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, mode);
    const store = tx.objectStore(FILE_STORE);
    const req = action(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('로컬 첨부파일 처리에 실패했습니다.'));
    tx.oncomplete = () => db.close();
    tx.onabort = () => { db.close(); reject(tx.error || new Error('로컬 첨부파일 처리가 중단되었습니다.')); };
  });
}

async function attachmentAuthHeader() {
  if (conn.mode !== 'supabase' || !conn.client) throw new Error('클라우드 첨부파일은 Supabase 로그인 연결 후 사용할 수 있습니다.');
  const { data, error } = await conn.client.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) throw new Error('Supabase 로그인 세션이 없습니다. 다시 로그인해 주세요.');
  return { Authorization: `Bearer ${token}` };
}

export function attachmentUrl(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch (_) { return ''; }
}

export function formatBytes(bytes = 0) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export async function saveAttachmentFile(file, { itemId = '', half = '', note = '' } = {}) {
  if (!(file instanceof Blob)) throw new Error('첨부할 파일을 선택해 주세요.');
  const ext = allowedAttachmentFile(file);
  const isImage = COMPRESSIBLE_IMAGE_EXTENSIONS.has(ext);
  if (file.size > (isImage ? MAX_IMAGE_BYTES : MAX_ATTACHMENT_BYTES)) {
    throw new Error(isImage ? '사진은 압축 후 15MB 이하만 등록할 수 있습니다.' : '문서·압축파일은 15MB 이하만 등록할 수 있습니다.');
  }
  const contentHash = await attachmentHash(file);
  const api = attachmentApiUrl();
  const date = today();
  if (api) {
    const headers = await attachmentAuthHeader();
    const body = new FormData();
    body.append('file', file, file.name || 'attachment');
    body.append('itemId', itemId);
    body.append('half', half);
    body.append('contentHash', contentHash);
    const res = await fetch(`${api}/files`, { method: 'POST', headers, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `파일 업로드 실패 (${res.status})`);
    return {
      id: data.id || uid('att'), kind: 'file', storage: 'r2', key: data.key,
      name: data.name || file.name || 'attachment', note, date,
      mime: data.mime || file.type || 'application/octet-stream', size: data.size ?? file.size,
      contentHash, storageUsage: data.usage || null
    };
  }

  const id = `file_${contentHash}`;
  await fileDbRequest('readwrite', store => store.put({
    id, blob: file, name: file.name || 'attachment', mime: file.type || 'application/octet-stream',
    size: file.size, contentHash, created_at: new Date().toISOString()
  }));
  return {
    id: uid('att'), kind: 'file', storage: 'local-idb', fileId: id,
    name: file.name || 'attachment', note, date,
    mime: file.type || 'application/octet-stream', size: file.size, contentHash
  };
}

export async function getAttachmentStorageUsage() {
  const api = attachmentApiUrl();
  if (!api || conn.mode !== 'supabase') return null;
  try {
    const headers = await attachmentAuthHeader();
    const res = await fetch(`${api}/usage`, { headers });
    const data = await res.json().catch(() => null);
    return res.ok ? data : null;
  } catch (_) {
    return null;
  }
}

function openBlob(blob, name = 'attachment') {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function viewAttachment(att) {
  if (att?.kind === 'link' || att?.url) {
    const url = attachmentUrl(att.url);
    if (!url) throw new Error('http 또는 https 형식의 올바른 링크가 아닙니다.');
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (att?.storage === 'pending' && att._file) { openBlob(att._file, att.name); return; }
  if (att?.storage === 'local-idb' && att.fileId) {
    const row = await fileDbRequest('readonly', store => store.get(att.fileId));
    if (!row?.blob) throw new Error('이 브라우저에서 첨부파일 원본을 찾을 수 없습니다.');
    openBlob(row.blob, att.name);
    return;
  }
  if (att?.storage === 'r2' && att.key) {
    const api = attachmentApiUrl();
    if (!api) throw new Error('Cloudflare 첨부파일 API가 설정되지 않았습니다.');
    const headers = await attachmentAuthHeader();
    const res = await fetch(`${api}/files/${encodeURIComponent(att.key)}`, { headers });
    if (!res.ok) throw new Error(`첨부파일 열람 실패 (${res.status})`);
    openBlob(await res.blob(), att.name);
    return;
  }
  throw new Error('파일명만 기록된 기존 항목입니다. 열람 가능한 원본이나 링크가 없습니다.');
}

export async function deleteAttachmentFile(att) {
  if (att?.storage === 'local-idb' && att.fileId) {
    await fileDbRequest('readwrite', store => store.delete(att.fileId));
  } else if (att?.storage === 'r2' && att.key) {
    const api = attachmentApiUrl();
    if (!api) return;
    const headers = await attachmentAuthHeader();
    const res = await fetch(`${api}/files/${encodeURIComponent(att.key)}`, { method: 'DELETE', headers });
    if (!res.ok && res.status !== 404) throw new Error(`첨부파일 삭제 실패 (${res.status})`);
  }
}

/* ---------------- 테이블 정의 ---------------- */
export const TABLES = {
  records:      'shms_records',        // 법령/ISO 조항별 이행 기록
  documents:    'shms_documents',      // 절차서·지침서
  capa:         'shms_capa',           // 개선조치
  inspections:  'shms_inspections',    // 반기 점검
  org:          'shms_org',            // 조직·선임 현황
  evidence:     'shms_evidence',       // 증빙 자료 목록
  memos:        'shms_memos',          // 메모장
  auditOverview:'shms_audit_overview'  // 심사 개요(요구사항 관리 화면)
};
const AUDIT_TABLE = 'shms_audit_log';

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
  memos: [],
  auditOverview: [],
  auditLog: [],
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
    userDocs: '', userStatus: '', userEvidence: '',
    attachments: [],
    updated_at: '', updated_by: ''
  };
}

function recordFromRemote(row) {
  return {
    ...row,
    userDocs: row.user_docs ?? row.userDocs ?? '',
    userStatus: row.user_status ?? row.userStatus ?? '',
    userEvidence: row.user_evidence ?? row.userEvidence ?? '',
    attachments: Array.isArray(row.attachments) ? row.attachments : []
  };
}

function recordToRemote(row) {
  const { userDocs, userStatus, userEvidence, ...rest } = row;
  return { ...rest, user_docs: userDocs || '', user_status: userStatus || '', user_evidence: userEvidence || '' };
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
    attachments: [],
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
  state.memos       = lsGet('memos', []);
  state.auditOverview = lsGet('auditOverview', []);
  state.auditLog    = lsGet('auditLog', []);

  if (conn.mode === 'supabase') {
    try {
      const [rec, doc, capa, insp, org, evi, memo, auditOv] = await Promise.all([
        conn.client.from(TABLES.records).select('*'),
        conn.client.from(TABLES.documents).select('*'),
        conn.client.from(TABLES.capa).select('*'),
        conn.client.from(TABLES.inspections).select('*'),
        conn.client.from(TABLES.org).select('*'),
        conn.client.from(TABLES.evidence).select('*'),
        conn.client.from(TABLES.memos).select('*'),
        conn.client.from(TABLES.auditOverview).select('*')
      ]);
      const firstErr = [rec, doc, capa, insp, org, evi].find(r => r.error);
      if (firstErr) throw firstErr.error;

      if (rec.data) {
        const map = {};
        rec.data.forEach(r => { map[recordKey(r.item_id, r.half)] = recordFromRemote(r); });
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
      // 메모장·심사개요 테이블은 schema.sql 적용 전에는 없을 수 있으므로 오류가 나도 무시하고 로컬 자료를 유지한다.
      if (!memo.error) state.memos = memo.data || [];
      if (!auditOv.error) state.auditOverview = auditOv.data || [];
      persistAll();
      try {
        const { data: audit } = await conn.client.from(AUDIT_TABLE).select('*').order('created_at', { ascending: false }).limit(200);
        state.auditLog = audit || [];
        lsSet('auditLog', state.auditLog);
      } catch (_) { /* 감사 테이블 마이그레이션 전에도 기존 자료는 표시한다. */ }
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
  lsSet('memos', state.memos);
  lsSet('auditOverview', state.auditOverview);
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

function auditActor() {
  return { actor_id: state.user?.id || null, login_id: state.user?.loginId || state.user?.login_id || '', actor_name: state.user?.name || '미상' };
}

async function writeAudit(action, entityType, entityId, beforeData, afterData) {
  const auditId = conn.mode === 'supabase' && crypto.randomUUID ? crypto.randomUUID() : uid('audit');
  const entry = { id: auditId, ...auditActor(), action, entity_type: entityType, entity_id: String(entityId || ''), before_data: beforeData || null, after_data: afterData || null, created_at: new Date().toISOString() };
  state.auditLog = [entry, ...(state.auditLog || [])].slice(0, 200);
  lsSet('auditLog', state.auditLog);
  if (conn.mode !== 'supabase') return { ok: true, local: true };
  try {
    const { error } = await conn.client.from(AUDIT_TABLE).insert(entry);
    if (error) throw error;
    return { ok: true };
  } catch (e) { conn.error = e?.message || String(e); return { ok: false, error: conn.error }; }
}

export function getAuditLog() { return state.auditLog || []; }

export async function saveRecord(itemId, patch, half = state.half) {
  const key = recordKey(itemId, half);
  const before = state.records[key] || null;
  const row = { ...getRecord(itemId, half), ...patch, item_id: itemId, half, ...stamp() };
  state.records[key] = row;
  lsSet('records', state.records);
  emit();
  const result = await remoteUpsert(TABLES.records, recordToRemote(row), 'item_id,half');
  await writeAudit(before ? 'update' : 'create', 'record', `${itemId}@${half}`, before, row);
  return result;
}

/** 법령·ISO 항목의 작성 기록만 삭제한다. 마스터 데이터 항목 자체는 유지된다. */
export async function deleteRecord(itemId, half = state.half) {
  if (!canDelete()) return { ok: false, error: '삭제는 마스터 관리자만 할 수 있습니다.' };
  const key = recordKey(itemId, half);
  const row = state.records[key];
  delete state.records[key];
  lsSet('records', state.records);
  emit();
  if (conn.mode !== 'supabase') {
    await Promise.allSettled((row?.attachments || []).map(deleteAttachmentFile));
    await writeAudit('delete', 'record', `${itemId}@${half}`, row, null);
    return { ok: true, local: true };
  }
  try {
    const { error } = await conn.client.from(TABLES.records).delete().eq('item_id', itemId).eq('half', half);
    if (error) throw error;
    await Promise.allSettled((row?.attachments || []).map(deleteAttachmentFile));
    await writeAudit('delete', 'record', `${itemId}@${half}`, row, null);
    return { ok: true };
  } catch (e) {
    conn.error = e?.message || String(e);
    return { ok: false, error: conn.error };
  }
}

export async function saveDocument(doc) {
  const before = state.documents.find(d => d.id === doc.id) || null;
  const row = { ...doc, ...stamp() };
  const i = state.documents.findIndex(d => d.id === row.id);
  if (i >= 0) state.documents[i] = row; else state.documents.push(row);
  lsSet('documents', state.documents);
  emit();
  const result = await remoteUpsert(TABLES.documents, row, 'id');
  await writeAudit(before ? 'update' : 'create', 'document', row.id, before, row);
  return result;
}

export async function saveRow(kind, row) {
  const table = TABLES[kind];
  const list = state[kind];
  const r = { ...row, id: row.id || uid(kind), ...stamp() };
  const before = list.find(x => x.id === r.id) || null;
  const i = list.findIndex(x => x.id === r.id);
  if (i >= 0) list[i] = r; else list.push(r);
  lsSet(kind, list);
  emit();
  const result = await remoteUpsert(table, r, 'id');
  await writeAudit(before ? 'update' : 'create', kind, r.id, before, r);
  return result;
}

export async function deleteRow(kind, id) {
  if (!canDelete()) return { ok: false, error: '삭제는 마스터 관리자만 할 수 있습니다.' };
  const deleted = state[kind].find(x => x.id === id);
  state[kind] = state[kind].filter(x => x.id !== id);
  lsSet(kind, state[kind]);
  emit();
  const res = await remoteDelete(TABLES[kind], id);
  if (res.ok) await Promise.allSettled((deleted?.attachments || []).map(deleteAttachmentFile));
  if (res.ok) await writeAudit('delete', kind, id, deleted, null);
  return res;
}

/* ---------------- 자동 백업 ----------------
   앱이 열려 있을 때 매일 오전 9시에 1회만 생성한다.
   저장 때마다 스냅샷을 만들지 않아 브라우저 저장공간 중복을 줄인다.
------------------------------------------------------------- */
const BK_PREFIX = 'shms.backup.';
const BK_MAX = 5;
const BK_DAILY_KEY = 'shms.backup.daily.last';
let backupTimer = null;

const backupDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function createDailyBackup() {
  const now = new Date();
  if (localStorage.getItem(BK_DAILY_KEY) === backupDay(now)) return false;
  try {
    const snap = {
      ts: now.toISOString(),
      records: state.records, documents: state.documents, capa: state.capa,
      inspections: state.inspections, org: state.org, evidence: state.evidence
    };
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(BK_PREFIX)).sort();
    while (keys.length >= BK_MAX) localStorage.removeItem(keys.shift());
    localStorage.setItem(BK_PREFIX + now.getTime(), JSON.stringify(snap));
    localStorage.setItem(BK_DAILY_KEY, backupDay(now));
    return true;
  } catch (_) { return false; }
}

/** 앱이 열린 상태에서 다음 오전 9시에 자동 백업을 한 번 생성한다. */
export function scheduleDailyAutoBackup() {
  clearTimeout(backupTimer);
  const now = new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  backupTimer = setTimeout(() => {
    createDailyBackup();
    scheduleDailyAutoBackup();
  }, Math.max(1000, next.getTime() - now.getTime()));
}

export function getBackups() {
  return Object.keys(localStorage)
    .filter(k => k.startsWith(BK_PREFIX))
    .sort().reverse()
    .map(k => {
      try {
        const d = JSON.parse(localStorage.getItem(k));
        const rc = Object.keys(d.records || {}).length;
        const dc = (d.documents || []).length;
        const cc = (d.capa || []).length;
        const ic = (d.inspections || []).length;
        return { key: k, ts: d.ts, records: rc, documents: dc, capa: cc, inspections: ic };
      } catch (_) { return null; }
    }).filter(Boolean);
}

export function restoreBackup(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    ['records','documents','capa','inspections','org','evidence'].forEach(k => {
      if (d[k]) { state[k] = d[k]; lsSet(k, state[k]); }
    });
    emit();
    return true;
  } catch (_) { return false; }
}

export function deleteBackup(key) {
  if (!canDelete()) return false;
  localStorage.removeItem(key);
  return true;
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

/* ---------------- 인증 (공용 작성 / 관리자 삭제 비밀번호 방식) ----------------
   아이디 없이 두 개의 비밀번호로 진입한다.
   · 공용 비밀번호: 작성·수정 가능, 삭제 불가
   · 관리자 비밀번호: 작성·수정·삭제 가능
   ⚠ 이 해시는 소스에 포함되므로 외부 유출을 막는 보안장치가 아니라
     "아무나 실수로 들어오지 않게 하는 문턱"이다.
     실제 데이터 접근 통제는 Supabase 연결 시 RLS 정책이 수행해야 한다.
   비밀번호를 바꾸려면 새 해시를 만들어 해당 해시를 교체한다.
     node -e "console.log(require('crypto').createHash('sha256').update('새비밀번호','utf8').digest('hex'))"
------------------------------------------------------------- */
const SESSION_KEY = 'shms.session';
const GATE_HASH = 'f2e5aafc64a04ac704c644ce38c34d1d7f7493561687c66e43eeda8186744134';
const MASTER_GATE_HASH = '56b8155cf60358d399f7fb33ace4ef24bd3c573d9065e7fbb17d91acc528d0fc';

/** 진입 성공 시 부여되는 사용자 (작성·수정 권한) */
const GATE_USER = {
  id: 'shms_gate', email: '', name: '안전보건팀',
  role: 'safety', dept: '안전보건팀', source: 'gate'
};

/** 관리자 비밀번호로 진입한 경우에만 부여되는 삭제 권한 사용자 */
const MASTER_GATE_USER = {
  id: 'shms_master_gate', email: '', name: '마스터 관리자',
  role: 'master', dept: '안전보건팀', source: 'master-gate'
};

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function loadSupabaseProfile(authUser) {
  const { data, error } = await conn.client.from('shms_profiles')
    .select('id,login_id,email,name,dept,role').eq('id', authUser.id).single();
  if (error) throw new Error(`사용자 권한 정보를 불러오지 못했습니다: ${error.message}`);
  return { ...data, loginId: data.login_id || '', email: data.email || authUser.email || '', name: data.name || data.login_id || '사용자', source: 'supabase' };
}

function normalizeLoginId(value) {
  const loginId = String(value || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(loginId)) {
    throw new Error('아이디는 영문으로 시작하는 3~32자의 영문·숫자·점·밑줄·하이픈만 사용할 수 있습니다.');
  }
  return loginId;
}

// Supabase Auth 내부 식별용 별칭입니다. 사용자에게 이메일을 요구하지 않습니다.
function authEmailForLoginId(loginId) {
  return `${loginId}@accounts.daiso-shms.local`;
}

export async function restoreSession() {
  if (conn.mode === 'supabase') {
    const { data, error } = await conn.client.auth.getSession();
    if (error) { conn.error = error.message; return null; }
    if (!data.session?.user) return null;
    try { state.user = await loadSupabaseProfile(data.session.user); return state.user; }
    catch (e) { conn.error = e?.message || String(e); await conn.client.auth.signOut(); return null; }
  }
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (raw) { state.user = JSON.parse(raw); return state.user; }
  } catch (_) {}
  return null;
}

export async function signIn({ loginId = '', password, remember }) {
  if (conn.mode === 'supabase') {
    const cleanLoginId = normalizeLoginId(loginId);
    if (!password) throw new Error('아이디와 비밀번호를 입력하세요.');
    const { data, error } = await conn.client.auth.signInWithPassword({ email: authEmailForLoginId(cleanLoginId), password });
    if (error) throw new Error(error.message);
    state.user = await loadSupabaseProfile(data.user);
    return state.user;
  }
  const pw = String(password || '');
  if (!pw) throw new Error('비밀번호를 입력하세요.');
  if (!window.crypto?.subtle) {
    throw new Error('보안 연결(https) 또는 localhost 에서만 로그인할 수 있습니다.');
  }
  const hash = await sha256Hex(pw);
  if (hash === MASTER_GATE_HASH) state.user = { ...MASTER_GATE_USER };
  else if (hash === GATE_HASH) state.user = { ...GATE_USER };
  else throw new Error('비밀번호가 올바르지 않습니다.');
  const raw = JSON.stringify(state.user);
  sessionStorage.setItem(SESSION_KEY, raw);
  if (remember) localStorage.setItem(SESSION_KEY, raw); else localStorage.removeItem(SESSION_KEY);
  return state.user;
}

export async function signUp({ loginId, password, name }) {
  if (conn.mode !== 'supabase') throw new Error('공동 운영 서버가 아직 연결되지 않았습니다.');
  const cleanLoginId = normalizeLoginId(loginId);
  if (!password) throw new Error('아이디와 비밀번호를 입력하세요.');
  const { data, error } = await conn.client.auth.signUp({
    email: authEmailForLoginId(cleanLoginId), password,
    options: { data: { login_id: cleanLoginId, name: String(name || '').trim() || cleanLoginId } }
  });
  if (error) throw new Error(error.message);
  if (!data.session) return { confirmRequired: true };
  state.user = await loadSupabaseProfile(data.user);
  return { confirmRequired: false };
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

/** 삭제는 관리자 비밀번호로 로그인한 사용자에게만 허용한다. */
export function canDelete() {
  return state.user?.role === 'master' && (conn.mode === 'supabase' || state.user?.source === 'master-gate');
}
