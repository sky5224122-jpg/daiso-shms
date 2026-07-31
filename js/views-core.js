/* ============================================================
   views-core.js — 대시보드 / 법령·ISO 이행관리 화면 / 수기 작성 드로어
   ============================================================ */

import {
  MSSA_ITEMS, OSHA_ITEMS, ISO_ITEMS, ALL_ITEMS, FRAMEWORKS,
  STATUS, STATUS_ORDER, CYCLES, DOC_MASTER
} from './data/frameworks.js?v=20260731_pw';
import {
  $, $$, el, esc, state, getRecord, saveRecord, progressOf, dueSoon, docStats,
  canEdit, halfLabel, fmtDate, toast
} from './core.js?v=20260731_pw';

/* ---------------- 공용 조각 ---------------- */

export function kpi({ title, value, unit, desc, tone = '', pct }) {
  return `
    <div class="kpi ${tone}">
      <div class="t">${esc(title)}</div>
      <div class="v">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ''}</div>
      ${pct !== undefined ? `<div class="bar ${pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad'}" style="margin-top:12px"><i style="width:${Math.max(2, pct)}%"></i></div>` : ''}
      ${desc ? `<div class="d">${desc}</div>` : ''}
    </div>`;
}

export function statusBadge(key) {
  const s = STATUS[key] || STATUS.none;
  return `<span class="st ${s.cls}">${s.label}</span>`;
}

