/* ============================================================
   app.js — 애플리케이션 셸 / 라우팅 / 로그인
   ============================================================ */

import {
  APP, $, $$, esc, state, conn, initSupabase, loadAll, onChange,
  restoreSession, signIn, signUp, signOut, canEdit, currentHalf, recentHalves, halfLabel,
  getRecord, toast, showSpinner, hideSpinner, scheduleDailyAutoBackup
} from './core.js?v=20260905_teams';
import { MSSA_ITEMS, OSHA_ITEMS, ISO_ITEMS, ROLES } from './data/frameworks.js?v=20260905_teams';
import {
  renderDashboard, bindDashboardEvents, renderCompliance, bindComplianceEvents, openItemDrawer, resetFilter
} from './views-core.js?v=20260905_teams';
import {
  renderDocuments, bindDocumentEvents,
  renderInspection, bindInspectionEvents,
  renderCapa, bindCapaEvents,
  renderEvidence, bindEvidenceEvents,
  renderOrg, bindOrgEvents,
  renderAudit, bindAuditEvents,
  renderSettings, bindSettingsEvents,
  renderBackup, bindBackupEvents,
  renderRestore, bindRestoreEvents,
  renderMemo, bindMemoEvents
} from './views-ext.js?v=20260905_teams';

/* ---------------- 화면 정의 ---------------- */
/* roles가 없으면 로그인한 모든 사용자에게 보인다. roles가 있으면 그 권한만 접근할 수 있다. */
const NAV = [
  { group: '이행 현황', items: [
    { key:'dashboard', icon:'📊', label:'종합 대시보드', crumb:'현황', title:'안전보건관리체계 종합 이행 현황' }
  ]},
  { group: '법령 이행관리', items: [
    { key:'mssa', icon:'⚖️', label:'중대재해처벌법', crumb:'법령 이행관리', title:'중대재해처벌법 시행령 제4조·제5조 이행관리' },
    { key:'osha', icon:'📕', label:'산업안전보건법', crumb:'법령 이행관리', title:'산업안전보건법 주요 의무 이행관리' }
  ]},
  { group: '안전보건관리체계 요구사항', items: [
    { key:'iso',   icon:'🌐', label:'요구사항 관리', crumb:'안전보건관리체계', title:'안전보건관리체계 요구사항 이행관리' },
    { key:'audit', icon:'🎯', label:'안전보건관리체계 대응 매트릭스', crumb:'안전보건관리체계', title:'안전보건관리체계 대응 매트릭스' }
  ]},
  { group: '문서체계', items: [
    { key:'documents', icon:'📁', label:'절차서 · 지침서', crumb:'문서체계', title:'안전보건 문서체계 (매뉴얼·절차서·지침서·양식)' }
  ]},
  { group: '실행 관리', items: [
    { key:'inspection', icon:'🗓️', label:'이행 점검', crumb:'실행 관리', title:'반기 1회 이상 법정 이행 점검' },
    { key:'capa',       icon:'🔧', label:'개선조치(CAPA)', crumb:'실행 관리', title:'부적합 개선조치 관리' },
    { key:'evidence',   icon:'🗂️', label:'증빙 자료함', crumb:'실행 관리', title:'이행 증빙 자료 등록부' },
    { key:'org',        icon:'👥', label:'조직 · 법정선임', crumb:'실행 관리', title:'조직 및 법정 선임 현황' },
    { key:'memo',       icon:'📝', label:'메모장',     crumb:'실행 관리', title:'심사결과·업무 메모장' }
  ]},
  { group: '시스템', items: [
    { key:'settings', icon:'⚙️', label:'설정',       crumb:'시스템', title:'시스템 설정', roles:['master'] },
    { key:'backup',   icon:'💾', label:'백업',       crumb:'시스템', title:'자료 백업', roles:['master','safety','head'] },
    { key:'restore',  icon:'🔄', label:'복원',       crumb:'시스템', title:'자료 복원', roles:['master'] }
  ]}
];
const NAV_FLAT = NAV.flatMap(g => g.items);

