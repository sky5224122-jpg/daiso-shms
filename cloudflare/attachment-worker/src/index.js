import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksByUrl = new Map();
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'hwp', 'hwpx',
  'jpg', 'jpeg', 'png', 'webp', 'txt', 'csv', 'zip'
]);
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

function storageSummary(totalBytes, env) {
  const limitBytes = Number(env.TOTAL_STORAGE_LIMIT_BYTES || 3 * 1024 * 1024 * 1024);
  const warningBytes = Number(env.STORAGE_WARNING_BYTES || Math.floor(limitBytes * 0.9));
  const pct = limitBytes ? Math.min(100, Math.round(totalBytes / limitBytes * 100)) : 0;
  return {
    totalBytes, limitBytes, warningBytes, pct,
    warning: totalBytes >= warningBytes
      ? `공용 첨부 저장공간 사용량이 ${pct}%입니다. 3GB 도달 시 새 파일 저장이 차단됩니다.`
      : ''
  };
}

export class ShmsStorageLimiter {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const { action, bytes = 0 } = await request.json().catch(() => ({}));
    const current = Number(await this.state.storage.get('totalBytes') || 0);
    if (action === 'reserve') {
      const next = current + Math.max(0, Number(bytes) || 0);
      const summary = storageSummary(next, this.env);
      if (next > summary.limitBytes) {
        return Response.json({ ok: false, ...storageSummary(current, this.env) }, { status: 507 });
      }
      await this.state.storage.put('totalBytes', next);
      return Response.json({ ok: true, ...summary });
    }
    if (action === 'release') {
      const next = Math.max(0, current - Math.max(0, Number(bytes) || 0));
      await this.state.storage.put('totalBytes', next);
      return Response.json({ ok: true, ...storageSummary(next, this.env) });
    }
    return Response.json({ ok: true, ...storageSummary(current, this.env) });
  }
}

async function storageUsage(env, action = 'usage', bytes = 0) {
  const id = env.SHMS_STORAGE_LIMITER.idFromName('daiso-shms-global-storage');
  const res = await env.SHMS_STORAGE_LIMITER.get(id).fetch('https://storage-limiter/usage', {
    method: 'POST', body: JSON.stringify({ action, bytes })
  });
  const data = await res.json();
  return { ok: res.ok && data.ok, status: res.status, ...data };
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.APP_ORIGIN || '').split(',').map(v => v.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return '';
  return origin;
}

function corsHeaders(request, env) {
  const origin = allowedOrigin(request, env);
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(request, env, body, status = 200) {
  return Response.json(body, { status, headers: corsHeaders(request, env) });
}

async function authenticate(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('인증 토큰이 없습니다.');
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (!/^https:\/\/.+\.supabase\.co$/i.test(base)) throw new Error('SUPABASE_URL 설정이 올바르지 않습니다.');
  const jwksUrl = `${base}/auth/v1/.well-known/jwks.json`;
  if (!jwksByUrl.has(jwksUrl)) jwksByUrl.set(jwksUrl, createRemoteJWKSet(new URL(jwksUrl)));
  const { payload } = await jwtVerify(token, jwksByUrl.get(jwksUrl), {
    issuer: `${base}/auth/v1`,
    audience: 'authenticated'
  });
  if (!payload.sub) throw new Error('사용자 식별값이 없는 토큰입니다.');
  return { ...payload, token };
}

async function isMaster(user, env) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anonKey = String(env.SUPABASE_ANON_KEY || '').trim();
  if (!base || !anonKey || !user?.sub || !user?.token) return false;
  const res = await fetch(`${base}/rest/v1/shms_profiles?select=role&id=eq.${encodeURIComponent(user.sub)}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${user.token}` }
  });
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  return rows[0]?.role === 'master';
}

