/* ============================================================
   views-ext.js — 문서체계 / 이행점검 / 개선조치(CAPA) / 증빙자료함 /
                  조직·선임 / ISO 심사대응 / 설정
   ============================================================ */

import {
  ALL_ITEMS, MSSA_ITEMS, OSHA_ITEMS, ISO_ITEMS, FRAMEWORKS,
  DOC_TYPES, DOC_STATUS, DOC_BODY_TEMPLATE, DOC_MASTER, STATUS, ROLES
} from './data/frameworks.js?v=20260903_stat';
import {
  $, $$, esc, state, getRecord, saveDocument, saveRow, deleteRow, canEdit, canDelete,
  halfLabel, fmtDate, today, toast, docStats, progressOf, uid,
  getSupabaseConfig, setSupabaseConfig, conn, APP,
  getBackups, restoreBackup, deleteBackup,
  showSpinner, hideSpinner, attachmentStorageMode, getAttachmentStorageUsage, getAuditLog, formatBytes
} from './core.js?v=20260903_stat';
import { openDrawer, closeDrawer, kpi, statusBadge, attachmentPanelHtml, createAttachmentManager } from './views-core.js?v=20260903_stat';

const confirmDel = msg => window.confirm(msg);

/* ============================================================
   1. 문서체계 (매뉴얼 / 절차서 / 지침서 / 양식)
   ============================================================ */

const docFilter = { type: 'all', q: '' };

export function renderDocuments() {
  const s = docStats();
  const docs = state.documents
    .filter(d => docFilter.type === 'all' || d.type === docFilter.type)
    .filter(d => !docFilter.q ||
      `${d.doc_no} ${d.title} ${d.category} ${d.purpose}`.toLowerCase().includes(docFilter.q.toLowerCase()))
    .sort((a, b) => a.doc_no.localeCompare(b.doc_no));

  const cats = [...new Set(docs.map(d => d.category))];

  return `
  <div class="banner">
    <div class="i">📁</div>
    <div><b>안전보건 문서체계</b> — 매뉴얼(1단계) → 절차서(2단계) → 지침서(3단계) → 양식·기록(4단계)의 4단계 구조입니다.
    문서를 클릭하면 <b>목적·적용범위·본문을 직접 작성</b>하고 제·개정 이력을 남길 수 있습니다.
    ISO 45001 심사에서는 이 계층구조와 개정이력이 핵심 확인 대상입니다.</div>
  </div>

  <div class="grid g4" style="margin-bottom:18px">
    ${kpi({ title:'📁 전체 문서', value:s.total, unit:'건', desc:'마스터에 등록된 안전보건 문서' })}
    ${kpi({ title:'✅ 제정·승인 완료', value:s.approved, unit:'건', tone:'green', pct:s.pct, desc:`구축률 ${s.pct}%` })}
    ${kpi({ title:'📝 작성 필요', value:s.total - s.approved, unit:'건', tone:'orange', desc:'초안·검토중 상태 문서' })}
    ${kpi({ title:'📐 절차서', value:(s.by.procedure?.approved ?? 0), unit:`/${s.by.procedure?.total ?? 0}`, tone:'blue', desc:'ISO 45001 필수 프로세스 문서' })}
  </div>

  <div class="doc-layout">
    <div class="doc-tree">
      <div class="doc-tree-sec">
        <div class="h">문서 단계</div>
        <button data-dtype="all" class="${docFilter.type === 'all' ? 'active' : ''}">
          <span>전체 문서</span><span class="n">${state.documents.length}</span></button>
        ${Object.values(DOC_TYPES).map(t => {
          const n = state.documents.filter(d => d.type === t.key).length;
          return `<button data-dtype="${t.key}" class="${docFilter.type === t.key ? 'active' : ''}">
            <span>${esc(t.prefix)} · ${esc(t.label)}</span><span class="n">${n}</span></button>`;
        }).join('')}
      </div>
      <div class="doc-tree-sec">
        <div class="h">단계별 정의</div>
        ${Object.values(DOC_TYPES).map(t => `
          <div style="font-size:11px;color:var(--muted);line-height:1.6;padding:5px 7px">
            <b style="color:var(--text-2)">${esc(t.label)}</b> — ${esc(t.desc)}</div>`).join('')}
      </div>
      ${canEdit() ? `<button class="btn primary" id="docNew" style="width:100%;margin-top:8px">＋ 문서 추가</button>` : ''}
    </div>

    <div>
      <div class="toolbar">
        <div class="search"><input id="docQ" placeholder="문서번호·제목·목적 검색" value="${esc(docFilter.q)}"></div>
        <div style="flex:1"></div>
        <button class="btn" id="docPrint">🖨️ 문서목록 인쇄</button>
      </div>
      ${cats.length === 0
        ? `<div class="card"><div class="empty"><div class="e">🔍</div><div class="t">문서가 없습니다</div></div></div>`
        : cats.map(c => `
          <div class="sec-t"><h2>${esc(c)}</h2><div class="l"></div>
            <span class="n">${docs.filter(d => d.category === c).length}건</span></div>
          <div class="grid g2">
            ${docs.filter(d => d.category === c).map(docCard).join('')}
          </div>`).join('')}
    </div>
  </div>`;
}

function docCard(d) {
  const st = DOC_STATUS[d.status] || DOC_STATUS.draft;
  const t = DOC_TYPES[d.type];
  return `
  <div class="doc-card" data-doc="${esc(d.id)}">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span class="doc-no">${esc(d.doc_no)}</span>
      <span class="tag">${esc(t?.label || d.type)}</span>
      <div style="flex:1"></div>
      <span class="st ${st.cls}">${st.label}</span>
      ${canDelete() ? `<button class="btn sm" data-del-doc="${esc(d.id)}">삭제</button>` : ''}
    </div>
    <h4>${esc(d.title)}</h4>
    <div style="font-size:11.8px;color:var(--text-2);line-height:1.65;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(d.purpose || '목적이 작성되지 않았습니다.')}</div>
    <div class="m">
      <span>Rev. ${esc(d.version || '—')}</span>
      <span>제정 ${d.issued_date ? fmtDate(d.issued_date) : '—'}</span>
      <span>작성자 ${esc(d.owner || '—')}</span>
      ${d.body ? '<span style="color:var(--ok);font-weight:800">본문 작성됨</span>' : '<span style="color:var(--faint)">본문 미작성</span>'}
    </div>
  </div>`;
}