const app = () => document.getElementById('app');

/* ---------------- 게스트 읽기 전용 열람 ----------------
   로그인 화면의 "게스트로 열람" 버튼에서 사용하는 코드다. Supabase 계정이 아니며
   작성·수정·삭제 권한이 없다. 코드를 바꾸려면 새 해시를 만들어 GUEST_CODE_HASH를 교체한다.
     node -e "console.log(require('crypto').createHash('sha256').update('새코드','utf8').digest('hex'))"
------------------------------------------------------------------------------- */
const GUEST_SESSION_KEY = 'shms.guestsession';
const GUEST_IDS = ['guest01', 'guest02', 'guest03'];
const GUEST_CODE_HASH = '04b10b1ea8a3db83aa866819302939f8784264a53c6415111579c03c32e46452';

/** 게스트로 열람할 때 부여되는 읽기 전용 로컬 세션 — Supabase 계정이 아니며 작성·수정·삭제 권한이 없다. */
const GUEST_USER = { id: 'shms_guest', email: '', name: '게스트', role: 'guest', dept: '외부 게스트', source: 'guest' };

async function gateSha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkGuestCode(idFieldId, codeFieldId) {
  const id = $('#' + idFieldId).value.trim().toLowerCase();
  const code = $('#' + codeFieldId).value;
  const hash = await gateSha256Hex(code);
  return GUEST_IDS.includes(id) && hash === GUEST_CODE_HASH;
}

/* ---------------- 최근 로그인 아이디 (클릭 시 선택 가능) ---------------- */
const RECENT_LOGIN_KEY = 'shms_recent_login_ids';
function getRecentLoginIds() {
  try { return JSON.parse(localStorage.getItem(RECENT_LOGIN_KEY)) || []; } catch (_) { return []; }
}
function saveRecentLoginId(id) {
  if (!id) return;
  const list = getRecentLoginIds().filter(v => v !== id);
  list.unshift(id);
  try { localStorage.setItem(RECENT_LOGIN_KEY, JSON.stringify(list.slice(0, 8))); } catch (_) {}
}