/** ISO 45001 조항별(4~10) 레이더 차트 */
function radarSVG(axes) {
  const size = 300, cx = size / 2, cy = size / 2, R = 108;
  const n = axes.length;
  const pt = (i, r) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  };
  const rings = [25, 50, 75, 100].map(p => {
    const d = axes.map((_, i) => pt(i, R * p / 100).join(',')).join(' ');
    return `<polygon points="${d}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`;
  }).join('');
  const spokes = axes.map((_, i) => {
    const [x, y] = pt(i, R);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
  }).join('');
  const poly = axes.map((a, i) => pt(i, R * Math.max(a.pct, 2) / 100).join(',')).join(' ');
  const dots = axes.map((a, i) => {
    const [x, y] = pt(i, R * Math.max(a.pct, 2) / 100);
    return `<circle cx="${x}" cy="${y}" r="3.5" fill="#1e3c72" stroke="#fff" stroke-width="1.5"/>`;
  }).join('');
  const labels = axes.map((a, i) => {
    const [x, y] = pt(i, R + 22);
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle"
              font-size="11" font-weight="800" fill="#475467">${esc(a.short)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="100%" style="max-width:330px;display:block;margin:0 auto">
    ${rings}${spokes}
    <polygon points="${poly}" fill="rgba(30,60,114,.18)" stroke="#1e3c72" stroke-width="2" stroke-linejoin="round"/>
    ${dots}${labels}
  </svg>`;
}

/* ---------------- 대시보드 ---------------- */

export function renderDashboard() {
  const half = state.half;
  const all  = progressOf(ALL_ITEMS, half);
  const mssa = progressOf(MSSA_ITEMS, half);
  const osha = progressOf(OSHA_ITEMS, half);
  const iso  = progressOf(ISO_ITEMS, half);
  const docs = docStats();

  // ISO 조항 4~10 축
  const axes = ['4','5','6','7','8','9','10'].map(c => {
    const items = ISO_ITEMS.filter(i => i.group.startsWith(c + '.'));
    const p = progressOf(items, half);
    return { short: `${c}장`, label: items[0]?.group || `${c}장`, pct: p.pct, n: items.length };
  });

  const critical = ALL_ITEMS
    .filter(i => i.severity === 'critical')
    .map(i => ({ i, r: getRecord(i.id, half) }))
    .filter(({ r }) => ['none', 'hold'].includes(r.status));

  const due = dueSoon(30, half);
  const openCapa = state.capa.filter(c => c.status !== 'closed');
  const recent = ALL_ITEMS
    .map(i => ({ i, r: getRecord(i.id, half) }))
    .filter(({ r }) => r.updated_at)
    .sort((a, b) => String(b.r.updated_at).localeCompare(String(a.r.updated_at)))
    .slice(0, 8);

  const halfCycleItems = ALL_ITEMS.filter(i => i.cycle === '반기 1회');
  const halfDone = halfCycleItems.filter(i => getRecord(i.id, half).status === 'done').length;

  return `
  <div class="banner">
    <div class="i">🏛️</div>
    <div><b>${esc(halfLabel(half))} 이행 현황</b> — 중대재해처벌법 시행령 제4조·제5조, 산업안전보건법, ISO 45001:2018 요구사항을
    한 화면에서 관리합니다. 각 조항 카드를 클릭하면 <b>이행 현황·담당자·증빙을 직접 작성</b>할 수 있고, 작성 즉시 이행률에 반영됩니다.</div>
  </div>

  <div class="grid g4">
    ${kpi({ title:'⚖️ 종합 이행률', value:all.pct, unit:'%', tone:'', pct:all.pct,
            desc:`평가대상 ${all.evaluated}개 / 전체 ${all.total}개 조항` })}
    ${kpi({ title:'🔴 중대재해처벌법', value:mssa.pct, unit:'%', tone:'red', pct:mssa.pct,
            desc:`시행령 제4조·제5조 ${mssa.total}개 의무` })}
    ${kpi({ title:'📘 산업안전보건법', value:osha.pct, unit:'%', tone:'blue', pct:osha.pct,
            desc:`주요 의무조항 ${osha.total}개` })}
    ${kpi({ title:'🌐 ISO 45001 적합률', value:iso.pct, unit:'%', tone:'green', pct:iso.pct,
            desc:`4~10장 ${iso.total}개 요구사항` })}
  </div>

  <div class="grid g4" style="margin-top:14px">
    ${kpi({ title:'📁 문서체계 구축률', value:docs.pct, unit:'%', tone:'green', pct:docs.pct,
            desc:`제정 완료 ${docs.approved}건 / 전체 ${docs.total}건` })}
    ${kpi({ title:'🗓️ 반기 법정점검 완료', value:halfDone, unit:`/${halfCycleItems.length}`, tone:'orange',
            pct: halfCycleItems.length ? Math.round(halfDone / halfCycleItems.length * 100) : 0,
            desc:'반기 1회 이상 점검 의무 조항' })}
    ${kpi({ title:'🚨 중대 미이행·보완', value:critical.length, unit:'건', tone:'red',
            desc: critical.length ? '즉시 조치가 필요한 핵심 의무' : '중대 의무 미이행 없음' })}
    ${kpi({ title:'🔧 진행중 개선조치(CAPA)', value:openCapa.length, unit:'건', tone:'orange',
            desc:`전체 등록 ${state.capa.length}건` })}
  </div>

  <div class="sec-t"><h2>ISO 45001 조항별 이행 수준</h2><div class="l"></div>
    <span class="n">심사 대응 레이더 · 조항 4~10장</span></div>
  <div class="card"><div class="card-body">
    <div class="radar-wrap">
      <div>${radarSVG(axes)}</div>
      <div class="radar-legend">
        ${axes.map(a => `
          <div class="r">
            <span class="k" style="background:${a.pct >= 80 ? '#0f9d76' : a.pct >= 50 ? '#e8930c' : '#d92d20'}"></span>
            <span>${esc(a.label)}<span style="color:var(--faint);font-weight:700"> (${a.n})</span></span>
            <span class="p">${a.pct}%</span>
          </div>`).join('')}
      </div>
    </div>
  </div></div>

  <div class="grid g2" style="margin-top:20px">
    <div class="card">
      <div class="card-head"><h3>중대재해처벌법 시행령 제4조 · 9대 의무</h3><div class="grow"></div>
        <button class="btn sm" data-goto="mssa">전체 보기</button></div>
      <div class="card-body" style="padding:10px 18px 18px">
        ${MSSA_ITEMS.filter(i => i.code.startsWith('영 제4조')).map(i => {
          const r = getRecord(i.id, half);
          const s = STATUS[r.status] || STATUS.none;
          const p = s.score ?? 0;
          return `
          <div style="display:grid;grid-template-columns:64px minmax(0,1fr) 74px;gap:11px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line)">
            <span class="tag law">${esc(i.code.replace('영 제4조 ', '제4조 '))}</span>
            <div style="min-width:0">
              <div style="font-size:12.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(i.title)}</div>
              <div class="bar ${p >= 80 ? 'ok' : p >= 50 ? 'warn' : 'bad'}" style="margin-top:5px"><i style="width:${Math.max(2, p)}%"></i></div>
            </div>
            ${statusBadge(r.status)}
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>즉시 조치 필요 항목</h3><div class="grow"></div>
        <span class="sub">중대 의무 미이행·보완 ${critical.length}건 / 기한 임박 ${due.length}건</span></div>
      <div class="card-body" style="padding:10px 18px 18px;max-height:420px;overflow-y:auto">
        ${critical.length === 0 && due.length === 0
          ? `<div class="empty"><div class="e">✅</div><div class="t">즉시 조치가 필요한 항목이 없습니다</div>
               <div class="s">핵심 의무 조항이 모두 이행 상태로 관리되고 있습니다.</div></div>`
          : critical.slice(0, 6).map(({ i, r }) => `
              <div class="item ${STATUS[r.status].itemCls} f-${i.framework}" data-item="${esc(i.id)}" style="margin-bottom:8px;padding:11px 13px;cursor:pointer">
                <div class="item-top">
                  <span class="item-code">${esc(i.code)}</span>
                  <span class="item-title" style="font-size:12.8px">${esc(i.title)}</span>
                  ${statusBadge(r.status)}
                </div>
              </div>`).join('')
            + due.slice(0, 5).map(({ it, r }) => `
              <div class="item s-hold f-${it.framework}" data-item="${esc(it.id)}" style="margin-bottom:8px;padding:11px 13px;cursor:pointer">
                <div class="item-top">
                  <span class="item-code">${esc(it.code)}</span>
                  <span class="item-title" style="font-size:12.8px">${esc(it.title)}</span>
                  <span class="tag" style="border-color:rgba(232,147,12,.4);color:#b45309;background:#fdf5e6">기한 ${fmtDate(r.due_date)}</span>
                </div>
              </div>`).join('')}
      </div>
    </div>
  </div>

  <div class="grid g2" style="margin-top:20px">
    <div class="card">
      <div class="card-head"><h3>반기 1회 이상 법정 점검 의무</h3><div class="grow"></div>
        <span class="sub">중처법 시행령 제4조 3·5·7·8·9호 및 제5조</span></div>
      <div class="tbl-wrap" style="border:0;border-radius:0">
        <table class="tbl" style="min-width:0">
          <thead><tr><th style="width:110px">근거</th><th>점검 의무</th><th style="width:110px">최근 점검일</th><th style="width:92px">상태</th></tr></thead>
          <tbody>
            ${halfCycleItems.slice(0, 12).map(i => {
              const r = getRecord(i.id, half);
              return `<tr data-item="${esc(i.id)}" style="cursor:pointer">
                <td><span class="tag ${i.framework === 'mssa' ? 'law' : i.framework === 'iso' ? 'iso' : ''}">${esc(i.code)}</span></td>
                <td class="cell-title" style="font-weight:700">${esc(i.title)}</td>
                <td>${r.last_checked ? fmtDate(r.last_checked) : '<span style="color:var(--faint)">미기록</span>'}</td>
                <td>${statusBadge(r.status)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>최근 작성·갱신 이력</h3><div class="grow"></div><span class="sub">최근 8건</span></div>
      <div class="card-body">
        ${recent.length === 0
          ? `<div class="empty"><div class="e">📝</div><div class="t">아직 작성된 이행 기록이 없습니다</div>
               <div class="s">좌측 메뉴의 법령 화면에서 조항을 선택해 이행 내용을 작성해 주세요.</div></div>`
          : `<div class="tl">${recent.map(({ i, r }) => `
              <div class="tl-item ${r.status === 'done' ? 'ok' : r.status === 'hold' ? 'warn' : ''}">
                <div class="d">${esc(String(r.updated_at).slice(0, 16).replace('T', ' '))} · ${esc(r.updated_by || '')}</div>
                <div class="t">${esc(i.code)} ${esc(i.title)}</div>
                <div class="c">${statusBadge(r.status)}${r.owner ? ` 담당 ${esc(r.owner)}` : ''}</div>
              </div>`).join('')}</div>`}
      </div>
    </div>
  </div>`;
}

/* ---------------- 법령/ISO 이행관리 목록 ---------------- */

const listFilter = { q: '', status: 'all', group: 'all' };

export function renderCompliance(fw) {
  const F = FRAMEWORKS[fw];
  const items = F.items;
  const half = state.half;
  const p = progressOf(items, half);
  const groups = [...new Set(items.map(i => i.group))];

  const filtered = items.filter(i => {
    const r = getRecord(i.id, half);
    if (listFilter.status !== 'all' && (r.status || 'none') !== listFilter.status) return false;
    if (listFilter.group !== 'all' && i.group !== listFilter.group) return false;
    if (listFilter.q) {
      const q = listFilter.q.toLowerCase();
      if (!(`${i.code} ${i.title} ${i.requirement} ${r.implementation || ''}`).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const byGroup = groups
    .map(g => ({ g, list: filtered.filter(i => i.group === g) }))
    .filter(x => x.list.length);

  return `
  <div class="banner">
    <div class="i">${F.icon}</div>
    <div><b>${esc(F.label)}</b> 이행 관리 — 조항 카드를 클릭하면 오른쪽에 작성 패널이 열립니다.
    <b>이행 현황·담당자·증빙자료·미흡사항</b>을 직접 입력해 주세요. 입력한 내용은 그대로 심사 증빙으로 출력됩니다.</div>
  </div>

  <div class="grid g4" style="margin-bottom:18px">
    ${kpi({ title:'이행률', value:p.pct, unit:'%', pct:p.pct, desc:`${esc(halfLabel(half))} 기준` })}
    ${kpi({ title:'이행완료', value:p.counts.done, unit:'건', tone:'green', desc:`전체 ${p.total}개 조항 중` })}
    ${kpi({ title:'이행중 · 보완필요', value:p.counts.progress + p.counts.hold, unit:'건', tone:'orange', desc:`이행중 ${p.counts.progress} · 보완 ${p.counts.hold}` })}
    ${kpi({ title:'미이행', value:p.counts.none, unit:'건', tone:'red', desc: p.counts.na ? `해당없음 ${p.counts.na}건 제외` : '작성이 필요한 조항' })}
  </div>

  <div class="toolbar">
    <div class="search"><input id="cQ" placeholder="조항·제목·이행내용 검색" value="${esc(listFilter.q)}"></div>
    <select class="inp" id="cGroup" style="width:auto;min-width:190px">
      <option value="all">전체 구분</option>
      ${groups.map(g => `<option value="${esc(g)}" ${listFilter.group === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
    </select>
    <div class="seg" id="cStatus">
      <button data-s="all" class="${listFilter.status === 'all' ? 'active' : ''}">전체</button>
      ${STATUS_ORDER.map(s => `<button data-s="${s}" class="${listFilter.status === s ? 'active' : ''}">${STATUS[s].label}</button>`).join('')}
    </div>
    <div style="flex:1"></div>
    <button class="btn" id="cPrint">🖨️ 이행현황 인쇄</button>
  </div>

  ${byGroup.length === 0
    ? `<div class="card"><div class="empty"><div class="e">🔍</div><div class="t">조건에 맞는 조항이 없습니다</div>
         <div class="s">검색어나 필터를 변경해 보세요.</div></div></div>`
    : byGroup.map(({ g, list }) => `
      <div class="sec-t"><h2>${esc(g)}</h2><div class="l"></div><span class="n">${list.length}개 조항</span></div>
      <div class="item-list">
        ${list.map(i => itemCard(i, half)).join('')}
      </div>`).join('')}`;
}

function itemCard(i, half) {
  const r = getRecord(i.id, half);
  const s = STATUS[r.status] || STATUS.none;
  const linkedDocs = (i.docRefs || []).map(no => DOC_MASTER.find(d => d.docNo === no)).filter(Boolean);
  return `
  <div class="item ${s.itemCls} f-${i.framework}" data-item="${esc(i.id)}">
    <div class="item-top">
      <span class="item-code">${esc(i.code)}</span>
      <span class="item-title">${esc(i.title)}</span>
      ${i.severity === 'critical' ? '<span class="tag law">핵심</span>' : ''}
      ${statusBadge(r.status)}
    </div>
    <div class="item-req">${esc(i.requirement)}</div>
    <div class="item-note ${r.implementation ? '' : 'empty'}">${
      r.implementation ? esc(r.implementation) : '이행 현황이 아직 작성되지 않았습니다. 카드를 클릭해 작성하세요.'}</div>
    <div class="item-meta">
      <span><b>점검주기</b> ${esc(i.cycle)}</span>
      <span><b>담당</b> ${r.owner ? esc(r.owner) : '미지정'}</span>
      <span><b>최근점검</b> ${r.last_checked ? fmtDate(r.last_checked) : '미기록'}</span>
      <span><b>기한</b> ${r.due_date ? fmtDate(r.due_date) : '미설정'}</span>
      ${linkedDocs.length ? `<span><b>관련문서</b> ${linkedDocs.map(d => `<span class="tag doc">${esc(d.docNo)}</span>`).join(' ')}</span>` : ''}
      ${(i.isoRefs || []).length ? `<span><b>ISO</b> ${i.isoRefs.map(c => `<span class="tag iso">${esc(c)}</span>`).join(' ')}</span>` : ''}
    </div>
  </div>`;
}

/* ---------------- 수기 작성 드로어 ---------------- */

let drawerEls = null;
function ensureDrawer() {
  if (drawerEls) return drawerEls;
  const mask = el('div', { class: 'drawer-mask', id: 'drawerMask' });
  const drawer = el('div', { class: 'drawer', id: 'drawer' });
  drawer.innerHTML = `
    <div class="drawer-head" style="position:relative">
      <button class="x" id="drawerX" title="닫기">✕</button>
      <div class="code" id="dCode"></div>
      <h3 id="dTitle"></h3>
    </div>
    <div class="drawer-body" id="dBody"></div>
    <div class="drawer-foot">
      <button class="btn ghost" id="dCancel">닫기</button>
      <button class="btn primary" id="dSave">저장</button>
    </div>`;
  document.body.append(mask, drawer);
  mask.addEventListener('click', closeDrawer);
  drawer.querySelector('#drawerX').addEventListener('click', closeDrawer);
  drawer.querySelector('#dCancel').addEventListener('click', closeDrawer);
  drawerEls = { mask, drawer };
  return drawerEls;
}

export function closeDrawer() {
  if (!drawerEls) return;
  drawerEls.mask.classList.remove('open');
  drawerEls.drawer.classList.remove('open');
}

/**
 * 범용 작성 패널
 * @param {{code:string,title:string,body:string,saveLabel?:string,editable?:boolean,
 *          onSave?:(root:HTMLElement)=>Promise<any>|any, onOpen?:(root:HTMLElement)=>void}} opt
 */
export function openDrawer(opt) {
  const { mask, drawer } = ensureDrawer();
  drawer.querySelector('#dCode').textContent = opt.code || '';
  drawer.querySelector('#dTitle').textContent = opt.title || '';
  const body = drawer.querySelector('#dBody');
  body.innerHTML = opt.body || '';
  const saveBtn = drawer.querySelector('#dSave');
  const editable = opt.editable !== false;
  saveBtn.style.display = opt.onSave ? '' : 'none';
  saveBtn.disabled = !editable;
  saveBtn.textContent = editable ? (opt.saveLabel || '저장') : '읽기 전용';
  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try { await opt.onSave(body); } finally { saveBtn.disabled = false; }
  };
  opt.onOpen && opt.onOpen(body);
  mask.classList.add('open');
  drawer.classList.add('open');
}

export function openItemDrawer(itemId, onSaved) {
  const item = ALL_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  const { mask, drawer } = ensureDrawer();
  const half = state.half;
  const r = getRecord(itemId, half);
  const editable = canEdit();

  drawer.querySelector('#dCode').textContent = `${item.code} · ${halfLabel(half)}`;
  drawer.querySelector('#dTitle').textContent = item.title;

  const linkedDocs = (item.docRefs || []).map(no => DOC_MASTER.find(d => d.docNo === no)).filter(Boolean);

  drawer.querySelector('#dBody').innerHTML = `
    <div class="ref-box">
      <div class="t">📜 조문 (요지)</div>
      <div class="c">${esc(item.clause)}</div>
    </div>
    <div class="ref-box">
      <div class="t">✅ 이행해야 할 내용</div>
      <div class="c">${esc(item.requirement)}</div>
      <div class="chip-row">
        <span class="tag">점검주기 ${esc(item.cycle)}</span>
        ${(item.isoRefs || []).map(c => `<span class="tag iso">ISO ${esc(c)}</span>`).join('')}
        ${(item.lawRefs || []).map(c => `<span class="tag law">${esc(c)}</span>`).join('')}
        ${linkedDocs.map(d => `<span class="tag doc">${esc(d.docNo)} ${esc(d.title)}</span>`).join('')}
      </div>
      ${item.linkedApp ? `<div style="margin-top:10px"><a class="btn sm" href="${esc(item.linkedApp.url)}" target="_blank" rel="noopener">🔗 ${esc(item.linkedApp.label)} 열기</a></div>` : ''}
    </div>
    <div class="ref-box">
      <div class="t">📎 권장 증빙자료 (심사 시 제시 항목)</div>
      <div class="c">${(item.evidence || []).map((e, n) => `${n + 1}. ${esc(e)}`).join('\n')}</div>
    </div>

    <div class="sec-t" style="margin-top:22px"><h2 style="font-size:14px">이행 내용 작성</h2><div class="l"></div></div>

    <div class="fld-row">
      <div class="fld">
        <label>이행 상태</label>
        <select class="inp" id="fStatus" ${editable ? '' : 'disabled'}>
          ${STATUS_ORDER.map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${STATUS[s].label}</option>`).join('')}
        </select>
      </div>
      <div class="fld">
        <label>담당자 / 담당부서</label>
        <input class="inp" id="fOwner" value="${esc(r.owner)}" placeholder="예) 안전보건팀 강동현" ${editable ? '' : 'disabled'}>
      </div>
    </div>
    <div class="fld-row">
      <div class="fld">
        <label>최근 점검·실시일</label>
        <input class="inp" type="date" id="fChecked" value="${esc(r.last_checked)}" ${editable ? '' : 'disabled'}>
      </div>
      <div class="fld">
        <label>다음 이행 기한</label>
        <input class="inp" type="date" id="fDue" value="${esc(r.due_date)}" ${editable ? '' : 'disabled'}>
      </div>
    </div>

    <div class="fld">
      <label>① 이행 현황 (무엇을 · 언제 · 누가 · 어떻게 했는지)</label>
      <textarea class="inp" id="fImpl" style="min-height:150px" placeholder="예) 2026.07.15 경영책임자 명의 안전보건 경영방침을 제정하고 전 매장 376개소 게시 완료. 연간 목표는 재해율 0.15% 이하, 위험성평가 실시율 100%로 설정하여 이사회 승인(2026.02.20)을 받음." ${editable ? '' : 'disabled'}>${esc(r.implementation)}</textarea>
      <div class="help">심사원이 읽고 바로 이해할 수 있도록 <b>날짜·주체·수량</b>을 포함해 구체적으로 작성하세요.</div>
    </div>

    <div class="fld">
      <label>② 보유 증빙자료 (문서명 · 보관 위치)</label>
      <textarea class="inp" id="fEvi" placeholder="예)&#10;1. 안전보건 경영방침 선언문(대표이사 서명본) — 안전보건팀 문서고 / SHP-02 첨부&#10;2. 매장 게시 사진 376건 — 이행증빙 자료함&#10;3. 이사회 의사록(2026.02.20) — 경영지원팀" ${editable ? '' : 'disabled'}>${esc(r.evidence)}</textarea>
    </div>

    <div class="fld">
      <label>③ 미흡사항 / 개선 필요사항</label>
      <textarea class="inp" id="fFind" style="min-height:80px" placeholder="점검 결과 확인된 부족한 부분과 보완 계획을 기재합니다. (없으면 '해당없음')" ${editable ? '' : 'disabled'}>${esc(r.findings)}</textarea>
      <div class="help">여기에 기재한 미흡사항은 <b>개선조치(CAPA)</b> 화면에서 별도 등록해 종결까지 관리하는 것을 권장합니다.</div>
    </div>

    ${r.updated_at ? `<div style="font-size:11.5px;color:var(--muted);border-top:1px dashed var(--line-strong);padding-top:12px">
      최종 수정 ${esc(String(r.updated_at).slice(0, 16).replace('T', ' '))} · ${esc(r.updated_by || '')}</div>` : ''}
  `;

  const saveBtn = drawer.querySelector('#dSave');
  saveBtn.style.display = '';
  saveBtn.disabled = !editable;
  saveBtn.textContent = editable ? '저장' : '읽기 전용';
  saveBtn.onclick = async () => {
    const patch = {
      status:        drawer.querySelector('#fStatus').value,
      owner:         drawer.querySelector('#fOwner').value.trim(),
      last_checked:  drawer.querySelector('#fChecked').value,
      due_date:      drawer.querySelector('#fDue').value,
      implementation:drawer.querySelector('#fImpl').value.trim(),
      evidence:      drawer.querySelector('#fEvi').value.trim(),
      findings:      drawer.querySelector('#fFind').value.trim()
    };
    saveBtn.disabled = true;
    const res = await saveRecord(itemId, patch, half);
    saveBtn.disabled = false;
    toast(res.ok ? (res.local ? '저장했습니다 (로컬 저장)' : '저장했습니다 (Supabase 동기화 완료)') : `로컬 저장됨 · 동기화 실패: ${res.error}`,
          res.ok ? 'ok' : 'bad');
    closeDrawer();
    onSaved && onSaved();
  };

  mask.classList.add('open');
  drawer.classList.add('open');
}

/* ---------------- 목록 화면 이벤트 바인딩 ---------------- */

export function bindComplianceEvents(root, rerender) {
  const q = $('#cQ', root);
  if (q) {
    q.addEventListener('input', e => {
      listFilter.q = e.target.value;
      const pos = e.target.selectionStart;
      rerender();
      const nq = $('#cQ');
      if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
    });
  }
  const g = $('#cGroup', root);
  if (g) g.addEventListener('change', e => { listFilter.group = e.target.value; rerender(); });

  const seg = $('#cStatus', root);
  if (seg) seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    listFilter.status = b.dataset.s; rerender();
  });

  const pr = $('#cPrint', root);
  if (pr) pr.addEventListener('click', () => window.print());

  root.addEventListener('click', e => {
    const card = e.target.closest('[data-item]');
    if (card && !e.target.closest('a')) openItemDrawer(card.dataset.item, rerender);
  });
}

export function resetFilter() { listFilter.q = ''; listFilter.status = 'all'; listFilter.group = 'all'; }