function openDocDrawer(docId, rerender) {
  const d = state.documents.find(x => x.id === docId);
  if (!d) return;
  const editable = canEdit();
  const isoTitles = (d.iso_refs || []).map(c => {
    const it = ISO_ITEMS.find(i => i.code === c || i.code.split('~')[0] === c);
    return it ? `${c} ${it.title}` : c;
  });
  const lawTitles = (d.law_refs || []).map(id => {
    const it = ALL_ITEMS.find(i => i.id === id);
    return it ? `${it.code} ${it.title}` : id;
  });
  let attachmentManager;

  openDrawer({
    code: `${d.doc_no} · ${DOC_TYPES[d.type]?.label || d.type}`,
    title: d.title,
    editable,
    body: `
      ${(isoTitles.length || lawTitles.length) ? `
      <div class="ref-box">
        <div class="t">🔗 연계 요구사항</div>
        <div class="chip-row" style="margin-top:0">
          ${isoTitles.map(t => `<span class="tag iso">ISO ${esc(t)}</span>`).join('')}
          ${lawTitles.map(t => `<span class="tag law">${esc(t)}</span>`).join('')}
        </div>
      </div>` : ''}

      <div class="fld-row">
        <div class="fld"><label>문서번호</label>
          <input class="inp" id="gNo" value="${esc(d.doc_no)}" ${editable ? '' : 'disabled'}></div>
        <div class="fld"><label>문서 단계</label>
          <select class="inp" id="gType" ${editable ? '' : 'disabled'}>
            ${Object.values(DOC_TYPES).map(t => `<option value="${t.key}" ${d.type === t.key ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select></div>
      </div>
      <div class="fld"><label>문서명</label>
        <input class="inp" id="gTitle" value="${esc(d.title)}" ${editable ? '' : 'disabled'}></div>
      <div class="fld-row">
        <div class="fld"><label>분류</label>
          <input class="inp" id="gCat" value="${esc(d.category || '')}" ${editable ? '' : 'disabled'}></div>
        <div class="fld"><label>개정 차수(Rev.)</label>
          <input class="inp" id="gVer" value="${esc(d.version || '')}" placeholder="예) 1.0" ${editable ? '' : 'disabled'}></div>
      </div>
      <div class="fld-row">
        <div class="fld"><label>문서 상태</label>
          <select class="inp" id="gStatus" ${editable ? '' : 'disabled'}>
            ${Object.entries(DOC_STATUS).map(([k, v]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select></div>
        <div class="fld"><label>작성자 / 주관부서</label>
          <input class="inp" id="gOwner" value="${esc(d.owner || '')}" ${editable ? '' : 'disabled'}></div>
      </div>
      <div class="fld-row">
        <div class="fld"><label>승인자</label>
          <input class="inp" id="gApprover" value="${esc(d.approver || '')}" placeholder="예) 대표이사 / 안전보건팀장" ${editable ? '' : 'disabled'}></div>
        <div class="fld"><label>제정일</label>
          <input class="inp" type="date" id="gIssued" value="${esc(d.issued_date || '')}" ${editable ? '' : 'disabled'}></div>
      </div>
      <div class="fld-row">
        <div class="fld"><label>최근 개정일</label>
          <input class="inp" type="date" id="gRevised" value="${esc(d.revised_date || '')}" ${editable ? '' : 'disabled'}></div>
        <div class="fld"><label>차기 검토 예정일</label>
          <input class="inp" type="date" id="gReview" value="${esc(d.next_review || '')}" ${editable ? '' : 'disabled'}></div>
      </div>

      <div class="fld"><label>목 적</label>
        <textarea class="inp" id="gPurpose" style="min-height:70px" ${editable ? '' : 'disabled'}>${esc(d.purpose || '')}</textarea></div>
      <div class="fld"><label>적용 범위</label>
        <textarea class="inp" id="gScope" style="min-height:60px" placeholder="예) 본사, 물류센터, 전국 직영매장 전체에 적용한다." ${editable ? '' : 'disabled'}>${esc(d.scope || '')}</textarea></div>

      <div class="fld">
        <label>본 문 (수기 작성)</label>
        ${editable ? `<button class="btn sm" id="gTpl" style="margin-bottom:7px">📋 표준 목차 불러오기</button>` : ''}
        <textarea class="inp" id="gBody" style="min-height:340px;font-size:12.5px" placeholder="절차서·지침서 본문을 직접 작성하세요." ${editable ? '' : 'disabled'}>${esc(d.body || '')}</textarea>
        <div class="help">표준 목차: 1.목적 → 2.적용범위 → 3.용어정의 → 4.책임과권한 → 5.업무절차 → 6.관련법규 → 7.관련문서 → 8.기록보존</div>
      </div>

      <div class="fld">
        <label>제·개정 이력</label>
        <div id="gRevList">${renderRevisions(d)}</div>
        ${editable ? `
        <div style="display:grid;grid-template-columns:80px 130px minmax(0,1fr) auto;gap:6px;margin-top:8px">
          <input class="inp" id="rvVer" placeholder="Rev.">
          <input class="inp" type="date" id="rvDate" value="${today()}">
          <input class="inp" id="rvNote" placeholder="개정 사유·주요 변경내용">
          <button class="btn sm" id="rvAdd">추가</button>
        </div>` : ''}
      </div>

      ${attachmentPanelHtml(d.attachments, editable, { hint: '문서 원본·승인본·개정 근거를 첨부할 수 있습니다' })}

      ${d.updated_at ? `<div style="font-size:11.5px;color:var(--muted);border-top:1px dashed var(--line-strong);padding-top:12px">
        최종 수정 ${esc(String(d.updated_at).slice(0, 16).replace('T', ' '))} · ${esc(d.updated_by || '')}</div>` : ''}
    `,
    onOpen(root) {
      attachmentManager = createAttachmentManager(root, { attachments: d.attachments, editable, itemId: `document:${d.id}`, half: state.half });
      const tpl = $('#gTpl', root);
      if (tpl) tpl.onclick = () => {
        const ta = $('#gBody', root);
        if (ta.value.trim() && !confirmDel('작성된 본문이 있습니다. 표준 목차로 덮어쓸까요?')) return;
        ta.value = DOC_BODY_TEMPLATE;
      };
      const add = $('#rvAdd', root);
      if (add) add.onclick = () => {
        const v = $('#rvVer', root).value.trim();
        const dt = $('#rvDate', root).value;
        const nt = $('#rvNote', root).value.trim();
        if (!v || !nt) { toast('개정 차수와 변경내용을 입력하세요.', 'bad'); return; }
        d.revisions = [...(d.revisions || []), { version: v, date: dt, note: nt, by: state.user?.name || '' }];
        $('#gRevList', root).innerHTML = renderRevisions(d);
        $('#rvVer', root).value = ''; $('#rvNote', root).value = '';
      };
    },
    async onSave(root) {
      let storedAttachments;
      try {
        storedAttachments = await attachmentManager.storePending();
      } catch (err) {
        await attachmentManager.rollbackNewlyStored();
        toast(`첨부자료 저장 실패: ${err?.message || String(err)}`, 'bad');
        return;
      }
      const next = {
        ...d,
        doc_no: $('#gNo', root).value.trim() || d.doc_no,
        type: $('#gType', root).value,
        title: $('#gTitle', root).value.trim() || d.title,
        category: $('#gCat', root).value.trim(),
        version: $('#gVer', root).value.trim(),
        status: $('#gStatus', root).value,
        owner: $('#gOwner', root).value.trim(),
        approver: $('#gApprover', root).value.trim(),
        issued_date: $('#gIssued', root).value,
        revised_date: $('#gRevised', root).value,
        next_review: $('#gReview', root).value,
        purpose: $('#gPurpose', root).value.trim(),
        scope: $('#gScope', root).value.trim(),
        body: $('#gBody', root).value,
        revisions: d.revisions || [],
        attachments: storedAttachments
      };
      showSpinner('문서 저장 중…');
      const res = await saveDocument(next);
      hideSpinner();
      if (res.ok) await attachmentManager.commitRemoved();
      toast(res.ok ? (res.local ? '문서를 저장했습니다 (로컬)' : '문서를 저장했습니다 (Supabase 동기화)') : `로컬 저장됨 · 동기화 실패: ${res.error}`,
            res.ok ? 'ok' : 'bad');
      closeDrawer();
      rerender();
    }
  });
}

function renderRevisions(d) {
  const rows = d.revisions || [];
  if (!rows.length) return `<div style="font-size:12px;color:var(--faint);padding:8px 2px">등록된 개정 이력이 없습니다.</div>`;
  return `<div class="tbl-wrap"><table class="tbl" style="min-width:0">
    <thead><tr><th style="width:70px">Rev.</th><th style="width:100px">일자</th><th>변경내용</th><th style="width:90px">작성</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td class="cell-title">${esc(r.version)}</td><td>${fmtDate(r.date)}</td>
      <td>${esc(r.note)}</td><td>${esc(r.by || '')}</td></tr>`).join('')}</tbody></table></div>`;
}

export function bindDocumentEvents(root, rerender) {
  const q = $('#docQ', root);
  if (q) q.addEventListener('input', e => {
    docFilter.q = e.target.value; const p = e.target.selectionStart;
    rerender(); const n = $('#docQ'); if (n) { n.focus(); n.setSelectionRange(p, p); }
  });
  $$('[data-dtype]', root).forEach(b => b.addEventListener('click', () => { docFilter.type = b.dataset.dtype; rerender(); }));
  const pr = $('#docPrint', root); if (pr) pr.addEventListener('click', () => window.print());

  const nb = $('#docNew', root);
  if (nb) nb.addEventListener('click', async () => {
    const no = window.prompt('새 문서번호를 입력하세요. (예: SHP-22 / SHI-13)');
    if (!no) return;
    const title = window.prompt('문서명을 입력하세요.');
    if (!title) return;
    const prefix = no.split('-')[0].toUpperCase();
    const type = Object.values(DOC_TYPES).find(t => t.prefix === prefix)?.key || 'procedure';
    await saveDocument({
      id: uid('doc'), doc_no: no.trim(), type, title: title.trim(), category: '기타',
      version: '', status: 'draft', owner: '', approver: '', issued_date: '', revised_date: '',
      next_review: '', purpose: '', scope: '', body: '', iso_refs: [], law_refs: [], revisions: [], attachments: []
    });
    toast('문서를 추가했습니다.', 'ok');
    rerender();
  });

  root.addEventListener('click', e => {
    const del = e.target.closest('[data-del-doc]');
    if (del) {
      e.stopPropagation();
      if (!canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
      if (confirmDel('이 문서와 첨부자료를 삭제할까요?')) {
        deleteRow('documents', del.dataset.delDoc).then(res => {
          toast(res.ok ? '문서를 삭제했습니다.' : res.error, res.ok ? 'ok' : 'bad');
          rerender();
        });
      }
      return;
    }
    const c = e.target.closest('[data-doc]');
    if (c) openDocDrawer(c.dataset.doc, rerender);
  });
}

/* ============================================================
   2. 이행점검 (반기 1회 이상 법정 점검)
   ============================================================ */

export function renderInspection() {
  const half = state.half;
  const list = state.inspections.filter(x => x.half === half)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const halfItems = ALL_ITEMS.filter(i => i.cycle === '반기 1회');
  const done = halfItems.filter(i => getRecord(i.id, half).status === 'done').length;
  const linkedMssa = MSSA_ITEMS.map(i => ({ i, r: getRecord(i.id, half) }));
  const linkedWritten = linkedMssa.filter(({ r }) => r.implementation || r.last_checked || r.evidence || r.status !== 'none').length;
  const linkedActions = linkedMssa.filter(({ r }) => ['none', 'hold'].includes(r.status)).length;

  return `
  <div class="banner warn">
    <div class="i">🗓️</div>
    <div><b>반기 1회 이상 점검 의무</b> — 중대재해처벌법 시행령 제4조 제3·5·7·8·9호 및 제5조는
    <b>반기 1회 이상 점검하고 필요한 조치를 할 것</b>을 요구합니다. <b>중대재해처벌법 상세 화면에서 작성한 이행현황·점검일·담당·증빙은 아래 자동 연동 현황에 즉시 반영</b>됩니다.
    이 화면의 점검 실시 기록은 전사·현장 점검 회차의 총괄 결과와 사진·보고서를 남길 때만 사용하세요.</div>
  </div>

  <div class="grid g4" style="margin-bottom:18px">
    ${kpi({ title:'📋 반기 점검 대상', value:halfItems.length, unit:'개 조항', desc:esc(halfLabel(half)) })}
    ${kpi({ title:'✅ 점검 완료', value:done, unit:`/${halfItems.length}`, tone:'green',
            pct: halfItems.length ? Math.round(done / halfItems.length * 100) : 0, desc:'이행완료로 기록된 조항' })}
    ${kpi({ title:'🔗 중처법 자동 연동', value:linkedWritten, unit:`/${linkedMssa.length}`, tone:'blue', desc:'법령 상세 작성 내역 즉시 반영' })}
    ${kpi({ title:'⚠️ 중처법 우선 조치', value:linkedActions, unit:'건', tone:'red', desc:'미이행·보완 필요 항목' })}
  </div>

  <div class="toolbar">
    <span class="tag law">자동 연동</span><span style="font-size:11.5px;color:var(--muted);font-weight:700">법령 상세에서 수정하면 이 화면도 자동 갱신됩니다</span>
    <div style="flex:1"></div>
    ${canEdit() ? `<button class="btn primary" id="inspNew">＋ 점검 회차 총괄 기록</button>` : ''}
    <button class="btn" id="inspPrint">🖨️ 점검결과 인쇄</button>
  </div>

  <div class="sec-t"><h2>중대재해처벌법 자동 연동 현황</h2><div class="l"></div><span class="n">법령 상세 작성값 · 이 화면에서는 별도 저장하지 않습니다</span></div>
  <div class="tbl-wrap"><table class="tbl">
    <thead><tr><th style="width:112px">근거</th><th>이행 의무 · 자동 연동 이행내역</th><th style="width:100px">최근 점검일</th>
      <th style="width:105px">담당</th><th style="width:92px">상태</th></tr></thead>
    <tbody>${linkedMssa.map(({ i, r }) => {
      const summary = r.implementation || r.findings || r.evidence || '';
      return `<tr data-item="${esc(i.id)}" style="cursor:pointer">
        <td><span class="tag law">${esc(i.code)}</span><div style="margin-top:5px;font-size:10px;color:var(--muted);font-weight:700">${esc(i.cycle)}</div></td>
        <td><div class="cell-title" style="font-weight:700">${esc(i.title)}</div>
            <div class="cell-sub">${summary ? esc(summary.slice(0, 115)) + (summary.length > 115 ? '…' : '') : '<span style="color:var(--faint)">법령 상세에서 이행내역을 작성해 주세요</span>'}</div></td>
        <td>${r.last_checked ? fmtDate(r.last_checked) : '<span style="color:var(--bad);font-weight:800">미기록</span>'}</td>
        <td>${esc(r.owner || '-')}</td><td>${statusBadge(r.status)}</td></tr>`;
    }).join('')}</tbody></table></div>

  <div class="sec-t"><h2>점검 회차 총괄 기록</h2><div class="l"></div><span class="n">전사·현장 점검 결과보고서 및 첨부자료 · ${list.length}건</span></div>
  ${list.length === 0
    ? `<div class="card"><div class="empty"><div class="e">🗓️</div><div class="t">등록된 점검 기록이 없습니다</div>
        <div class="s">법령별 이행내역은 위 자동 연동 현황에서 관리됩니다. 전사·현장 점검의 총괄 결과나 사진·결과보고서만 별도로 등록해 주세요.</div></div></div>`
    : `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th style="width:104px">점검일</th><th style="width:150px">점검 구분</th><th>점검 대상 · 주요 결과</th>
          <th style="width:110px">점검자</th><th style="width:96px">조치</th><th style="width:60px"></th></tr></thead>
        <tbody>${list.map(r => `
          <tr data-insp="${esc(r.id)}" style="cursor:pointer">
            <td>${fmtDate(r.date)}</td>
            <td><span class="tag ${r.kind?.includes('중처법') ? 'law' : ''}">${esc(r.kind || '-')}</span></td>
            <td><div class="cell-title">${esc(r.scope || '-')}</div>
                <div class="cell-sub">${esc((r.result || '').slice(0, 90))}${(r.result || '').length > 90 ? '…' : ''}</div></td>
            <td>${esc(r.inspector || '-')}</td>
            <td>${r.action_needed === 'Y' ? '<span class="st st-hold">조치필요</span>' : '<span class="st st-done">조치완료</span>'}</td>
            <td>${canDelete() ? `<button class="btn sm" data-del-insp="${esc(r.id)}">삭제</button>` : ''}</td>
          </tr>`).join('')}</tbody></table></div>`}

  `;
}

function openInspDrawer(rec, rerender) {
  const isNew = !rec;
  const r = rec || { id: uid('insp'), half: state.half, date: today(), kind: '중처법 시행령 제4조 반기점검',
                     scope: '', method: '', result: '', finding: '', action: '', action_needed: 'N', inspector: state.user?.name || '', attachments: [] };
  let attachmentManager;
  openDrawer({
    code: `이행점검 · ${halfLabel(state.half)}`,
    title: isNew ? '점검 회차 총괄 기록 등록' : `${fmtDate(r.date)} 점검 총괄 기록`,
    editable: canEdit(),
    body: `
      <div class="fld-row">
        <div class="fld"><label>점검일</label><input class="inp" type="date" id="iDate" value="${esc(r.date)}"></div>
        <div class="fld"><label>점검자</label><input class="inp" id="iBy" value="${esc(r.inspector)}"></div>
      </div>
      <div class="fld"><label>점검 구분</label>
        <select class="inp" id="iKind">
          ${['중처법 시행령 제4조 반기점검','중처법 시행령 제5조 법령준수 점검','산업안전보건법 자체점검',
             'ISO 45001 내부심사','정부·외부기관 점검','수급업체 합동점검','기타'].map(k =>
            `<option ${r.kind === k ? 'selected' : ''}>${k}</option>`).join('')}
        </select></div>
      <div class="fld"><label>점검 대상 · 범위</label>
        <input class="inp" id="iScope" value="${esc(r.scope)}" placeholder="예) 전국 직영매장 376개소 / 물류센터 3개소"></div>
      <div class="fld"><label>점검 방법</label>
        <input class="inp" id="iMethod" value="${esc(r.method || '')}" placeholder="예) 현장 방문점검 + 앱 제출자료 검증 + 서류 확인"></div>
      <div class="fld"><label>총괄 점검 결과 (법령별 상세 입력과 중복 작성하지 않음)</label>
        <textarea class="inp" id="iResult" style="min-height:130px" placeholder="예) 2026년 하반기 전국 매장 표본점검 결과. 법령별 이행현황·점검일·담당·증빙은 중대재해처벌법 상세 화면에서 관리합니다.">${esc(r.result)}</textarea></div>
      <div class="fld"><label>지적·미흡 사항</label>
        <textarea class="inp" id="iFind" style="min-height:90px" placeholder="확인된 미흡사항. 없으면 '해당없음'">${esc(r.finding || '')}</textarea></div>
      <div class="fld"><label>필요한 조치 및 이행 계획</label>
        <textarea class="inp" id="iAction" style="min-height:90px" placeholder="중처법 시행령 제5조 제2호에 따라 인력 배치·예산 추가편성 등 조치를 기재합니다.">${esc(r.action || '')}</textarea></div>
      <div class="fld"><label>조치 필요 여부</label>
        <select class="inp" id="iNeed">
          <option value="N" ${r.action_needed === 'N' ? 'selected' : ''}>조치 완료 / 불필요</option>
          <option value="Y" ${r.action_needed === 'Y' ? 'selected' : ''}>조치 필요 (진행중)</option>
        </select></div>
      ${attachmentPanelHtml(r.attachments, canEdit(), { hint: '점검표·현장 사진·결과보고서 등을 첨부할 수 있습니다' })}`,
    onOpen(root) {
      attachmentManager = createAttachmentManager(root, { attachments: r.attachments, editable: canEdit(), itemId: `inspection:${r.id}`, half: state.half });
    },
    async onSave(root) {
      let storedAttachments;
      try { storedAttachments = await attachmentManager.storePending(); }
      catch (err) { await attachmentManager.rollbackNewlyStored(); toast(`첨부자료 저장 실패: ${err?.message || String(err)}`, 'bad'); return; }
      const next = { ...r, half: state.half,
        date: $('#iDate', root).value, inspector: $('#iBy', root).value.trim(),
        kind: $('#iKind', root).value, scope: $('#iScope', root).value.trim(),
        method: $('#iMethod', root).value.trim(), result: $('#iResult', root).value.trim(),
        finding: $('#iFind', root).value.trim(), action: $('#iAction', root).value.trim(),
        action_needed: $('#iNeed', root).value, attachments: storedAttachments };
      showSpinner('저장 중…');
      const res = await saveRow('inspections', next);
      hideSpinner();
      if (res.ok) await attachmentManager.commitRemoved();
      toast(res.ok ? '점검 기록을 저장했습니다.' : `로컬 저장됨 · 동기화 실패: ${res.error}`, res.ok ? 'ok' : 'bad');
      closeDrawer(); rerender();
    }
  });
}

export function bindInspectionEvents(root, rerender, openItem) {
  const nb = $('#inspNew', root); if (nb) nb.addEventListener('click', () => openInspDrawer(null, rerender));
  const pr = $('#inspPrint', root); if (pr) pr.addEventListener('click', () => window.print());
  root.addEventListener('click', async e => {
    const del = e.target.closest('[data-del-insp]');
    if (del) { e.stopPropagation();
      if (!canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
      if (confirmDel('이 점검 기록을 삭제할까요?')) { const res = await deleteRow('inspections', del.dataset.delInsp); toast(res.ok ? '삭제했습니다.' : res.error, res.ok ? 'ok' : 'bad'); rerender(); }
      return; }
    const row = e.target.closest('[data-insp]');
    if (row) { openInspDrawer(state.inspections.find(x => x.id === row.dataset.insp), rerender); return; }
    const it = e.target.closest('[data-item]');
    if (it) openItem(it.dataset.item);
  });
}

/* ============================================================
   3. 개선조치 (CAPA)
   ============================================================ */

const CAPA_STATUS = { open:'접수', analyzing:'원인분석', acting:'조치중', verifying:'효과검증', closed:'종결' };

export function renderCapa() {
  const list = [...state.capa].sort((a, b) => String(b.raised_date || '').localeCompare(String(a.raised_date || '')));
  const open = list.filter(c => c.status !== 'closed');
  const overdue = open.filter(c => c.due_date && c.due_date < today());

  return `
  <div class="banner">
    <div class="i">🔧</div>
    <div><b>개선조치(CAPA)</b> — 점검·심사·사고에서 확인된 부적합을 <b>접수 → 원인분석 → 조치 → 효과검증 → 종결</b>까지 추적합니다.
    ISO 45001 10.2(사건·부적합 및 시정조치)와 중처법 시행령 제5조 제2호의 이행 증빙이 됩니다.</div>
  </div>

  <div class="grid g4" style="margin-bottom:18px">
    ${kpi({ title:'🔧 전체 등록', value:list.length, unit:'건', desc:'누적 개선조치 요구' })}
    ${kpi({ title:'⏳ 진행중', value:open.length, unit:'건', tone:'orange', desc:'종결되지 않은 조치' })}
    ${kpi({ title:'🚨 기한 초과', value:overdue.length, unit:'건', tone:'red', desc:'완료 기한이 지난 조치' })}
    ${kpi({ title:'✅ 종결', value:list.length - open.length, unit:'건', tone:'green',
            pct: list.length ? Math.round((list.length - open.length) / list.length * 100) : 0, desc:'효과검증까지 완료' })}
  </div>

  <div class="toolbar">
    <div style="flex:1"></div>
    ${canEdit() ? `<button class="btn primary" id="capaNew">＋ 개선조치 등록</button>` : ''}
    <button class="btn" id="capaPrint">🖨️ 인쇄</button>
  </div>

  ${list.length === 0
    ? `<div class="card"><div class="empty"><div class="e">🔧</div><div class="t">등록된 개선조치가 없습니다</div>
        <div class="s">점검·심사에서 확인된 부적합 사항을 등록해 종결까지 관리하세요.</div></div></div>`
    : `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th style="width:104px">접수일</th><th style="width:110px">발생 경로</th><th>부적합 내용</th>
          <th style="width:110px">담당</th><th style="width:100px">완료기한</th><th style="width:90px">상태</th><th style="width:60px"></th></tr></thead>
        <tbody>${list.map(c => {
          const late = c.due_date && c.due_date < today() && c.status !== 'closed';
          return `<tr data-capa="${esc(c.id)}" style="cursor:pointer">
            <td>${fmtDate(c.raised_date)}</td>
            <td><span class="tag">${esc(c.source || '-')}</span></td>
            <td><div class="cell-title">${esc(c.title || '-')}</div>
                <div class="cell-sub">${esc((c.description || '').slice(0, 80))}${(c.description || '').length > 80 ? '…' : ''}</div></td>
            <td>${esc(c.owner || '-')}</td>
            <td style="${late ? 'color:var(--bad);font-weight:800' : ''}">${c.due_date ? fmtDate(c.due_date) : '-'}</td>
            <td><span class="st ${c.status === 'closed' ? 'st-done' : c.status === 'open' ? 'st-none' : 'st-progress'}">${CAPA_STATUS[c.status] || c.status}</span></td>
            <td>${canDelete() ? `<button class="btn sm" data-del-capa="${esc(c.id)}">삭제</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>`}`;
}

function openCapaDrawer(rec, rerender) {
  const isNew = !rec;
  const c = rec || { id: uid('capa'), raised_date: today(), source: '반기 점검', title: '', description: '',
                     item_id: '', root_cause: '', action: '', owner: '', due_date: '', verify: '', status: 'open', attachments: [] };
  let attachmentManager;
  openDrawer({
    code: isNew ? '개선조치 신규 등록' : `CAPA · ${fmtDate(c.raised_date)}`,
    title: isNew ? '개선조치(CAPA) 등록' : (c.title || '개선조치'),
    editable: canEdit(),
    body: `
      <div class="fld-row">
        <div class="fld"><label>접수일</label><input class="inp" type="date" id="cDate" value="${esc(c.raised_date)}"></div>
        <div class="fld"><label>발생 경로</label>
          <select class="inp" id="cSrc">${['반기 점검','내부심사','외부심사','정부점검','사고·아차사고','근로자 의견','위험성평가','기타']
            .map(s => `<option ${c.source === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      </div>
      <div class="fld"><label>제목</label><input class="inp" id="cTitle" value="${esc(c.title)}" placeholder="예) 3개 매장 소화기 점검표 미기재"></div>
      <div class="fld"><label>관련 법령·ISO 조항</label>
        <select class="inp" id="cItem">
          <option value="">— 선택 안 함 —</option>
          ${ALL_ITEMS.map(i => `<option value="${esc(i.id)}" ${c.item_id === i.id ? 'selected' : ''}>[${esc(FRAMEWORKS[i.framework].short)}] ${esc(i.code)} ${esc(i.title)}</option>`).join('')}
        </select></div>
      <div class="fld"><label>부적합 내용 (사실 기재)</label>
        <textarea class="inp" id="cDesc" style="min-height:100px">${esc(c.description)}</textarea></div>
      <div class="fld"><label>근본 원인 분석 (5Why / RCA)</label>
        <textarea class="inp" id="cRoot" style="min-height:100px" placeholder="표면 원인이 아닌 근본 원인을 기재합니다.">${esc(c.root_cause)}</textarea></div>
      <div class="fld"><label>시정조치 내용</label>
        <textarea class="inp" id="cAct" style="min-height:100px" placeholder="관리 위계(제거→대체→공학적→행정적→PPE) 순으로 검토한 조치를 기재합니다.">${esc(c.action)}</textarea></div>
      <div class="fld-row">
        <div class="fld"><label>조치 담당자</label><input class="inp" id="cOwner" value="${esc(c.owner)}"></div>
        <div class="fld"><label>완료 기한</label><input class="inp" type="date" id="cDue" value="${esc(c.due_date)}"></div>
      </div>
      <div class="fld"><label>효과성 검증 결과</label>
        <textarea class="inp" id="cVerify" style="min-height:80px" placeholder="조치가 실제로 효과가 있었는지 확인한 방법과 결과를 기재합니다.">${esc(c.verify)}</textarea></div>
      <div class="fld"><label>진행 상태</label>
        <select class="inp" id="cStat">${Object.entries(CAPA_STATUS).map(([k, v]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      ${attachmentPanelHtml(c.attachments, canEdit(), { hint: '개선 전후 사진·조치 완료 보고·확인 근거를 첨부할 수 있습니다' })}`,
    onOpen(root) {
      attachmentManager = createAttachmentManager(root, { attachments: c.attachments, editable: canEdit(), itemId: `capa:${c.id}`, half: state.half });
    },
    async onSave(root) {
      let storedAttachments;
      try { storedAttachments = await attachmentManager.storePending(); }
      catch (err) { await attachmentManager.rollbackNewlyStored(); toast(`첨부자료 저장 실패: ${err?.message || String(err)}`, 'bad'); return; }
      const next = { ...c,
        raised_date: $('#cDate', root).value, source: $('#cSrc', root).value,
        title: $('#cTitle', root).value.trim(), item_id: $('#cItem', root).value,
        description: $('#cDesc', root).value.trim(), root_cause: $('#cRoot', root).value.trim(),
        action: $('#cAct', root).value.trim(), owner: $('#cOwner', root).value.trim(),
        due_date: $('#cDue', root).value, verify: $('#cVerify', root).value.trim(),
        status: $('#cStat', root).value, attachments: storedAttachments };
      if (!next.title) { toast('제목을 입력하세요.', 'bad'); return; }
      showSpinner('저장 중…');
      const res = await saveRow('capa', next);
      hideSpinner();
      if (res.ok) await attachmentManager.commitRemoved();
      toast(res.ok ? '개선조치를 저장했습니다.' : `로컬 저장됨 · 동기화 실패: ${res.error}`, res.ok ? 'ok' : 'bad');
      closeDrawer(); rerender();
    }
  });
}

export function bindCapaEvents(root, rerender) {
  const nb = $('#capaNew', root); if (nb) nb.addEventListener('click', () => openCapaDrawer(null, rerender));
  const pr = $('#capaPrint', root); if (pr) pr.addEventListener('click', () => window.print());
  root.addEventListener('click', async e => {
    const del = e.target.closest('[data-del-capa]');
    if (del) { e.stopPropagation();
      if (!canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
      if (confirmDel('이 개선조치를 삭제할까요?')) { const res = await deleteRow('capa', del.dataset.delCapa); toast(res.ok ? '삭제했습니다.' : res.error, res.ok ? 'ok' : 'bad'); rerender(); }
      return; }
    const row = e.target.closest('[data-capa]');
    if (row) openCapaDrawer(state.capa.find(x => x.id === row.dataset.capa), rerender);
  });
}

/* ============================================================
   4. 증빙 자료함
   ============================================================ */

export function renderEvidence() {
  const list = [...state.evidence].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const linked = new Set(list.map(e => e.item_id).filter(Boolean));

  return `
  <div class="banner">
    <div class="i">🗂️</div>
    <div><b>이행 증빙 자료함</b> — 심사원에게 제시할 증빙자료의 <b>문서명·보관 위치·링크</b>를 등록합니다.
    실물 파일은 사내 문서고 또는 클라우드에 보관하고, 여기에는 <b>어디에 무엇이 있는지</b>를 남겨 즉시 제시할 수 있게 합니다.</div>
  </div>

  <div class="grid g4" style="margin-bottom:18px">
    ${kpi({ title:'🗂️ 등록 증빙', value:list.length, unit:'건', desc:'조항과 연결된 증빙 자료' })}
    ${kpi({ title:'🔗 증빙 연결 조항', value:linked.size, unit:`/${ALL_ITEMS.length}`, tone:'green',
            pct: Math.round(linked.size / ALL_ITEMS.length * 100), desc:'증빙이 등록된 조항 비율' })}
    ${kpi({ title:'📅 최근 등록', value: list[0] ? fmtDate(list[0].date) : '—', unit:'', tone:'blue', desc:'가장 최근 등록된 증빙' })}
    ${kpi({ title:'⚠️ 증빙 없는 핵심 조항', value: ALL_ITEMS.filter(i => i.severity === 'critical' && !linked.has(i.id)).length,
            unit:'건', tone:'red', desc:'심사 지적 위험이 높습니다' })}
  </div>

  <div class="toolbar">
    <div style="flex:1"></div>
    ${canEdit() ? `<button class="btn primary" id="eviNew">＋ 증빙 등록</button>` : ''}
    <button class="btn" id="eviPrint">🖨️ 인쇄</button>
  </div>

  ${list.length === 0
    ? `<div class="card"><div class="empty"><div class="e">🗂️</div><div class="t">등록된 증빙 자료가 없습니다</div>
        <div class="s">심사 시 제시할 자료의 위치를 미리 등록해 두면 대응 시간이 크게 줄어듭니다.</div></div></div>`
    : `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th style="width:100px">일자</th><th>자료명</th><th style="width:230px">관련 조항</th>
          <th style="width:200px">보관 위치</th><th style="width:60px"></th></tr></thead>
        <tbody>${list.map(e => {
          const it = ALL_ITEMS.find(i => i.id === e.item_id);
          return `<tr data-evi="${esc(e.id)}" style="cursor:pointer">
            <td>${fmtDate(e.date)}</td>
            <td><div class="cell-title">${esc(e.title || '-')}</div>
              ${e.url ? `<div class="cell-sub"><a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url.slice(0, 60))}</a></div>` : ''}</td>
            <td>${it ? `<span class="tag ${it.framework === 'mssa' ? 'law' : it.framework === 'iso' ? 'iso' : ''}">${esc(it.code)}</span> ${esc(it.title.slice(0, 20))}` : '<span style="color:var(--faint)">미연결</span>'}</td>
            <td>${esc(e.location || '-')}</td>
            <td>${canDelete() ? `<button class="btn sm" data-del-evi="${esc(e.id)}">삭제</button>` : ''}</td></tr>`;
        }).join('')}</tbody></table></div>`}`;
}

function openEviDrawer(rec, rerender) {
  const e = rec || { id: uid('evi'), date: today(), title: '', item_id: '', location: '', url: '', note: '', attachments: [] };
  let attachmentManager;
  openDrawer({
    code: '이행 증빙 자료',
    title: rec ? (e.title || '증빙 자료') : '증빙 자료 등록',
    editable: canEdit(),
    body: `
      <div class="fld-row">
        <div class="fld"><label>일자</label><input class="inp" type="date" id="vDate" value="${esc(e.date)}"></div>
        <div class="fld"><label>관련 조항</label>
          <select class="inp" id="vItem"><option value="">— 선택 안 함 —</option>
            ${ALL_ITEMS.map(i => `<option value="${esc(i.id)}" ${e.item_id === i.id ? 'selected' : ''}>[${esc(FRAMEWORKS[i.framework].short)}] ${esc(i.code)} ${esc(i.title)}</option>`).join('')}
          </select></div>
      </div>
      <div class="fld"><label>자료명</label><input class="inp" id="vTitle" value="${esc(e.title)}" placeholder="예) 2026년 상반기 위험성평가 결과보고서"></div>
      <div class="fld"><label>보관 위치</label><input class="inp" id="vLoc" value="${esc(e.location)}" placeholder="예) 안전보건팀 문서고 3번 캐비닛 / D드라이브 최종백업 폴더"></div>
      <div class="fld"><label>링크 (선택)</label><input class="inp" id="vUrl" value="${esc(e.url)}" placeholder="https://"></div>
      <div class="fld"><label>비고</label><textarea class="inp" id="vNote" style="min-height:80px">${esc(e.note)}</textarea></div>
      ${attachmentPanelHtml(e.attachments, canEdit(), { hint: '증빙 원본·보조 사진·관련 전자결재 링크를 함께 보관할 수 있습니다' })}`,
    onOpen(root) {
      attachmentManager = createAttachmentManager(root, { attachments: e.attachments, editable: canEdit(), itemId: `evidence:${e.id}`, half: state.half });
    },
    async onSave(root) {
      let storedAttachments;
      try { storedAttachments = await attachmentManager.storePending(); }
      catch (err) { await attachmentManager.rollbackNewlyStored(); toast(`첨부자료 저장 실패: ${err?.message || String(err)}`, 'bad'); return; }
      const next = { ...e, date: $('#vDate', root).value, item_id: $('#vItem', root).value,
        title: $('#vTitle', root).value.trim(), location: $('#vLoc', root).value.trim(),
        url: $('#vUrl', root).value.trim(), note: $('#vNote', root).value.trim(), attachments: storedAttachments };
      if (!next.title) { toast('자료명을 입력하세요.', 'bad'); return; }
      showSpinner('저장 중…');
      const res = await saveRow('evidence', next);
      hideSpinner();
      if (res.ok) await attachmentManager.commitRemoved();
      toast(res.ok ? '증빙을 등록했습니다.' : `로컬 저장됨 · 동기화 실패: ${res.error}`, res.ok ? 'ok' : 'bad');
      closeDrawer(); rerender();
    }
  });
}

export function bindEvidenceEvents(root, rerender) {
  const nb = $('#eviNew', root); if (nb) nb.addEventListener('click', () => openEviDrawer(null, rerender));
  const pr = $('#eviPrint', root); if (pr) pr.addEventListener('click', () => window.print());
  root.addEventListener('click', async ev => {
    const del = ev.target.closest('[data-del-evi]');
    if (del) { ev.stopPropagation();
      if (!canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
      if (confirmDel('이 증빙 등록을 삭제할까요?')) { const res = await deleteRow('evidence', del.dataset.delEvi); toast(res.ok ? '삭제했습니다.' : res.error, res.ok ? 'ok' : 'bad'); rerender(); }
      return; }
    const row = ev.target.closest('[data-evi]');
    if (row) openEviDrawer(state.evidence.find(x => x.id === row.dataset.evi), rerender);
  });
}

/* ============================================================
   5. 조직 · 법정 선임 현황
   ============================================================ */

const POSITIONS = ['경영책임자','안전보건관리책임자','안전보건총괄책임자','관리감독자','안전관리자','보건관리자','안전보건관리담당자','산업보건의','명예산업안전감독관','근로자대표'];

export function renderOrg() {
  const list = [...state.org].sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position));
  const need = POSITIONS.filter(p => !list.some(x => x.position === p));

  return `
  <div class="banner">
    <div class="i">👥</div>
    <div><b>조직 및 법정 선임 현황</b> — 중처법 시행령 제4조 제2·5·6호와 산업안전보건법 제15~19조의 선임 의무를 관리합니다.
    선임자별 <b>선임일·자격·직무수행 평가</b>를 기록하면 그대로 심사 증빙이 됩니다.</div>
  </div>

  <div class="grid g4" style="margin-bottom:18px">
    ${kpi({ title:'👥 등록 선임자', value:list.length, unit:'명', desc:'법정 선임 인원 등록 현황' })}
    ${kpi({ title:'⚠️ 미등록 직위', value:need.length, unit:'개', tone: need.length ? 'red' : 'green',
            desc: need.length ? need.slice(0, 3).join(', ') + (need.length > 3 ? ' 외' : '') : '주요 직위 모두 등록' })}
    ${kpi({ title:'📋 반기 평가 완료', value:list.filter(x => x.eval_date).length, unit:`/${list.length}`, tone:'blue',
            pct: list.length ? Math.round(list.filter(x => x.eval_date).length / list.length * 100) : 0,
            desc:'시행령 제4조 제5호 업무수행 평가' })}
    ${kpi({ title:'🎓 직무교육 이수', value:list.filter(x => x.training_date).length, unit:`/${list.length}`, tone:'green',
            pct: list.length ? Math.round(list.filter(x => x.training_date).length / list.length * 100) : 0,
            desc:'산안법 제32조 직무교육' })}
  </div>

  <div class="toolbar">
    <div style="flex:1"></div>
    ${canEdit() ? `<button class="btn primary" id="orgNew">＋ 선임자 등록</button>` : ''}
    <button class="btn" id="orgPrint">🖨️ 인쇄</button>
  </div>

  ${list.length === 0
    ? `<div class="card"><div class="empty"><div class="e">👥</div><div class="t">등록된 선임자가 없습니다</div>
        <div class="s">경영책임자부터 관리감독자까지 법정 선임 현황을 등록해 주세요.</div></div></div>`
    : `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th style="width:160px">직위</th><th style="width:110px">성명</th><th style="width:150px">소속·사업장</th>
          <th style="width:100px">선임일</th><th style="width:100px">직무교육</th><th style="width:100px">반기평가</th>
          <th>비고</th><th style="width:60px"></th></tr></thead>
        <tbody>${list.map(o => `
          <tr data-org="${esc(o.id)}" style="cursor:pointer">
            <td><span class="tag ${['경영책임자','안전보건관리책임자'].includes(o.position) ? 'law' : ''}">${esc(o.position)}</span></td>
            <td class="cell-title">${esc(o.name || '-')}</td>
            <td>${esc(o.site || '-')}</td>
            <td>${o.appointed_date ? fmtDate(o.appointed_date) : '<span style="color:var(--bad)">미기재</span>'}</td>
            <td>${o.training_date ? fmtDate(o.training_date) : '<span style="color:var(--faint)">미이수</span>'}</td>
            <td>${o.eval_date ? fmtDate(o.eval_date) : '<span style="color:var(--faint)">미실시</span>'}</td>
            <td class="cell-sub" style="margin:0">${esc((o.note || '').slice(0, 40))}</td>
            <td>${canDelete() ? `<button class="btn sm" data-del-org="${esc(o.id)}">삭제</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>`}`;
}

function openOrgDrawer(rec, rerender) {
  const o = rec || { id: uid('org'), position: POSITIONS[0], name: '', site: '', appointed_date: '',
                     qualification: '', training_date: '', eval_date: '', eval_result: '', note: '', attachments: [] };
  let attachmentManager;
  openDrawer({
    code: '법정 선임 현황',
    title: rec ? `${o.position} ${o.name}` : '선임자 등록',
    editable: canEdit(),
    body: `
      <div class="fld-row">
        <div class="fld"><label>직위</label><select class="inp" id="oPos">
          ${POSITIONS.map(p => `<option ${o.position === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div class="fld"><label>성명</label><input class="inp" id="oName" value="${esc(o.name)}"></div>
      </div>
      <div class="fld-row">
        <div class="fld"><label>소속 · 사업장</label><input class="inp" id="oSite" value="${esc(o.site)}" placeholder="예) 본사 안전보건팀 / 용인물류센터"></div>
        <div class="fld"><label>선임일</label><input class="inp" type="date" id="oAppt" value="${esc(o.appointed_date)}"></div>
      </div>
      <div class="fld"><label>자격 요건 (자격증·경력)</label>
        <input class="inp" id="oQual" value="${esc(o.qualification)}" placeholder="예) 산업안전기사, 안전관리 경력 8년"></div>
      <div class="fld-row">
        <div class="fld"><label>직무교육 이수일 (산안법 제32조)</label><input class="inp" type="date" id="oTr" value="${esc(o.training_date)}"></div>
        <div class="fld"><label>반기 업무수행 평가일 (영 제4조 5호)</label><input class="inp" type="date" id="oEv" value="${esc(o.eval_date)}"></div>
      </div>
      <div class="fld"><label>업무수행 평가 결과</label>
        <textarea class="inp" id="oEvR" style="min-height:90px" placeholder="평가기준별 점수와 총평, 개선 요구사항을 기재합니다.">${esc(o.eval_result)}</textarea></div>
      <div class="fld"><label>비고 (부여된 권한·예산 등)</label>
        <textarea class="inp" id="oNote" style="min-height:80px">${esc(o.note)}</textarea></div>
      ${attachmentPanelHtml(o.attachments, canEdit(), { hint: '선임신고서·자격증·교육수료증·인사발령서 등을 첨부할 수 있습니다' })}`,
    onOpen(root) {
      attachmentManager = createAttachmentManager(root, { attachments: o.attachments, editable: canEdit(), itemId: `org:${o.id}`, half: state.half });
    },
    async onSave(root) {
      let storedAttachments;
      try { storedAttachments = await attachmentManager.storePending(); }
      catch (err) { await attachmentManager.rollbackNewlyStored(); toast(`첨부자료 저장 실패: ${err?.message || String(err)}`, 'bad'); return; }
      const next = { ...o, position: $('#oPos', root).value, name: $('#oName', root).value.trim(),
        site: $('#oSite', root).value.trim(), appointed_date: $('#oAppt', root).value,
        qualification: $('#oQual', root).value.trim(), training_date: $('#oTr', root).value,
        eval_date: $('#oEv', root).value, eval_result: $('#oEvR', root).value.trim(),
        note: $('#oNote', root).value.trim(), attachments: storedAttachments };
      if (!next.name) { toast('성명을 입력하세요.', 'bad'); return; }
      showSpinner('저장 중…');
      const res = await saveRow('org', next);
      hideSpinner();
      if (res.ok) await attachmentManager.commitRemoved();
      toast(res.ok ? '선임 현황을 저장했습니다.' : `로컬 저장됨 · 동기화 실패: ${res.error}`, res.ok ? 'ok' : 'bad');
      closeDrawer(); rerender();
    }
  });
}

export function bindOrgEvents(root, rerender) {
  const nb = $('#orgNew', root); if (nb) nb.addEventListener('click', () => openOrgDrawer(null, rerender));
  const pr = $('#orgPrint', root); if (pr) pr.addEventListener('click', () => window.print());
  root.addEventListener('click', async e => {
    const del = e.target.closest('[data-del-org]');
    if (del) { e.stopPropagation();
      if (!canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
      if (confirmDel('이 선임 등록을 삭제할까요?')) { const res = await deleteRow('org', del.dataset.delOrg); toast(res.ok ? '삭제했습니다.' : res.error, res.ok ? 'ok' : 'bad'); rerender(); }
      return; }
    const row = e.target.closest('[data-org]');
    if (row) openOrgDrawer(state.org.find(x => x.id === row.dataset.org), rerender);
  });
}

/* ============================================================
   6. ISO 45001 심사 대응 — 조항 ↔ 법령 ↔ 문서 ↔ 증빙 매핑표
   ============================================================ */

export function renderAudit() {
  const half = state.half;
  const p = progressOf(ISO_ITEMS, half);
  const noEvidence = ISO_ITEMS.filter(i => !getRecord(i.id, half).evidence);

  return `
  <div class="banner">
    <div class="i">🌐</div>
    <div><b>ISO 45001:2018 심사 대응 매트릭스</b> — 심사원이 확인하는 순서대로
    <b>요구조항 → 대응 문서 → 이행 증빙 → 관련 법령</b>을 한 표로 정리했습니다.
    이 화면을 그대로 인쇄하면 <b>심사 대응 팩</b>이 됩니다.</div>
  </div>

  <div class="grid g4" style="margin-bottom:18px">
    ${kpi({ title:'🌐 ISO 적합률', value:p.pct, unit:'%', tone:'green', pct:p.pct, desc:`${ISO_ITEMS.length}개 요구사항` })}
    ${kpi({ title:'✅ 적합', value:p.counts.done, unit:'건', tone:'green', desc:'이행완료로 기록됨' })}
    ${kpi({ title:'⚠️ 관찰·부적합 위험', value:p.counts.hold + p.counts.none, unit:'건', tone:'red', desc:'보완필요 + 미이행' })}
    ${kpi({ title:'📎 증빙 미기재', value:noEvidence.length, unit:'건', tone:'orange', desc:'증빙자료 항목이 비어 있음' })}
  </div>

  <div class="toolbar">
    <div style="flex:1"></div>
    <button class="btn" id="auditCsv">⬇️ 매트릭스 CSV 내려받기</button>
    <button class="btn primary" id="auditPrint">🖨️ 심사 대응 팩 인쇄</button>
  </div>

  <div class="tbl-wrap"><table class="tbl" style="min-width:1080px">
    <thead><tr>
      <th style="width:74px">조항</th><th style="width:210px">요구사항</th>
      <th style="width:180px">대응 문서</th><th>이행 현황 (작성 내용)</th>
      <th style="width:150px">관련 법령</th><th style="width:88px">판정</th>
    </tr></thead>
    <tbody>${ISO_ITEMS.map(i => {
      const r = getRecord(i.id, half);
      const docs = (i.docRefs || []).map(no => DOC_MASTER.find(d => d.docNo === no)).filter(Boolean);
      const laws = (i.lawRefs || []).map(id => ALL_ITEMS.find(x => x.id === id)).filter(Boolean);
      return `<tr data-item="${esc(i.id)}" style="cursor:pointer">
        <td><span class="tag iso">${esc(i.code)}</span></td>
        <td class="cell-title">${esc(i.title)}</td>
        <td>${docs.length ? docs.map(d => `<div style="margin-bottom:3px"><span class="tag doc">${esc(d.docNo)}</span> ${esc(d.title.slice(0, 16))}</div>`).join('') : '<span style="color:var(--faint)">—</span>'}</td>
        <td style="line-height:1.6">${r.implementation ? esc(r.implementation.slice(0, 160)) + (r.implementation.length > 160 ? '…' : '') : '<span style="color:var(--bad);font-weight:700">미작성 — 심사 지적 위험</span>'}
          ${r.evidence ? `<div class="cell-sub">📎 ${esc(r.evidence.slice(0, 70))}</div>` : ''}</td>
        <td>${laws.length ? laws.map(l => `<div><span class="tag law">${esc(l.code)}</span></div>`).join('') : '<span style="color:var(--faint)">—</span>'}</td>
        <td>${statusBadge(r.status)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

export function bindAuditEvents(root, rerender, openItem) {
  const pr = $('#auditPrint', root); if (pr) pr.addEventListener('click', () => window.print());
  const cv = $('#auditCsv', root);
  if (cv) cv.addEventListener('click', () => {
    const half = state.half;
    const rows = [['조항','요구사항','대응문서','이행현황','증빙자료','미흡사항','담당','최근점검','판정']];
    ISO_ITEMS.forEach(i => {
      const r = getRecord(i.id, half);
      rows.push([i.code, i.title, (i.docRefs || []).join(' '), r.implementation, r.evidence, r.findings,
                 r.owner, r.last_checked, (STATUS[r.status] || STATUS.none).label]);
    });
    downloadCsv(rows, `ISO45001_심사대응매트릭스_claude_${new Date().getFullYear()}_${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}.csv`);
  });
  root.addEventListener('click', e => {
    const it = e.target.closest('[data-item]');
    if (it) openItem(it.dataset.item);
  });
}

function downloadCsv(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ============================================================
   7. 설정 — Supabase 연결 / 백업 / 계정
   ============================================================ */

export function renderSettings() {
  const cfg = getSupabaseConfig();
  const fileMode = attachmentStorageMode();
  const usingSupabase = conn.mode === 'supabase';
  const authMethod = usingSupabase
    ? '아이디 로그인 (Supabase Auth 내부 계정 연결)'
    : '공용 작성 비밀번호 + 마스터 관리자 삭제 비밀번호';
  const authHelp = usingSupabase
    ? `<b>공동 운영</b> — 각 사용자가 부여받은 아이디로 로그인하면 같은 업무 자료를 함께 조회·작성·수정할 수 있습니다. 삭제는 <b>master</b> 역할의 관리자 계정만 가능합니다.<br>
        <b>첨부파일</b> — Cloudflare R2 Worker가 아직 연결되지 않은 경우 첨부 원본은 각 브라우저에만 보관됩니다. R2 연결을 마치면 파일도 공동으로 볼 수 있습니다.`
    : `<b>접속 방식</b> — 공용 비밀번호 방식에서는 작성·수정은 가능하지만 삭제는 마스터 관리자만 가능합니다. 실제 공동 운영을 하려면 Supabase Auth와 RLS 정책을 연결해야 합니다.`;
  const auditName = { record: '이행기록', document: '문서', capa: '개선조치', inspections: '이행점검', org: '선임·조직', evidence: '증빙자료' };
  const auditAction = { create: '작성', update: '수정', delete: '삭제' };
  const auditRows = getAuditLog().slice(0, 100).map(a => {
    const dt = new Date(a.created_at);
    const when = Number.isNaN(dt.getTime()) ? '-' : `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')} ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    return `<tr><td>${esc(when)}</td><td>${esc(a.login_id || a.actor_name || '미상')} · ${esc(a.actor_name || '')}</td><td>${esc(auditAction[a.action] || a.action)}</td><td>${esc(auditName[a.entity_type] || a.entity_type)}<br><small>${esc(a.entity_id)}</small></td></tr>`;
  }).join('');
  const liveUrl = 'https://sky5224122-jpg.github.io/daiso-shms/';
  const recordStore = conn.mode === 'supabase' ? 'Supabase PostgreSQL + 브라우저 캐시' : '현재 PC 브라우저 localStorage';
  const fileStore = fileMode === 'r2' ? 'Cloudflare R2 (Worker 경유)' : '현재 PC 브라우저 IndexedDB';
  return `
  <div class="banner ${conn.mode === 'supabase' ? '' : 'warn'}">
    <div class="i">${conn.mode === 'supabase' ? '🟢' : '🟡'}</div>
    <div>${conn.mode === 'supabase'
      ? `현재 <b>Supabase 연결 모드</b>로 동작 중입니다. 입력한 자료는 Supabase에 저장되고 로컬에도 캐시됩니다.`
      : `현재 <b>로컬 저장 모드</b>입니다. 자료는 이 브라우저에만 저장됩니다.
         아래 연결정보와 함께 Supabase Auth·RLS 구성을 완료해야 전사 공유 모드로 전환됩니다.`}
      ${conn.error ? `<div style="margin-top:6px;color:var(--bad);font-weight:700">최근 오류: ${esc(conn.error)}</div>` : ''}</div>
  </div>

  <section class="ops-map-card">
    <div class="ops-map-head">
      <div>
        <span class="ops-eyebrow">OPERATING ARCHITECTURE</span>
        <h3>운영 흐름 · 접속과 저장 위치</h3>
        <p>사용자가 어디로 접속하고, 입력자료와 첨부파일이 각각 어디에 저장되는지 한 화면에서 확인합니다.</p>
      </div>
      <span class="ops-mode ${conn.mode === 'supabase' && fileMode === 'r2' ? 'ready' : 'setup'}">${conn.mode === 'supabase' && fileMode === 'r2' ? '원격 저장 운영 중' : '운영 전환 준비 중'}</span>
    </div>

    <div class="ops-current-strip">
      <div><span>공식 접속 주소</span><a href="${liveUrl}" target="_blank" rel="noopener">${liveUrl} ↗</a></div>
      <div><span>현재 업무데이터</span><strong>${esc(recordStore)}</strong></div>
      <div><span>현재 첨부파일</span><strong>${esc(fileStore)}</strong></div>
    </div>

    <div class="ops-flow" aria-label="운영 흐름">
      <div class="ops-step">
        <span class="ops-step-no">01</span><div class="ops-step-icon">PC</div>
        <strong>사용자 접속</strong><p>사내 PC의 Chrome·Edge에서 공식 주소로 접속</p>
      </div>
      <span class="ops-arrow">→</span>
      <div class="ops-step">
        <span class="ops-step-no">02</span><div class="ops-step-icon">WEB</div>
        <strong>화면 제공</strong><p>GitHub Pages가 앱 화면·코드를 제공</p>
      </div>
      <span class="ops-arrow">→</span>
      <div class="ops-step">
        <span class="ops-step-no">03</span><div class="ops-step-icon">AUTH</div>
        <strong>사용자 인증</strong><p>공용 작성 비밀번호 · 관리자 삭제 비밀번호 · 운영 전 Supabase Auth 전환 필요</p>
      </div>
      <span class="ops-arrow split">→</span>
      <div class="ops-destinations">
        <div class="ops-destination database"><span>업무데이터</span><strong>Supabase</strong><p>이행기록·문서·점검·개선조치·첨부 메타데이터</p></div>
        <div class="ops-destination storage"><span>사진·파일</span><strong>Cloudflare Worker → R2</strong><p>사진은 50KB 목표 압축 · 문서는 최대 15MB 분리 저장</p></div>
      </div>
    </div>

    <div class="ops-policy-grid">
      <div class="ops-policy current">
        <div class="ops-policy-title"><span>현재 실제 동작</span><b>${conn.mode === 'supabase' ? 'Supabase 연결' : '로컬 저장'}</b></div>
        <ul>
          <li>인증: ${usingSupabase ? '사용자 아이디로 로그인 · master 관리자만 삭제' : '공용 비밀번호는 작성·수정, 관리자 비밀번호만 삭제'}</li>
          <li>업무데이터: ${esc(recordStore)}</li>
          <li>첨부파일: ${esc(fileStore)}</li>
          <li>자동 백업: 앱이 열려 있으면 매일 오전 9시 1회 · 최근 5개 보관</li>
        </ul>
      </div>
      <div class="ops-policy target">
        <div class="ops-policy-title"><span>권장 운영 구조</span><b>부하·용량 분리</b></div>
        <ul>
          <li>정적 화면은 GitHub Pages가 제공해 Supabase 트래픽과 분리</li>
          <li>Supabase는 업무데이터와 첨부 메타데이터만 저장</li>
          <li>사진·문서 본문은 Cloudflare Worker 인증 후 R2 저장</li>
          <li>Supabase Auth + RLS 적용 후 사용자별 접근 통제</li>
        </ul>
      </div>
      <div class="ops-policy backup">
        <div class="ops-policy-title"><span>백업 · 장애 대응</span><b>이중 보관</b></div>
        <ul>
          <li>자동: 앱이 열린 상태에서 매일 오전 9시 브라우저 백업 1회(최대 5개)</li>
          <li>정기: ‘전체 백업 내려받기’로 JSON 파일 생성</li>
          <li>보관: 내려받은 파일은 사내 D드라이브 지정 폴더에 별도 보관</li>
          <li>복구: Supabase 장애 시 JSON 복원으로 핵심 업무데이터 재구성</li>
        </ul>
      </div>
    </div>

    <div class="ops-caution"><span>운영 전 확인</span><p>현재 공용 비밀번호만으로는 Supabase 사용자를 식별할 수 없습니다. 원격 저장을 정식 운영하기 전 <b>Supabase Auth·RLS</b>와 <b>Cloudflare Worker 인증·R2 바인딩</b>을 모두 완료해야 합니다.</p></div>
  </section>

  <div class="grid g2">
    <div class="card">
      <div class="card-head"><h3>🔗 Supabase 연결 설정</h3></div>
      <div class="card-body">
        <div class="fld"><label>Project URL</label>
          <input class="inp" id="sbUrl" value="${esc(cfg?.url || '')}" placeholder="https://xxxxxxxx.supabase.co"></div>
        <div class="fld"><label>anon public key</label>
          <textarea class="inp" id="sbKey" style="min-height:80px;font-size:11.5px" placeholder="eyJhbGciOi...">${esc(cfg?.anonKey || '')}</textarea>
          <div class="help">anon key는 공개되어도 되는 키입니다. 실제 접근 통제는 Supabase의 <b>RLS(행 수준 보안) 정책</b>이 수행합니다.
            서비스 롤 키(service_role)는 <b>절대 여기에 넣지 마세요.</b><br>
            현재 공용 비밀번호는 Supabase 세션을 만들지 않으므로, Auth 전환 전에 연결정보만 입력하면 원격 저장이 거부될 수 있습니다.</div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn primary" id="sbSave">연결 저장 후 새로고침</button>
          <button class="btn" id="sbClear">연결 해제(로컬 모드)</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>🆔 전체 사용자 계정 (마스터 전용)</h3></div>
      <div class="card-body">
        ${usingSupabase
          ? '<div id="allAccounts" style="font-size:12.5px;color:var(--muted)">계정 목록을 불러오는 중…</div>'
          : '<div style="font-size:12.5px;color:var(--muted)">Supabase 연결 모드에서만 계정 목록을 조회할 수 있습니다.</div>'}
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="card-head"><h3>👤 접속 정보 및 권한</h3></div>
    <div class="card-body">
      <div class="tbl-wrap"><table class="tbl" style="min-width:0">
        <tbody>
          <tr><th style="width:150px">사용자</th><td>${esc(state.user?.name || '-')}</td></tr>
          <tr><th>권한</th><td>${esc(ROLES[state.user?.role]?.label || state.user?.role || '-')} — ${canEdit() ? '작성·수정 가능' : '읽기 전용'}${canDelete() ? ' · 삭제 가능' : ' · 삭제 불가'}</td></tr>
          <tr><th>인증 방식</th><td>${authMethod}</td></tr>
          <tr><th>저장 모드</th><td>${conn.mode === 'supabase' ? 'Supabase + 로컬 캐시' : '로컬(localStorage) 전용'}</td></tr>
          <tr><th>첨부파일 저장</th><td>${fileMode === 'r2' ? 'Cloudflare R2 (Worker API)' : '현재 브라우저 IndexedDB 전용'}</td></tr>
          ${canDelete() ? `<tr><th>시스템 버전<br><span style="font-size:10px;color:var(--faint)">마스터 전용</span></th><td>${esc(APP.version)}</td></tr>` : ''}
        </tbody></table></div>
      ${usingSupabase ? `<div class="help" style="margin-top:12px">${authHelp}</div>` : ''}
      <div class="help" style="margin-top:12px;display:${usingSupabase ? 'none' : 'block'}">
        <b>접속 방식</b> — 공용 비밀번호로 진입한 사용자는 모두 작성·수정할 수 있지만 삭제는 할 수 없습니다. 마스터 관리자 비밀번호로 접속한 사용자만 행·첨부·자동 백업을 삭제할 수 있습니다.<br>
        <b>⚠ 주의</b> — 비밀번호 해시는 앱 소스에 포함되어 있어 외부 유출을 막는 보안장치가 아닙니다.
        비밀번호를 바꾸려면 <code>js/core.js</code> 의 <code>GATE_HASH</code>(공용)와 <code>MASTER_GATE_HASH</code>(마스터)를 각각 교체하십시오.
        실제 데이터 접근 통제가 필요하면 Supabase 연결 후 RLS 정책으로 제한해야 합니다.</div>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <div class="card-head"><h3>🧾 변경 이력</h3></div>
    <div class="card-body">
      <p style="font-size:12px;color:var(--text-2);margin:0 0 12px;line-height:1.6">
        작성·수정·삭제한 사용자와 시각을 최근 100건까지 표시합니다. 공동 운영에서는 Supabase에 저장되어 모든 사용자가 같은 이력을 봅니다.</p>
      ${auditRows ? `<div class="tbl-wrap"><table class="tbl" style="min-width:0;font-size:12.5px"><thead><tr><th>시각</th><th>사용자</th><th>작업</th><th>대상</th></tr></thead><tbody>${auditRows}</tbody></table></div>` : '<div style="font-size:12.5px;color:var(--muted);padding:8px 0">아직 변경 이력이 없습니다.</div>'}
    </div>
  </div>`;
}

export function bindSettingsEvents(root, rerender) {
  const accEl = $('#allAccounts', root);
  if (accEl && conn.mode === 'supabase') {
    conn.client.from('shms_profiles').select('login_id,name,dept,role,created_at').order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) { accEl.innerHTML = `<div style="font-size:12.5px;color:var(--bad)">계정 목록을 불러오지 못했습니다: ${esc(error.message)}</div>`; return; }
        if (!data || !data.length) { accEl.innerHTML = '<div style="font-size:12.5px;color:var(--muted)">등록된 계정이 없습니다.</div>'; return; }
        accEl.innerHTML = '<div class="tbl-wrap"><table class="tbl" style="min-width:0;font-size:12.5px"><thead><tr><th>아이디</th><th>이름</th><th>부서</th><th>권한</th><th>가입일</th></tr></thead><tbody>'
          + data.map(p => `<tr><td>${esc(p.login_id || '-')}</td><td>${esc(p.name || '-')}</td><td>${esc(p.dept || '-')}</td><td>${esc(ROLES[p.role]?.label || p.role || '-')}</td><td>${esc((p.created_at || '').slice(0, 10))}</td></tr>`).join('')
          + '</tbody></table></div>';
      });
  }
  const save = $('#sbSave', root);
  if (save) save.addEventListener('click', () => {
    const url = $('#sbUrl', root).value.trim();
    const key = $('#sbKey', root).value.trim();
    if (!url || !key) { toast('URL과 anon key를 모두 입력하세요.', 'bad'); return; }
    if (key.length > 100 && key.includes('service_role')) { toast('service_role 키는 사용할 수 없습니다.', 'bad'); return; }
    setSupabaseConfig(url, key);
    toast('연결 정보를 저장했습니다. 새로고침합니다.', 'ok');
    setTimeout(() => location.reload(), 900);
  });
  const clear = $('#sbClear', root);
  if (clear) clear.addEventListener('click', () => {
    if (!confirmDel('Supabase 연결을 해제하고 로컬 모드로 전환할까요?')) return;
    setSupabaseConfig(null, null);
    setTimeout(() => location.reload(), 400);
  });
}

/* ============================================================
   9. 백업 (안전보건팀 전 직원 접근 가능 — 다운로드 전용)
   ============================================================ */
export function renderBackup() {
  const fileMode = attachmentStorageMode();
  return `
  <div class="banner">
    <div class="i">💾</div>
    <div><b>자료 백업</b> — 작성한 이행기록·문서·점검·개선조치를 JSON 파일로 내려받아 D드라이브 등 별도 위치에 보관하세요.
      <b>Supabase 쿼터 초과나 계정 문제에 대비한 이중 보관</b>은 안전보건팀 작업규칙의 필수 항목입니다.</div>
  </div>
  <div class="card">
    <div class="card-head"><h3>⬇️ 전체 백업 내려받기</h3></div>
    <div class="card-body">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="bkExport">⬇️ 전체 백업 내려받기</button>
      </div>
      <div style="margin-top:16px;font-size:12px;color:var(--muted);line-height:1.8">
        이행기록 ${Object.keys(state.records).length}건 · 문서 ${state.documents.length}건 ·
        점검 ${state.inspections.length}건 · 개선조치 ${state.capa.length}건 ·
        증빙 ${state.evidence.length}건 · 선임 ${state.org.length}건
      </div>
      ${fileMode === 'r2' ? '<div id="r2Usage" style="margin-top:10px;font-size:12px;color:var(--muted)">R2 공용 첨부 저장공간 사용량을 확인 중입니다.</div>' : ''}
      <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
        <h4 style="margin:0 0 10px;font-size:13.5px;font-weight:600">🔄 자동 백업 현황 (최근 5개)</h4>
        <p style="font-size:12px;color:var(--text-2);margin:0 0 12px;line-height:1.6">
          앱이 열려 있는 경우 매일 오전 9시에 한 번만 브라우저에 자동 백업됩니다 (최대 5개 보관, 이 PC에만 저장됨). 앱·PC가 꺼져 있으면 자동 실행되지 않으므로, 중요한 작업 후에는 위의 전체 백업 내려받기를 사용하세요. 복원은 <b>[설정 · 복원]</b> 화면(마스터 전용)에서 할 수 있습니다.</p>
        ${(() => {
          const bks = getBackups();
          if (!bks.length) return '<div style="font-size:12.5px;color:var(--muted);padding:8px 0">자동 백업이 아직 없습니다. 앱을 오전 9시에 열어 두면 생성됩니다. 중요한 자료는 전체 백업 내려받기를 사용하세요.</div>';
          return '<div class="tbl-wrap"><table class="tbl" style="min-width:0;font-size:12.5px"><thead><tr><th>시각</th><th>이행기록</th><th>문서</th><th>개선조치</th><th>점검</th></tr></thead><tbody>'
            + bks.map(b => {
              const dt = new Date(b.ts);
              const tStr = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')
                + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
              return '<tr><td>' + esc(tStr) + '</td><td>' + b.records + '</td><td>' + b.documents + '</td><td>' + b.capa + '</td><td>' + b.inspections + '</td></tr>';
            }).join('')
            + '</tbody></table></div>';
        })()}
      </div>
    </div>
  </div>`;
}

export function bindBackupEvents(root) {
  const usageEl = $('#r2Usage', root);
  if (usageEl) getAttachmentStorageUsage().then(usage => {
    if (!usage) { usageEl.textContent = 'R2 공용 첨부 저장공간 사용량을 확인할 수 없습니다.'; return; }
    const text = `R2 공용 첨부 저장공간: ${formatBytes(usage.totalBytes)} / ${formatBytes(usage.limitBytes)} (${usage.pct}%)`;
    usageEl.textContent = usage.warning ? `${text} · ⚠ ${usage.warning}` : text;
    if (usage.warning) usageEl.style.color = 'var(--bad)';
  });
  const ex = $('#bkExport', root);
  if (ex) ex.addEventListener('click', async () => {
    const attachmentStorage = await getAttachmentStorageUsage();
    const data = { exported_at: new Date().toISOString(), app: APP.short, version: APP.version,
      records: state.records, documents: state.documents, capa: state.capa,
      inspections: state.inspections, org: state.org, evidence: state.evidence,
      r2_attachment_storage: attachmentStorage,
      attachment_backup_note: '첨부 원본은 Cloudflare R2에 보관되며, 이 백업에는 첨부 목록·메타데이터와 저장공간 현황이 포함됩니다.' };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const d = new Date();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `안전보건관리체계_이행관리_백업_claude_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('백업 파일을 내려받았습니다.', 'ok');
  });
}

/* ============================================================
   10. 복원 (마스터 전용)
   ============================================================ */
export function renderRestore() {
  return `
  <div class="banner warn">
    <div class="i">🔄</div>
    <div><b>자료 복원</b> — 백업 파일이나 자동 백업 시점으로 현재 자료를 되돌립니다. <b>현재 작성된 자료가 덮어써지므로 마스터 관리자만 사용할 수 있습니다.</b></div>
  </div>
  <div class="card">
    <div class="card-head"><h3>⬆️ 백업 파일로 복원</h3></div>
    <div class="card-body">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="bkImportBtn">⬆️ 백업 파일 복원</button>
        <input type="file" id="bkImport" accept="application/json" style="display:none">
      </div>
      <div style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px">
        <h4 style="margin:0 0 10px;font-size:13.5px;font-weight:600">🕒 자동 백업 시점으로 복원 (최근 5개)</h4>
        ${(() => {
          const bks = getBackups();
          if (!bks.length) return '<div style="font-size:12.5px;color:var(--muted);padding:8px 0">자동 백업이 아직 없습니다.</div>';
          return '<div class="tbl-wrap"><table class="tbl" style="min-width:0;font-size:12.5px"><thead><tr><th>시각</th><th>이행기록</th><th>문서</th><th>개선조치</th><th>점검</th><th></th></tr></thead><tbody>'
            + bks.map(b => {
              const dt = new Date(b.ts);
              const tStr = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')
                + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
              return '<tr><td>' + esc(tStr) + '</td><td>' + b.records + '</td><td>' + b.documents + '</td><td>' + b.capa + '</td><td>' + b.inspections + '</td>'
                + '<td style="white-space:nowrap"><button class="btn primary" style="font-size:11px;padding:3px 8px" data-bk-restore="' + esc(b.key) + '">복원</button> '
                + '<button class="btn" style="font-size:11px;padding:3px 8px" data-bk-del="' + esc(b.key) + '">삭제</button></td></tr>';
            }).join('')
            + '</tbody></table></div>';
        })()}
      </div>
    </div>
  </div>`;
}

export function bindRestoreEvents(root, rerender) {
  const ib = $('#bkImportBtn', root), inp = $('#bkImport', root);
  if (ib && inp) {
    ib.addEventListener('click', () => inp.click());
    inp.addEventListener('change', async e => {
      const f = e.target.files?.[0]; if (!f) return;
      if (!confirmDel('현재 작성된 자료를 백업 파일 내용으로 덮어씁니다. 계속할까요?')) { inp.value = ''; return; }
      try {
        const data = JSON.parse(await f.text());
        ['records', 'documents', 'capa', 'inspections', 'org', 'evidence'].forEach(k => {
          if (data[k]) state[k] = data[k];
        });
        localStorage.setItem('shms.data.records', JSON.stringify(state.records));
        ['documents', 'capa', 'inspections', 'org', 'evidence'].forEach(k =>
          localStorage.setItem('shms.data.' + k, JSON.stringify(state[k])));
        toast('백업을 복원했습니다.', 'ok');
        rerender();
      } catch (err) {
        toast('복원 실패: ' + err.message, 'bad');
      }
      inp.value = '';
    });
  }

  root.querySelectorAll('[data-bk-restore]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.bkRestore;
      if (!confirmDel('현재 데이터를 이 백업 시점으로 되돌립니다. 계속할까요?')) return;
      if (restoreBackup(key)) { toast('자동 백업을 복원했습니다.', 'ok'); rerender(); }
      else toast('복원 실패', 'bad');
    });
  });
  root.querySelectorAll('[data-bk-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
      const key = btn.dataset.bkDel;
      if (!confirmDel('이 백업을 삭제할까요?')) return;
      if (!deleteBackup(key)) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
      toast('백업을 삭제했습니다.', 'ok');
      rerender();
    });
  });
}

/* ============================================================
   11. 메모장 (심사결과·업무 메모)
   ============================================================ */
const MEMO_CATS = ['심사', '점검', '회의', '전화·구두 지시', '기타'];

export function renderMemo() {
  const list = [...state.memos].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

  return `
  <div class="banner">
    <div class="i">📝</div>
    <div><b>메모장</b> — 심사·점검 중 오간 이야기, 지적 받은 내용, 확인이 필요한 사항 등을 날짜별로 자유롭게 기록합니다.
    정식 문서가 아니라도 나중에 찾아보기 쉽도록 남겨 두는 업무 메모입니다.</div>
  </div>

  <div class="toolbar">
    <div style="flex:1"></div>
    ${canEdit() ? `<button class="btn primary" id="memoNew">＋ 메모 작성</button>` : ''}
  </div>

  ${list.length === 0
    ? `<div class="card"><div class="empty"><div class="e">📝</div><div class="t">작성된 메모가 없습니다</div>
        <div class="s">심사결과나 확인해야 할 내용을 메모로 남겨 두세요.</div></div></div>`
    : `<div class="tbl-wrap"><table class="tbl">
        <thead><tr><th style="width:100px">일자</th><th style="width:110px">구분</th><th>제목·내용</th><th style="width:100px">작성자</th><th style="width:60px"></th></tr></thead>
        <tbody>${list.map(m => `
          <tr data-memo="${esc(m.id)}" style="cursor:pointer">
            <td>${fmtDate(m.date)}</td>
            <td><span class="tag">${esc(m.category || '기타')}</span></td>
            <td><div class="cell-title">${esc(m.title || '(제목 없음)')}</div>
                <div class="cell-sub">${esc((m.content || '').slice(0, 80))}${(m.content || '').length > 80 ? '…' : ''}</div></td>
            <td>${esc(m.updated_by || '-')}</td>
            <td>${canDelete() ? `<button class="btn sm" data-del-memo="${esc(m.id)}">삭제</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`}`;
}

function openMemoDrawer(rec, rerender) {
  const isNew = !rec;
  const m = rec || { id: uid('memo'), date: today(), category: '심사', title: '', content: '' };
  openDrawer({
    code: isNew ? '메모 신규 작성' : `메모 · ${fmtDate(m.date)}`,
    title: isNew ? '메모 작성' : (m.title || '메모'),
    editable: canEdit(),
    body: `
      <div class="fld-row">
        <div class="fld"><label>일자</label><input class="inp" type="date" id="mDate" value="${esc(m.date)}"></div>
        <div class="fld"><label>구분</label>
          <select class="inp" id="mCat">${MEMO_CATS.map(c => `<option ${m.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="fld"><label>제목 (선택)</label><input class="inp" id="mTitle" value="${esc(m.title)}" placeholder="예) 2026년 상반기 내부심사 지적사항"></div>
      <div class="fld"><label>내용</label><textarea class="inp" id="mContent" style="min-height:220px" placeholder="심사 중 확인된 내용, 심사원 코멘트, 후속 확인 사항 등을 자유롭게 적으세요.">${esc(m.content)}</textarea></div>`,
    async onSave(root) {
      const next = { ...m,
        date: $('#mDate', root).value, category: $('#mCat', root).value,
        title: $('#mTitle', root).value.trim(), content: $('#mContent', root).value.trim() };
      if (!next.content) { toast('내용을 입력하세요.', 'bad'); return; }
      showSpinner('저장 중…');
      const res = await saveRow('memos', next);
      hideSpinner();
      toast(res.ok ? '메모를 저장했습니다.' : `로컬 저장됨 · 동기화 실패: ${res.error}`, res.ok ? 'ok' : 'bad');
      closeDrawer(); rerender();
    }
  });
}

export function bindMemoEvents(root, rerender) {
  const nb = $('#memoNew', root); if (nb) nb.addEventListener('click', () => openMemoDrawer(null, rerender));
  root.addEventListener('click', async e => {
    const del = e.target.closest('[data-del-memo]');
    if (del) { e.stopPropagation();
      if (!canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
      if (confirmDel('이 메모를 삭제할까요?')) { const res = await deleteRow('memos', del.dataset.delMemo); toast(res.ok ? '삭제했습니다.' : res.error, res.ok ? 'ok' : 'bad'); rerender(); }
      return; }
    const row = e.target.closest('[data-memo]');
    if (row) openMemoDrawer(state.memos.find(x => x.id === row.dataset.memo), rerender);
  });
}