/* ---------------- 로그인 화면 ---------------- */
function renderLogin() {
  app().innerHTML = `
  <div class="login-wrap">
    <div class="login-card">
      <div class="login-badge">
        <img src="assets/asung-group-symbol.png" alt="아성다이소" onerror="this.style.display='none'">
        <div>
          <div class="t1">ASUNG DAISO · SAFETY &amp; HEALTH</div>
          <div class="t2">안전보건관리체계<br>이행 관리 시스템</div>
        </div>
      </div>
      <form id="loginForm" autocomplete="on">
        ${conn.mode === 'supabase' ? `
        <label for="lgLoginId">아이디</label>
        <input id="lgLoginId" type="text" autocomplete="username" list="lgLoginIdList" placeholder="예: safety02" required autofocus>
        <datalist id="lgLoginIdList"></datalist>
        <label for="lgName" id="lgNameLabel" style="display:none">이름</label>
        <input id="lgName" type="text" autocomplete="name" placeholder="이름 (계정 만들기 시 입력)" style="display:none">
        <label for="lgPw">비밀번호</label>` : '<label for="lgPw">접속 비밀번호</label>'}
        <div style="position:relative;display:flex;align-items:center">
          <input id="lgPw" type="password" autocomplete="current-password" placeholder="비밀번호를 입력하세요" required autofocus style="padding-right:44px;width:100%;box-sizing:border-box">
          <button type="button" id="lgPwToggle" title="비밀번호 표시/숨김" style="position:absolute;right:10px;background:none;border:none;cursor:pointer;padding:4px;color:#667085;font-size:18px;line-height:1">👁</button>
        </div>
        ${conn.mode !== 'supabase' ? `<label style="display:flex;align-items:center;gap:7px;font-weight:700;margin-top:14px">
          <input type="checkbox" id="lgRemember" style="width:auto;margin:0"> 이 브라우저에서 로그인 유지
        </label>` : ''}
        <button class="login-btn" type="submit" id="lgSubmit">${conn.mode === 'supabase' ? '로그인' : '들어가기'}</button>
        ${conn.mode === 'supabase' ? '<button class="btn" type="button" id="lgMode" style="width:100%;margin-top:9px">처음이면 계정 만들기</button>' : ''}
        <div class="login-err" id="lgErr"></div>
      </form>
      ${conn.mode === 'supabase' ? `
      <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
        <button class="btn" type="button" id="lgGuestBtn" style="width:100%">게스트로 열람 (읽기 전용)</button>
        <div id="guestBox" style="display:none;margin-top:10px">
          <label for="guestId">게스트 아이디</label>
          <input id="guestId" type="text" placeholder="예: guest01">
          <label for="guestCode">게스트 코드</label>
          <input id="guestCode" type="password" placeholder="발급받은 코드">
          <button class="btn primary" type="button" id="guestConfirm" style="width:100%;margin-top:9px">게스트로 입장</button>
          <div class="login-err" id="guestErr"></div>
        </div>
      </div>` : ''}
      <div class="login-hint">
        <b>${conn.mode === 'supabase' ? '🟢 Supabase 연결됨' : '🟡 로컬 저장 모드'}</b><br>
        ${conn.mode === 'supabase'
          ? '아이디로 로그인하면 작성 자료가 모든 사용자에게 공유됩니다. 모든 가입 사용자는 작성·수정할 수 있고, master 관리자만 삭제할 수 있습니다.'
          : `작성 자료는 이 브라우저에만 저장됩니다. 여러 명이 함께 쓰려면
             로그인 후 <b>[설정 · 백업]</b> 화면에서 Supabase를 연결하십시오.`}
      </div>
      <div style="margin-top:14px;text-align:center;font-size:11px;color:#98a2b3">
        ${esc(APP.org)} · V1.0.0
      </div>
    </div>
  </div>`;

  if (conn.mode === 'supabase') {
    $('#lgLoginIdList').innerHTML = getRecentLoginIds().map(id => `<option value="${esc(id)}">`).join('');
  }

  let signupMode = false;
  $('#lgPwToggle').addEventListener('click', () => {
    const inp = $('#lgPw');
    const btn = $('#lgPwToggle');
    if (inp.type === 'password') {
      inp.type = 'text';
      btn.textContent = '🙈';
      btn.title = '비밀번호 숨기기';
    } else {
      inp.type = 'password';
      btn.textContent = '👁';
      btn.title = '비밀번호 표시';
    }
  });

  $('#lgMode')?.addEventListener('click', () => {
    signupMode = !signupMode;
    $('#lgName').style.display = signupMode ? '' : 'none';
    $('#lgNameLabel').style.display = signupMode ? '' : 'none';
    $('#lgName').required = signupMode;
    $('#lgSubmit').textContent = signupMode ? '계정 만들기' : '로그인';
    $('#lgMode').textContent = signupMode ? '기존 계정으로 로그인' : '처음이면 계정 만들기';
    $('#lgErr').textContent = '';
  });

  $('#lgGuestBtn')?.addEventListener('click', () => {
    $('#guestBox').style.display = 'block';
    $('#lgGuestBtn').style.display = 'none';
  });

  $('#guestConfirm')?.addEventListener('click', async () => {
    const err = $('#guestErr');
    err.textContent = '';
    if (await checkGuestCode('guestId', 'guestCode')) {
      sessionStorage.setItem(GUEST_SESSION_KEY, '1');
      state.user = { ...GUEST_USER };
      await boot();
    } else {
      err.textContent = '게스트 코드가 올바르지 않습니다.';
    }
  });

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#lgErr');
    err.textContent = '';
    try {
      if (conn.mode === 'supabase' && signupMode) {
        const result = await signUp({ loginId: $('#lgLoginId').value, password: $('#lgPw').value, name: $('#lgName').value });
        if (result.confirmRequired) { err.textContent = '가입 확인 이메일을 열어 인증한 뒤 로그인해 주세요.'; return; }
      } else {
        await signIn({
          loginId: $('#lgLoginId')?.value,
          password: $('#lgPw').value,
          remember: $('#lgRemember')?.checked
        });
      }
      saveRecentLoginId($('#lgLoginId')?.value?.trim());
      await boot();
    } catch (ex) {
      err.textContent = ex.message || String(ex);
    }
  });
}