function safePart(value, fallback) {
  const clean = String(value || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return clean.slice(0, 80) || fallback;
}

function fileExtension(name = '') {
  return String(name).split('.').pop().toLowerCase();
}

function fileKey(userId, half, itemId, contentHash, name) {
  const ext = String(name || '').match(/\.[a-zA-Z0-9]{1,10}$/)?.[0] || '';
  return `${safePart(userId, 'user')}/${safePart(half, 'no-half')}/${safePart(itemId, 'no-item')}/${contentHash}${ext}`;
}

async function sha256(file) {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map(v => v.toString(16).padStart(2, '0')).join('');
}

async function upload(request, env, user) {
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return json(request, env, { error: '첨부파일이 없습니다.' }, 400);
  const ext = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) return json(request, env, { error: '허용되지 않은 파일 형식입니다.' }, 415);
  const max = Number(env.MAX_FILE_BYTES || 15 * 1024 * 1024);
  const maxImage = Number(env.MAX_IMAGE_BYTES || max);
  const isImage = IMAGE_EXTENSIONS.has(ext);
  const limit = isImage ? maxImage : max;
  if (!file.size || file.size > limit) {
    const message = isImage ? `사진은 압축 후 ${Math.floor(limit / 1024 / 1024)}MB 이하만 등록할 수 있습니다.` : `파일은 ${Math.floor(limit / 1024 / 1024)}MB 이하만 등록할 수 있습니다.`;
    return json(request, env, { error: message }, 413);
  }
  const contentHash = await sha256(file);
  const key = fileKey(user.sub, form.get('half'), form.get('itemId'), contentHash, file.name);
  const existing = await env.SHMS_FILES.head(key);
  const delta = file.size - (existing?.size || 0);
  let usage = await storageUsage(env);
  if (delta > 0) {
    usage = await storageUsage(env, 'reserve', delta);
    if (!usage.ok) return json(request, env, {
      error: '공용 첨부 저장공간 3GB에 도달해 새 파일을 저장할 수 없습니다.', usage
    }, 507);
  }
  try {
    await env.SHMS_FILES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
      customMetadata: { name: file.name, uploadedBy: String(user.sub), uploadedAt: new Date().toISOString(), contentHash }
    });
  } catch (error) {
    if (delta > 0) await storageUsage(env, 'release', delta);
    throw error;
  }
  if (delta < 0) usage = await storageUsage(env, 'release', -delta);
  return json(request, env, {
    id: crypto.randomUUID(), key, name: file.name,
    mime: file.type || 'application/octet-stream', size: file.size, contentHash, usage
  }, 201);
}

async function readFile(request, env, key) {
  const object = await env.SHMS_FILES.get(key);
  if (!object) return json(request, env, { error: '첨부파일을 찾을 수 없습니다.' }, 404);
  const headers = new Headers(corsHeaders(request, env));
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  const name = object.customMetadata?.name || key.split('/').pop() || 'attachment';
  headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`);
  headers.set('Cache-Control', 'private, max-age=300');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
}

async function removeFile(request, env, key, user) {
  if (!key.startsWith(`${safePart(user.sub, 'user')}/`) && !(await isMaster(user, env))) {
    return json(request, env, { error: '본인이 등록한 첨부파일만 삭제할 수 있습니다.' }, 403);
  }
  const object = await env.SHMS_FILES.head(key);
  await env.SHMS_FILES.delete(key);
  const usage = object?.size ? await storageUsage(env, 'release', object.size) : await storageUsage(env);
  return json(request, env, { ok: true, usage });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    if (!allowedOrigin(request, env)) return json(request, env, { error: '허용되지 않은 접속 출처입니다.' }, 403);
    let user;
    try {
      user = await authenticate(request, env);
    } catch (error) {
      return json(request, env, { error: error?.message || String(error) }, 401);
    }
    try {
      const url = new URL(request.url);
      if (request.method === 'GET' && url.pathname === '/usage') return json(request, env, await storageUsage(env));
      if (request.method === 'POST' && url.pathname === '/files') return upload(request, env, user);
      if (url.pathname.startsWith('/files/')) {
        const key = decodeURIComponent(url.pathname.slice('/files/'.length));
        if (!key) return json(request, env, { error: '파일 키가 없습니다.' }, 400);
        if (request.method === 'GET') return readFile(request, env, key);
        if (request.method === 'DELETE') return removeFile(request, env, key, user);
      }
      return json(request, env, { error: '지원하지 않는 경로입니다.' }, 404);
    } catch (error) {
      return json(request, env, { error: error?.message || String(error) }, 500);
    }
  }
};