/* ---------------- 셸 ---------------- */
function badgeFor(key) {
  const bad = items => items.filter(i => ['none', 'hold'].includes(getRecord(i.id).status)).length;
  if (key === 'mssa') return bad(MSSA_ITEMS) || '';
  if (key === 'osha') return bad(OSHA_ITEMS) || '';
  if (key === 'iso')  return bad(ISO_ITEMS)  || '';
  if (key === 'capa') return state.capa.filter(c => c.status !== 'closed').length || '';
  if (key === 'documents') return state.documents.filter(d => d.status !== 'approved').length || '';
  return '';
}

function renderShell() {
  const u = state.user;
  app().innerHTML = `
  <div class="shell" id="shell">
    <aside class="sidebar">
      <div class="side-head">
        <img src="assets/asung-group-symbol.png" alt="" onerror="this.style.display='none'">
        <div class="nm">
          <div class="a">ASUNG DAISO</div>
          <div class="b">안전보건관리체계</div>
        </div>
      </div>
      <div class="side-scroll" id="navRoot"></div>
      <div class="side-foot">
        <div class="side-user">
          <div class="av">${esc((u?.name || '?').slice(0, 1))}</div>
          <div class="nm"><b>${esc(u?.name || '')}</b><span>${esc(ROLES[u?.role]?.label || u?.role || '')}</span></div>
        </div>
        <button id="btnLogout">로그아웃</button>
      </div>
    </aside>

    <div class="content">
      <header class="topbar">
        <button class="hamb" id="btnCollapse" title="메뉴 접기/펼치기">☰</button>
        <div>
          <div class="crumb" id="crumb"></div>
          <h1 id="pageTitle"></h1>
        </div>
        <div class="grow"></div>
        <select class="inp" id="halfSel" style="width:auto;min-width:132px;font-weight:800">
          ${recentHalves(6).map(h => `<option value="${h}" ${h === state.half ? 'selected' : ''}>${halfLabel(h)}</option>`).join('')}
        </select>
        <span class="sync-chip ${conn.mode === 'supabase' ? 'on' : 'off'}" id="syncChip" title="${esc(conn.error || '')}">
          <span class="dot"></span>${conn.mode === 'supabase' ? 'Supabase 연결' : '로컬 저장'}
        </span>
      </header>
      <main class="main" id="view"></main>
    </div>
  </div>`;

  $('#btnLogout').addEventListener('click', async () => {
    sessionStorage.removeItem(GUEST_SESSION_KEY);
    await signOut();
    renderLogin();
  });
  $('#btnCollapse').addEventListener('click', () => $('#shell').classList.toggle('collapsed'));
  $('#halfSel').addEventListener('change', e => { state.half = e.target.value; route(); });

  renderNav();
}

/** roles가 없으면 전체 허용, 있으면 현재 사용자의 role이 포함된 경우만 허용 */
function navAllowed(item) {
  return !item.roles || item.roles.includes(state.user?.role);
}

function renderNav() {
  const root = $('#navRoot');
  if (!root) return;
  const cur = currentView();
  root.innerHTML = NAV.map(g => {
    const items = g.items.filter(navAllowed);
    if (!items.length) return '';
    return `
    <div class="nav-group">
      <div class="nav-group-t">${esc(g.group)}</div>
      ${items.map(i => {
        const b = badgeFor(i.key);
        return `<button class="nav-item ${i.key === cur ? 'active' : ''}" data-nav="${i.key}" title="${esc(i.label)}">
          <span class="ico">${i.icon}</span><span class="lb">${esc(i.label)}</span>
          ${b ? `<span class="bd">${b}</span>` : '<span></span>'}
        </button>`;
      }).join('')}
    </div>`;
  }).join('');
  root.querySelectorAll('[data-nav]').forEach(b =>
    b.addEventListener('click', () => { location.hash = '#/' + b.dataset.nav; }));
}

/* ---------------- 라우팅 ---------------- */
function currentView() {
  const k = (location.hash || '').replace(/^#\/?/, '') || 'dashboard';
  const meta = NAV_FLAT.find(i => i.key === k);
  return (meta && navAllowed(meta)) ? k : 'dashboard';
}

function route() {
  if (!state.user) { renderLogin(); return; }
  if (!$('#view')) renderShell();

  const key = currentView();
  const meta = NAV_FLAT.find(i => i.key === key);

  // 화면 노드를 매번 새로 만든다 — 재렌더 시 이벤트 리스너가 중복 등록되는 것을 막는다.
  const view = document.createElement('main');
  view.className = 'main';
  view.id = 'view';
  const scrollY = window.scrollY;
  $('#view').replaceWith(view);

  $('#crumb').innerHTML = `${esc(meta.crumb)} <span style="opacity:.5">›</span> ${esc(meta.label)}
    <span class="tag" style="margin-left:6px">${esc(halfLabel(state.half))}</span>`;
  $('#pageTitle').textContent = meta.title;
  renderNav();

  const rerender = () => route();
  const openItem = id => openItemDrawer(id, rerender);

  switch (key) {
    case 'dashboard':
      view.innerHTML = renderDashboard();
      bindDashboardEvents(view, openItem);
      break;

    case 'mssa': case 'osha': case 'iso': {
      const fw = key === 'iso' ? 'iso' : key;
      view.innerHTML = renderCompliance(fw);
      bindComplianceEvents(view, rerender);
      break;
    }

    case 'audit':
      view.innerHTML = renderAudit();
      bindAuditEvents(view, rerender, openItem);
      break;

    case 'documents':
      view.innerHTML = renderDocuments();
      bindDocumentEvents(view, rerender);
      break;

    case 'inspection':
      view.innerHTML = renderInspection();
      bindInspectionEvents(view, rerender, openItem);
      break;

    case 'capa':
      view.innerHTML = renderCapa();
      bindCapaEvents(view, rerender);
      break;

    case 'evidence':
      view.innerHTML = renderEvidence();
      bindEvidenceEvents(view, rerender);
      break;

    case 'org':
      view.innerHTML = renderOrg();
      bindOrgEvents(view, rerender);
      break;

    case 'memo':
      view.innerHTML = renderMemo();
      bindMemoEvents(view, rerender);
      break;

    case 'settings':
      view.innerHTML = renderSettings();
      bindSettingsEvents(view, rerender);
      break;

    case 'backup':
      view.innerHTML = renderBackup();
      bindBackupEvents(view);
      break;

    case 'restore':
      view.innerHTML = renderRestore();
      bindRestoreEvents(view, rerender);
      break;
  }
  // 같은 화면 안에서의 재렌더는 스크롤 위치를 유지하고, 화면이 바뀌면 최상단으로 이동
  window.scrollTo(0, key === renderedKey ? scrollY : 0);
  renderedKey = key;
}
let renderedKey = null;

/* ---------------- 부트스트랩 ---------------- */
let lastKey = null;
window.addEventListener('hashchange', () => {
  const k = currentView();
  if (k !== lastKey) resetFilter();
  lastKey = k;
  route();
});

async function boot() {
  if (!state.user) { renderLogin(); return; }
  renderShell();
  showSpinner('자료를 불러오는 중…');
  await loadAll();
  scheduleDailyAutoBackup();
  hideSpinner();
  lastKey = currentView();
  route();
}

(async function main() {
  document.title = `${APP.name} | ${APP.org}`;
  await initSupabase();
  if (sessionStorage.getItem(GUEST_SESSION_KEY) === '1') {
    state.user = { ...GUEST_USER };
  } else {
    await restoreSession();
  }

  onChange(() => { if (state.user && $('#navRoot')) renderNav(); });
  await boot();
})();
