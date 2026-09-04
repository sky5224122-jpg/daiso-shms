/* ============================================================
   views-core.js — 대시보드 / 법령·ISO 이행관리 화면 / 수기 작성 드로어
   ============================================================ */

import {
  MSSA_ITEMS, OSHA_ITEMS, ISO_ITEMS, ALL_ITEMS, FRAMEWORKS,
  STATUS, STATUS_ORDER, CYCLES, DOC_MASTER
} from './data/frameworks.js?v=20260904_body';
import {
  $, $$, el, esc, state, getRecord, saveRecord, deleteRecord, progressOf, dueSoon, docStats, APP,
  canEdit, canDelete, halfLabel, fmtDate, today, toast, showSpinner, hideSpinner, uid,
  saveRow, deleteRow,
  attachmentUrl, formatBytes, prepareAttachmentFile, saveAttachmentFile, viewAttachment, deleteAttachmentFile
} from './core.js?v=20260904_body';

const AUDIT_RESULTS = ['적합', '경미 부적합', '중대 부적합', '관찰사항'];

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

/* ---------------- 경영진 보고서 ---------------- */

function executiveRiskLabel(all, critical, due, overdueCapa) {
  if (critical.length || overdueCapa) return { cls: 'urgent', label: '즉시 경영진 관여 필요', note: '중대 의무가 완료되지 않았거나(이행중·보완필요·미이행) 기한 초과 개선조치가 확인되었습니다.' };
  if (due.length || all.pct < 80) return { cls: 'watch', label: '중점 관리 필요', note: '기한 임박 항목과 이행 수준을 경영진 차원에서 점검할 필요가 있습니다.' };
  return { cls: 'stable', label: '관리 체계 안정', note: '등록된 이행 현황 기준으로 중대 우선조치 신호가 확인되지 않았습니다.' };
}

function executiveReportHtml({ half, all, mssa, osha, iso, docs, critical, due, openCapa, overdueCapa, halfDone, halfCycleItems }) {
  const risk = executiveRiskLabel(all, critical, due, overdueCapa);
  const reportDate = new Intl.DateTimeFormat('ko-KR', { year:'numeric', month:'long', day:'numeric' }).format(new Date());
  const priority = [
    ...critical.map(({ i, r }) => ({ code:i.code, title:i.title, status:r.status, note:'중대 의무 항목', due:r.due_date })),
    ...due.filter(({ it }) => !critical.some(({ i }) => i.id === it.id)).map(({ it, r }) => ({ code:it.code, title:it.title, status:r.status, note:'기한 임박', due:r.due_date }))
  ].slice(0, 5);
  const actionLine = critical.length
    ? '중대 의무 미이행·보완 항목에 대한 책임자·기한을 확정하고, 다음 경영진 보고 시 조치 완료 증빙을 확인해 주십시오.'
    : overdueCapa
      ? '기한이 지난 개선조치의 원인과 완료계획을 확인하고, 책임자별 회수계획을 승인해 주십시오.'
      : due.length
        ? '기한 임박 의무의 이행계획과 증빙 확보 여부를 정례적으로 점검해 주십시오.'
        : '정기 점검과 증빙 갱신을 지속하고, 다음 반기 이행상태 평가 시 결과를 확인해 주십시오.';

  return `
    <article class="exec-report" id="execReport" aria-label="대표이사 보고용 안전보건관리체계 이행 보고서">
      <div class="exec-report-head">
        <div class="exec-report-brand"><span>ASUNG DAISO</span><b>SAFETY · HEALTH GOVERNANCE</b></div>
        <div class="exec-report-period">${esc(halfLabel(half))} · 대표이사 보고용</div>
        <div class="exec-report-title">
          <div><span class="exec-report-kicker">EXECUTIVE BRIEFING</span><h2>안전보건관리체계 이행 종합 보고</h2><p>중대재해처벌법 · 산업안전보건법 · ISO 45001 통합 관리 현황</p></div>
          <div class="exec-report-date">보고일<br><b>${esc(reportDate)}</b></div>
        </div>
      </div>

      <div class="exec-risk ${risk.cls}">
        <div class="exec-risk-label">경영진 판단 신호</div><strong>${esc(risk.label)}</strong><p>${esc(risk.note)}</p>
        <div class="exec-risk-score"><span>통합 이행지수</span><b>${all.pct}<small>점</small></b></div>
      </div>

      <section class="exec-section">
        <div class="exec-section-head"><span>01</span><div><h3>경영진 요약</h3><p>이번 반기 시스템에 등록된 이행 기록을 기준으로 자동 집계한 현황입니다.</p></div></div>
        <div class="exec-summary-grid">
          <div class="exec-summary-main"><span>전체 평가대상</span><strong>${all.total}<small>개 의무·요구사항</small></strong><div class="exec-progress"><i style="width:${Math.max(2, all.pct)}%"></i></div><p>이행완료 ${all.counts.done}건 · 이행중 ${all.counts.progress}건 · 보완필요 ${all.counts.hold}건 · 미이행 ${all.counts.none}건</p></div>
          <div class="exec-mini"><span>중대 우선관리</span><strong>${critical.length}<small>건</small></strong><p>중대 의무 미이행·보완</p></div>
          <div class="exec-mini"><span>기한 임박</span><strong>${due.length}<small>건</small></strong><p>30일 이내 관리 필요</p></div>
          <div class="exec-mini"><span>진행중 CAPA</span><strong>${openCapa.length}<small>건</small></strong><p>${overdueCapa ? `기한 초과 ${overdueCapa}건` : '기한 초과 없음'}</p></div>
        </div>
      </section>

      <section class="exec-section">
        <div class="exec-section-head"><span>02</span><div><h3>법령·표준별 이행 수준</h3><p>법적 의무와 국제표준 요구사항을 동일 기준으로 모니터링합니다.</p></div></div>
        <div class="exec-frameworks">
          ${[
            ['중대재해처벌법', '시행령 제4조·제5조 핵심 의무', mssa, 'red'],
            ['산업안전보건법', '주요 법정 의무 조항', osha, 'blue'],
            ['ISO 45001', '국제표준 4~10장 요구사항', iso, 'green']
          ].map(([name, desc, stat, cls]) => `<div class="exec-framework ${cls}"><div><span>${esc(name)}</span><p>${esc(desc)}</p></div><strong>${stat.pct}<small>%</small></strong><div class="exec-progress"><i style="width:${Math.max(2, stat.pct)}%"></i></div><em>완료 ${stat.counts.done} · 보완/미이행 ${stat.counts.hold + stat.counts.none}</em></div>`).join('')}
        </div>
      </section>

      <section class="exec-section exec-two-col">
        <div>
          <div class="exec-section-head"><span>03</span><div><h3>우선 조치 및 의사결정 요청</h3><p>위험 신호에 따라 즉시 확인이 필요한 과제입니다.</p></div></div>
          <div class="exec-action-callout"><b>대표이사 요청사항</b><p>${esc(actionLine)}</p></div>
          ${priority.length ? `<ol class="exec-priority">${priority.map((x, n) => `<li><span>${String(n + 1).padStart(2, '0')}</span><div><b>${esc(x.code)} · ${esc(x.title)}</b><p>${esc(x.note)}${x.due ? ` · 기한 ${esc(fmtDate(x.due))}` : ''}</p></div>${statusBadge(x.status)}</li>`).join('')}</ol>` : `<div class="exec-clear"><b>✓</b><div><strong>즉시 상정할 우선 조치가 없습니다</strong><p>등록된 현황상 중대 의무 미이행·기한 임박 항목이 없습니다. 정기 점검과 증빙 최신화는 계속 필요합니다.</p></div></div>`}
        </div>
        <div>
          <div class="exec-section-head"><span>04</span><div><h3>운영 기반 및 관리지표</h3><p>문서·점검·개선조치의 실행력을 함께 관리합니다.</p></div></div>
          <div class="exec-ops-grid">
            <div><span>문서체계 구축률</span><strong>${docs.pct}%</strong><p>승인 ${docs.approved} / 전체 ${docs.total}</p></div>
            <div><span>반기 점검 완료</span><strong>${halfDone}/${halfCycleItems.length}</strong><p>반기 1회 이상 점검 의무</p></div>
            <div><span>개선조치 종결</span><strong>${state.capa.length - openCapa.length}/${state.capa.length}</strong><p>효과성 검증 포함 관리</p></div>
            <div><span>증빙 등록</span><strong>${state.evidence.length}<small>건</small></strong><p>실행 증빙 자료함 기준</p></div>
          </div>
          <div class="exec-governance"><b>관리 원칙</b><p>본 보고서는 시스템에 등록된 이행·점검·개선조치·증빙 자료를 반기 기준으로 집계합니다. 법률 적합성의 최종 판단은 원본 증빙과 현장 확인을 거쳐 별도로 수행합니다.</p></div>
        </div>
      </section>

      <footer class="exec-report-foot"><span>자료 기준: ${esc(halfLabel(half))} · ${esc(APP.name)}</span><span>본 문서는 경영진 보고 목적의 현황 요약본입니다.</span></footer>
    </article>`;
}

/* ---------------- Supabase 통합 분석 보고서 ----------------
   서버에 모인 이행·CAPA·문서·증빙 데이터를 한 번에 해석한다.
------------------------------------------------------------- */
function improvementGuide(item, record) {
  const missingEvidence = !String(record.evidence || record.userEvidence || '').trim() && !(record.attachments || []).length;
  if (record.status === 'none') return '담당자를 지정하고 이행기한을 등록한 뒤, 요구사항에 맞는 실행계획과 증빙자료를 확보하세요.';
  if (record.status === 'hold') return '미흡사항의 원인을 확인해 CAPA로 등록하고, 조치 담당자·완료기한·효과성 검증까지 관리하세요.';
  if (missingEvidence) return '실행 내용은 있으나 증빙이 부족합니다. 점검표·결재문서·사진·회의록 중 해당 자료를 첨부하세요.';
  if (!record.owner) return '이행 책임자가 지정되지 않았습니다. 담당 부서 또는 담당자를 지정하고 점검 주기를 확인하세요.';
  return `${item.cycle || '정기'} 점검 주기에 맞춰 이행 현황과 증빙의 최신성을 확인하세요.`;
}

function analyticsReportHtml({ half, all, mssa, osha, iso, docs, critical, due, openCapa, overdueCapa }) {
  const records = ALL_ITEMS.map(i => ({ item:i, record:getRecord(i.id, half) }));
  const statusCounts = ['done','progress','hold','none'].map(key => ({ key, label:(STATUS[key] || {}).label || key, n:records.filter(x => x.record.status === key).length }));
  const identified = records.filter(({ record }) => ['none','hold'].includes(record.status) || String(record.findings || '').trim());
  const evidenceGaps = records.filter(({ record }) => !['none'].includes(record.status) && !String(record.evidence || record.userEvidence || '').trim() && !(record.attachments || []).length);
  const ownerGaps = records.filter(({ record }) => !['none','done'].includes(record.status) && !String(record.owner || '').trim());
  const highPriority = [...identified]
    .sort((a, b) => (b.item.severity === 'critical') - (a.item.severity === 'critical'))
    .slice(0, 12);
  const capaByStatus = ['open','analyzing','acting','verifying','closed'].map(key => ({ key, n:state.capa.filter(c => c.status === key).length }));
  const frameworkStats = [
    ['중대재해처벌법', mssa, '#d92d20'], ['산업안전보건법', osha, '#2b6cb0'], ['ISO 45001', iso, '#0f9d76']
  ];
  const dataUpdated = records.filter(({ record }) => record.updated_at).length;
  const totalCapa = state.capa.length;
  const actionSummary = critical.length || overdueCapa
    ? '즉시: 중대 미이행 또는 기한 초과 개선조치의 책임자·완료기한을 확정하고 경영진 주간 점검 대상으로 지정하세요.'
    : identified.length
      ? '우선: 미이행·보완 필요 항목을 CAPA로 전환하고, 각 항목에 담당자·기한·증빙을 연결하세요.'
      : '유지: 정기점검과 증빙 갱신을 지속하며, 변경사항 발생 시 이행기록을 즉시 업데이트하세요.';

  return `
  <article class="analytics-report" id="analyticsReport" aria-label="Supabase 통합 통계 및 개선 분석 보고서">
    <header class="analytics-head">
      <div><span>SUPABASE DATA INSIGHT</span><h2>통합 통계 · 미흡사항 · 개선 실행 분석</h2><p>${esc(halfLabel(half))} 기준, 공동 서버에 저장된 이행기록·점검·문서·개선조치·증빙을 분석합니다.</p></div>
      <div class="analytics-score"><span>통합 이행지수</span><b>${all.pct}<small>점</small></b></div>
    </header>
    <section class="analytics-section">
      <div class="analytics-section-title"><span>01</span><div><h3>경영 통계 요약</h3><p>법령별 이행 현황과 실행관리 지표를 한 번에 확인합니다.</p></div></div>
      <div class="analytics-kpis">
        <div><span>등록 이행기록</span><strong>${dataUpdated}<small>/${all.total}개</small></strong><p>서버 동기화 대상</p></div>
        <div><span>식별된 미흡사항</span><strong>${identified.length}<small>건</small></strong><p>미이행·보완 필요</p></div>
        <div><span>증빙 보강 필요</span><strong>${evidenceGaps.length}<small>건</small></strong><p>실행 기록 대비 증빙 공란</p></div>
        <div><span>기한 초과 CAPA</span><strong>${overdueCapa}<small>건</small></strong><p>진행중 ${openCapa.length}건</p></div>
      </div>
      <div class="analytics-split">
        <div class="analytics-panel"><h4>법령·표준별 이행률</h4>${frameworkStats.map(([name, stat, color]) => `<div class="analytics-bar"><div><b>${esc(name)}</b><span>${stat.counts.done} 완료 / ${stat.total} 대상</span></div><div class="bar"><i style="width:${Math.max(2,stat.pct)}%;background:${color}"></i></div><strong>${stat.pct}%</strong></div>`).join('')}</div>
        <div class="analytics-panel"><h4>이행상태 분포</h4>${statusCounts.map(s => `<div class="analytics-status"><span>${esc(s.label)}</span><b>${s.n}건</b><i style="width:${all.total ? Math.round(s.n/all.total*100) : 0}%"></i></div>`).join('')}</div>
      </div>
    </section>
    <section class="analytics-section analytics-two-col">
      <div>
        <div class="analytics-section-title"><span>02</span><div><h3>미흡사항 우선순위 및 개선 방법</h3><p>중대성·이행상태·증빙 여부를 기준으로 우선 검토 대상을 정리합니다.</p></div></div>
        <div class="analytics-command"><b>권고 실행 방향</b><p>${esc(actionSummary)}</p><button class="btn primary" data-goto="capa">개선조치(CAPA) 관리로 이동</button></div>
        ${highPriority.length ? `<div class="analytics-gap-list">${highPriority.map(({item, record}, idx) => `<div class="analytics-gap ${item.severity === 'critical' ? 'critical' : ''}"><div class="analytics-no">${String(idx+1).padStart(2,'0')}</div><div><div class="analytics-gap-title"><b>${esc(item.code)} · ${esc(item.title)}</b>${statusBadge(record.status)}</div><p><strong>확인 내용:</strong> ${esc(record.findings || record.implementation || '이행현황 미기록')}</p><p><strong>개선 방법:</strong> ${esc(improvementGuide(item, record))}</p><small>${esc(item.requirement || '')}</small></div></div>`).join('')}</div>` : `<div class="exec-clear"><b>✓</b><div><strong>현재 등록 기준 미이행·보완 필요 항목이 없습니다</strong><p>정기 점검과 증빙 보강 현황을 계속 확인하세요.</p></div></div>`}
      </div>
      <div>
        <div class="analytics-section-title"><span>03</span><div><h3>개선조치 실행력</h3><p>CAPA의 원인분석·조치·효과검증 진행 상태입니다.</p></div></div>
        <div class="analytics-panel analytics-capa"><h4>CAPA 상태별 현황</h4>${capaByStatus.map(s => `<div><span>${esc({open:'접수',analyzing:'원인분석',acting:'조치중',verifying:'효과검증',closed:'종결'}[s.key])}</span><b>${s.n}건</b></div>`).join('')}<hr><p>종결률 <b>${totalCapa ? Math.round((totalCapa-openCapa.length)/totalCapa*100) : 0}%</b> · 전체 ${totalCapa}건</p></div>
        <div class="analytics-panel"><h4>관리 누락 신호</h4><ul class="analytics-alerts"><li><b>${ownerGaps.length}건</b> 진행·보완 항목의 담당자 미지정</li><li><b>${evidenceGaps.length}건</b> 이행기록의 증빙 공란</li><li><b>${due.length}건</b> 30일 이내 이행기한 도래</li><li><b>${docs.total-docs.approved}건</b> 문서체계 승인 전 상태</li></ul></div>
      </div>
    </section>
    <footer class="analytics-foot">자료 기준: Supabase 공동 데이터 · ${esc(halfLabel(half))} · 이 분석은 등록된 정보의 관리 우선순위를 보여주며 법률 적합성의 최종 판단은 원본 증빙과 현장 확인이 필요합니다.</footer>
  </article>`;
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
    .filter(({ r }) => !['done', 'na'].includes(r.status));

  const due = dueSoon(30, half);
  const openCapa = state.capa.filter(c => c.status !== 'closed');
  const recent = ALL_ITEMS
    .map(i => ({ i, r: getRecord(i.id, half) }))
    .filter(({ r }) => r.updated_at)
    .sort((a, b) => String(b.r.updated_at).localeCompare(String(a.r.updated_at)))
    .slice(0, 8);

  const halfCycleItems = ALL_ITEMS.filter(i => i.cycle === '반기 1회');
  const halfDone = halfCycleItems.filter(i => getRecord(i.id, half).status === 'done').length;
  const overdueCapa = openCapa.filter(c => c.due_date && c.due_date < new Date().toISOString().slice(0, 10)).length;

  return `
  <div class="banner">
    <div class="i">🏛️</div>
    <div><b>${esc(halfLabel(half))} 이행 현황</b> — 중대재해처벌법 시행령 제4조·제5조, 산업안전보건법, ISO 45001:2018 요구사항을
    한 화면에서 관리합니다. 각 조항 카드를 클릭하면 <b>이행 현황·담당자·증빙을 직접 작성</b>할 수 있고, 작성 즉시 이행률에 반영됩니다.</div>
  </div>

  <section class="exec-launch" aria-label="경영진 보고서">
    <div class="exec-launch-mark">CEO</div>
    <div class="exec-launch-copy"><span>EXECUTIVE REPORTING</span><strong>대표이사 보고용 안전보건관리체계 종합 보고서</strong><p>${esc(halfLabel(half))} 기준 핵심 리스크·이행 수준·의사결정 요청사항을 자동으로 정리합니다.</p></div>
    <div class="exec-launch-actions"><button class="btn primary" id="execReportToggle">경영 보고서 보기</button><button class="btn" id="analyticsReportToggle">통계 · 개선 분석</button><button class="btn" id="execReportPrint">PDF 인쇄 · 저장</button></div>
  </section>

  ${executiveReportHtml({ half, all, mssa, osha, iso, docs, critical, due, openCapa, overdueCapa, halfDone, halfCycleItems })}
  ${analyticsReportHtml({ half, all, mssa, osha, iso, docs, critical, due, openCapa, overdueCapa })}

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
    <span class="n">이행 현황 레이더 · 조항 4~10장</span></div>
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
  </div>

  <div class="sec-t" style="margin-top:28px"><h2>관련 시스템 바로가기</h2><div class="l"></div>
    <span class="n">위험성평가 · 비상대응훈련 앱</span></div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
    ${[
      { label:'위험성평가 v1', sub:'마스터', icon:'📋', url:'https://asung-daiso-risk-app-master.web.app' },
      { label:'위험성평가 v2', sub:'', icon:'📋', url:'https://asung-daiso-risk-v2.web.app' },
      { label:'위험성평가 v3', sub:'', icon:'📋', url:'https://asung-daiso-risk-v3.web.app' },
      { label:'위험성평가 v4', sub:'', icon:'📋', url:'https://asung-daiso-risk-v4.web.app' },
      { label:'위험성평가 v5', sub:'', icon:'📋', url:'https://asung-daiso-risk-v5.web.app' },
      { label:'위험성평가 v6', sub:'', icon:'📋', url:'https://asung-daiso-risk-v6.web.app' },
      { label:'위험성평가 v7', sub:'', icon:'📋', url:'https://asung-daiso-risk-v7.web.app' },
      { label:'비상대응훈련', sub:'', icon:'🚨', url:'https://asung-daiso-emergency-training.web.app' }
    ].map(a => `<a href="${a.url}" target="_blank" rel="noopener" class="card" style="text-decoration:none;cursor:pointer;text-align:center;padding:16px 8px;transition:box-shadow .15s">
      <div style="font-size:24px;margin-bottom:4px">${a.icon}</div>
      <div style="font-weight:800;font-size:12.5px;color:var(--fg)">${a.label}</div>
      ${a.sub ? `<div style="font-size:10.5px;color:var(--faint);margin-top:1px">${a.sub}</div>` : ''}
    </a>`).join('')}
  </div>`;
}

export function bindDashboardEvents(root, openItem) {
  root.addEventListener('click', e => {
    const toggle = e.target.closest('#execReportToggle');
    if (toggle) {
      const report = $('#execReport', root);
      report?.classList.toggle('is-open');
      const opened = report?.classList.contains('is-open');
      toggle.textContent = opened ? '경영 보고서 닫기' : '경영 보고서 보기';
      if (opened) report.scrollIntoView({ behavior:'smooth', block:'start' });
      return;
    }
    const analyticsToggle = e.target.closest('#analyticsReportToggle');
    if (analyticsToggle) {
      const report = $('#analyticsReport', root);
      report?.classList.toggle('is-open');
      const opened = report?.classList.contains('is-open');
      analyticsToggle.textContent = opened ? '통계 · 개선 분석 닫기' : '통계 · 개선 분석';
      if (opened) report.scrollIntoView({ behavior:'smooth', block:'start' });
      return;
    }
    if (e.target.closest('#execReportPrint')) {
      const report = $('#execReport', root);
      report?.classList.add('is-open');
      document.body.classList.add('print-executive');
      window.print();
      return;
    }
    const g = e.target.closest('[data-goto]');
    if (g) { location.hash = '#/' + g.dataset.goto; return; }
    const it = e.target.closest('[data-item]');
    if (it) openItem(it.dataset.item);
  });
  window.addEventListener('afterprint', () => document.body.classList.remove('print-executive'), { once:true });
}

/* ---------------- 법령/ISO 이행관리 목록 ---------------- */

const listFilter = { q: '', status: 'all', group: 'all', hideNa: true };

export function renderCompliance(fw) {
  const F = FRAMEWORKS[fw];
  const items = F.items;
  const half = state.half;
  const p = progressOf(items, half);
  const groups = [...new Set(items.map(i => i.group))];

  const filtered = items.filter(i => {
    const r = getRecord(i.id, half);
    if (listFilter.hideNa && listFilter.status !== 'na' && (r.status || 'none') === 'na') return false;
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
    <b>이행 현황·담당자·증빙자료·미흡사항</b>을 직접 입력해 주세요. 입력한 내용은 그대로 이행 증빙으로 출력됩니다.</div>
  </div>

  ${fw === 'iso' ? auditOverviewSectionHtml() : ''}

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
    <label class="hide-na-toggle" title="해당없음 항목을 목록에서 숨깁니다">
      <input type="checkbox" id="cHideNa" ${listFilter.hideNa ? 'checked' : ''}><span>해당없음 숨기기</span>
    </label>
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

/* ---------------- 심사 개요 (ISO 요구사항 관리 화면 전용) ---------------- */
function auditOverviewSectionHtml() {
  const list = [...state.auditOverview].sort((a, b) => String(b.audit_date || '').localeCompare(String(a.audit_date || '')));
  return `
  <div class="card" style="margin-bottom:18px">
    <div class="card-head" style="display:flex;align-items:center;gap:10px">
      <h3 style="margin:0">🗒️ 심사 개요</h3>
      <div style="flex:1"></div>
      ${canEdit() ? `<button class="btn primary" id="auditOvNew">＋ 심사 개요 등록</button>` : ''}
    </div>
    <div class="card-body">
      ${list.length === 0
        ? `<div style="font-size:12.5px;color:var(--muted);padding:8px 0">등록된 심사 개요가 없습니다. 심사실시일·심사자·심사내용·심사결과를 등록해 두면 이 화면에서 바로 확인할 수 있습니다.</div>`
        : `<div class="tbl-wrap"><table class="tbl" style="min-width:0">
            <thead><tr><th style="width:110px">심사실시일</th><th style="width:120px">심사자</th><th style="width:110px">심사결과</th><th>심사 내용</th><th style="width:60px"></th></tr></thead>
            <tbody>${list.map(a => `
              <tr data-audit-ov="${esc(a.id)}" style="cursor:pointer">
                <td>${fmtDate(a.audit_date)}</td>
                <td>${esc(a.auditor || '-')}</td>
                <td><span class="tag ${a.result === '적합' ? '' : 'law'}">${esc(a.result || '-')}</span></td>
                <td><div class="cell-sub">${esc((a.content || '').slice(0, 80))}${(a.content || '').length > 80 ? '…' : ''}</div></td>
                <td>${canDelete() ? `<button class="btn sm" data-del-audit-ov="${esc(a.id)}">삭제</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`}
    </div>
  </div>`;
}

function openAuditOverviewDrawer(rec, rerender) {
  const isNew = !rec;
  const a = rec || { id: uid('auditov'), audit_date: today(), auditor: '', result: '적합', content: '', half: state.half };
  openDrawer({
    code: isNew ? '심사 개요 신규 등록' : `심사 개요 · ${fmtDate(a.audit_date)}`,
    title: isNew ? '심사 개요 등록' : (a.auditor ? `${a.auditor} 심사` : '심사 개요'),
    editable: canEdit(),
    body: `
      <div class="fld-row">
        <div class="fld"><label>심사실시일</label><input class="inp" type="date" id="aoDate" value="${esc(a.audit_date)}"></div>
        <div class="fld"><label>심사결과</label>
          <select class="inp" id="aoResult">${AUDIT_RESULTS.map(r => `<option ${a.result === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      </div>
      <div class="fld"><label>심사자</label><input class="inp" id="aoAuditor" value="${esc(a.auditor)}" placeholder="예) 한국품질재단 김OO 심사원"></div>
      <div class="fld"><label>심사 내용</label><textarea class="inp" id="aoContent" style="min-height:180px" placeholder="심사 범위, 지적사항, 심사원 의견 등을 기재합니다.">${esc(a.content)}</textarea></div>`,
    async onSave(root) {
      const next = { ...a,
        audit_date: $('#aoDate', root).value, result: $('#aoResult', root).value,
        auditor: $('#aoAuditor', root).value.trim(), content: $('#aoContent', root).value.trim() };
      if (!next.auditor) { toast('심사자를 입력하세요.', 'bad'); return; }
      showSpinner('저장 중…');
      const res = await saveRow('auditOverview', next);
      hideSpinner();
      toast(res.ok ? '심사 개요를 저장했습니다.' : `로컬 저장됨 · 동기화 실패: ${res.error}`, res.ok ? 'ok' : 'bad');
      closeDrawer(); rerender();
    }
  });
}

function itemCard(i, half) {
  const r = getRecord(i.id, half);
  const s = STATUS[r.status] || STATUS.none;
  const linkedDocs = (i.docRefs || []).map(no => DOC_MASTER.find(d => d.docNo === no)).filter(Boolean);
  const pct = s.score ?? 0;

  // 자료 보유 현황 — 사용자 편집값이 있으면 그것을, 없으면 기준 데이터를 센다
  const nDocs = (r.userDocs ? r.userDocs.split('\n') : (i.requiredDocs || [])).filter(x => x.trim()).length;
  const nEvid = (r.userEvidence ? r.userEvidence.split('\n') : (i.evidenceFiles || [])).filter(x => x.trim()).length;
  const nFile = (r.attachments || []).length;
  const hasStatus = !!(r.userStatus || i.companyStatus);

  const overdue = r.due_date && r.due_date < new Date().toISOString().slice(0, 10) && r.status !== 'done';

  return `
  <div class="item ${s.itemCls} f-${i.framework}" data-item="${esc(i.id)}">
    <div class="item-rail"></div>

    <div class="item-head">
      <span class="item-code">${esc(i.code)}</span>
      <div class="item-headmain">
        <div class="item-title">${esc(i.title)}</div>
        <div class="item-group">${esc(i.group)}</div>
      </div>
      <div class="item-badges">
        ${i.severity === 'critical' ? '<span class="pill-crit">핵심의무</span>' : ''}
        ${statusBadge(r.status)}
      </div>
    </div>

    <div class="item-gauge"><i class="${pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'bad'}" style="width:${Math.max(3, pct)}%"></i></div>

    <div class="item-body">
      <div class="item-block">
        <div class="item-block-t"><span class="ic">⚖️</span>법령 요구사항</div>
        <div class="item-req">${esc(i.requirement)}</div>
      </div>

      <div class="item-block">
        <div class="item-block-t"><span class="ic">✍️</span>이행 현황
          ${r.implementation ? '<span class="mini-ok">작성됨</span>' : '<span class="mini-no">미작성</span>'}</div>
        <div class="item-note ${r.implementation ? '' : 'empty'}">${
          r.implementation ? esc(r.implementation) : '이행 현황이 아직 작성되지 않았습니다. 카드를 클릭해 작성하세요.'}</div>
      </div>
    </div>

    <div class="item-facts">
      <div class="fact"><span class="k">점검주기</span><span class="v">${esc(i.cycle)}</span></div>
      <div class="fact"><span class="k">담당</span><span class="v ${r.owner ? '' : 'dim'}">${r.owner ? esc(r.owner) : '미지정'}</span></div>
      <div class="fact"><span class="k">최근점검</span><span class="v ${r.last_checked ? '' : 'dim'}">${r.last_checked ? fmtDate(r.last_checked) : '미기록'}</span></div>
      <div class="fact"><span class="k">기한</span><span class="v ${overdue ? 'over' : r.due_date ? '' : 'dim'}">${r.due_date ? fmtDate(r.due_date) + (overdue ? ' ⚠' : '') : '미설정'}</span></div>
    </div>

    <div class="item-links">
      ${linkedDocs.length ? `
      <div class="lrow">
        <span class="lk lk-doc">📁 관련문서</span>
        <span class="lv">${linkedDocs.map(d => `<span class="chip chip-doc" title="${esc(d.title || '')}">${esc(d.docNo)}<em>${esc((d.title || '').slice(0, 22))}</em></span>`).join('')}</span>
      </div>` : ''}
      ${(i.isoRefs || []).length ? `
      <div class="lrow">
        <span class="lk lk-iso">🌐 ISO 45001</span>
        <span class="lv">${i.isoRefs.map(c => `<span class="chip chip-iso">${esc(c)}</span>`).join('')}</span>
      </div>` : ''}
      ${i.penalty ? `
      <div class="lrow">
        <span class="lk lk-pen">⚠️ 위반 시 벌칙</span>
        <span class="lv"><span class="chip chip-pen">${esc(i.penalty)}</span></span>
      </div>` : ''}
      <div class="lrow lrow-data">
        <span class="lk lk-data">🗂️ 자료 보유</span>
        <span class="lv">
          <span class="chip chip-cnt ${nDocs ? 'on' : ''}">작성·보관자료 <b>${nDocs}</b></span>
          <span class="chip chip-cnt ${nEvid ? 'on' : ''}">증빙자료 <b>${nEvid}</b></span>
          <span class="chip chip-cnt ${nFile ? 'on' : ''}">첨부파일 <b>${nFile}</b></span>
          <span class="chip chip-cnt ${hasStatus ? 'on' : ''}">준비현황 ${hasStatus ? '기재' : '미기재'}</span>
        </span>
      </div>
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
      <div class="drawer-foot-note" id="dFootNote"></div>
      <button class="btn" id="dDelete" style="display:none;color:var(--bad);border-color:rgba(180,35,24,.25)">기록 삭제</button>
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
  drawer.classList.remove('drawer-item');
  drawer.querySelector('#dCode').textContent = opt.code || '';
  drawer.querySelector('#dTitle').textContent = opt.title || '';
  drawer.querySelector('#dFootNote').textContent = '';
  const body = drawer.querySelector('#dBody');
  body.innerHTML = opt.body || '';
  const saveBtn = drawer.querySelector('#dSave');
  const deleteBtn = drawer.querySelector('#dDelete');
  deleteBtn.style.display = 'none';
  deleteBtn.onclick = null;
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

function attachmentRowHtml(a, i, editable) {
  const kind = a.kind || (a.url ? 'link' : 'record');
  const label = kind === 'file' ? '파일' : kind === 'link' ? '링크' : '기록';
  const icon = kind === 'file' ? '📎' : kind === 'link' ? '🔗' : '📝';
  const canViewFile = kind === 'file' && ['pending', 'local-idb', 'r2'].includes(a.storage);
  const canView = canViewFile || (kind === 'link' && !!a.url);
  const sizeMeta = a.originalSize && a.size && a.originalSize > a.size
    ? `압축 ${formatBytes(a.originalSize)} → ${formatBytes(a.size)}`
    : (a.size ? formatBytes(a.size) : '');
  const meta = [sizeMeta, a.date || ''].filter(Boolean).join(' · ');
  const canRemove = editable && (a.storage === 'pending' || canDelete());
  return `<div class="attach-row" data-idx="${i}">
    <span class="attach-kind ${esc(kind)}">${icon} ${label}</span>
    <span class="attach-name">${esc(a.name || a.url || '첨부자료')}</span>
    ${a.note ? `<span class="attach-note" title="${esc(a.note)}">${esc(a.note)}</span>` : ''}
    ${meta ? `<span class="attach-date">${esc(meta)}</span>` : ''}
    ${canView ? `<button type="button" class="attach-view" data-idx="${i}">보기</button>` : ''}
    ${canRemove ? `<button type="button" class="attach-del" data-idx="${i}" title="삭제">✕</button>` : ''}
  </div>`;
}

function attachmentEmptyHtml() {
  return '<div class="attach-empty">등록된 첨부자료가 없습니다. 파일 또는 외부 링크를 추가하세요.</div>';
}

/** 범용 작성창용 첨부자료 영역 */
export function attachmentPanelHtml(attachments = [], editable, { hint = '' } = {}) {
  return `
    <div class="fld drawer-attachments">
      <label>첨부자료 · 링크</label>
      <div class="attach-list" id="xAttachList">
        ${(attachments || []).map((a, i) => attachmentRowHtml(a, i, editable)).join('') || attachmentEmptyHtml()}
      </div>
      ${editable ? `<div class="attach-add-group">
        <div class="attach-add-title">📎 파일 첨부</div>
        <div class="attach-add">
          <input class="inp attach-file" type="file" id="xAttachFile" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.jpg,.jpeg,.png,.webp,.txt,.csv,.zip">
          <input class="inp" id="xAttachFileNote" placeholder="파일 설명·보관 근거 (선택)">
          <button type="button" class="btn sm" id="xAttachFileBtn">파일 추가</button>
        </div>
      </div>
      <div class="attach-add-group">
        <div class="attach-add-title">🔗 외부 링크 등록</div>
        <div class="attach-add">
          <input class="inp" type="url" id="xAttachUrl" placeholder="https://..." style="flex:1;min-width:220px">
          <input class="inp" id="xAttachLinkName" placeholder="표시 이름 (선택)">
          <input class="inp" id="xAttachLinkNote" placeholder="링크 설명 (선택)">
          <button type="button" class="btn sm" id="xAttachLinkBtn">링크 추가</button>
        </div>
      </div>` : ''}
      <div class="help">${hint ? `${esc(hint)} · ` : ''}사진은 50KB를 목표로 식별 가능한 품질까지 WebP 압축하고, 15MB 초과 문서·ZIP은 자동 최고 압축 ZIP으로 변환합니다.</div>
    </div>`;
}

/** 범용 작성창 첨부 목록의 추가·열람·삭제 및 저장 준비를 관리한다. */
export function createAttachmentManager(root, { attachments = [], editable = false, itemId = '', half = '' } = {}) {
  let list = [...(attachments || [])];
  const removedAttachments = [];
  let newlyStored = [];
  const render = () => {
    const listEl = root.querySelector('#xAttachList');
    if (listEl) listEl.innerHTML = list.length
      ? list.map((a, i) => attachmentRowHtml(a, i, editable)).join('')
      : attachmentEmptyHtml();
  };

  if (editable) {
    root.querySelector('#xAttachFileBtn')?.addEventListener('click', async () => {
      const fileEl = root.querySelector('#xAttachFile');
      const file = fileEl?.files?.[0];
      if (!file) { toast('첨부할 파일을 선택해 주세요.', 'bad'); fileEl?.focus(); return; }
      const button = root.querySelector('#xAttachFileBtn');
      button.disabled = true;
      showSpinner('사진 용량 최적화 중…');
      try {
        const prepared = await prepareAttachmentFile(file);
        if (list.some(a => a.kind === 'file' && a.contentHash === prepared.contentHash)) {
          toast('같은 파일이 이미 등록되어 있습니다.', 'bad'); return;
        }
        list.push({
          id: uid('att'), kind: 'file', storage: 'pending', _file: prepared.file,
          name: prepared.file.name, note: root.querySelector('#xAttachFileNote').value.trim(),
          date: new Date().toISOString().slice(0, 10), mime: prepared.file.type, size: prepared.file.size,
          originalSize: prepared.originalSize, compressed: prepared.compressed, contentHash: prepared.contentHash
        });
        fileEl.value = '';
        root.querySelector('#xAttachFileNote').value = '';
        render();
        const targetNote = prepared.targetReached === false ? ' 50KB 목표를 넘지만 식별성 보호 품질로 저장합니다.' : '';
        toast(prepared.compressed ? `파일을 ${formatBytes(prepared.originalSize)}에서 ${formatBytes(prepared.file.size)}로 압축했습니다.${targetNote}` : '파일을 첨부 목록에 추가했습니다.', 'ok');
      } catch (err) {
        toast(err?.message || String(err), 'bad');
      } finally {
        hideSpinner();
        button.disabled = false;
      }
    });

    root.querySelector('#xAttachLinkBtn')?.addEventListener('click', () => {
      const urlEl = root.querySelector('#xAttachUrl');
      const url = attachmentUrl(urlEl.value);
      if (!url) { toast('http 또는 https 형식의 올바른 링크를 입력해 주세요.', 'bad'); urlEl.focus(); return; }
      list.push({
        id: uid('att'), kind: 'link', url,
        name: root.querySelector('#xAttachLinkName').value.trim() || url,
        note: root.querySelector('#xAttachLinkNote').value.trim(),
        date: new Date().toISOString().slice(0, 10)
      });
      urlEl.value = '';
      root.querySelector('#xAttachLinkName').value = '';
      root.querySelector('#xAttachLinkNote').value = '';
      render();
    });
  }

  root.querySelector('#xAttachList')?.addEventListener('click', async e => {
    const view = e.target.closest('.attach-view');
    if (view) {
      showSpinner('첨부자료 여는 중…');
      try { await viewAttachment(list[Number(view.dataset.idx)]); }
      catch (err) { toast(err?.message || String(err), 'bad'); }
      finally { hideSpinner(); }
      return;
    }
    const del = e.target.closest('.attach-del');
    if (!del || !editable) return;
    const idx = Number(del.dataset.idx);
    if (list[idx]?.storage !== 'pending' && !canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
    const [removed] = list.splice(idx, 1);
    if (removed && removed.storage !== 'pending') removedAttachments.push(removed);
    render();
  });

  return {
    async storePending() {
      newlyStored = [];
      const storedAttachments = [];
      for (const att of list) {
        if (att.storage === 'pending' && att._file) {
          const stored = await saveAttachmentFile(att._file, { itemId, half, note: att.note || '' });
          stored.originalSize = att.originalSize || att.size;
          stored.compressed = !!att.compressed;
          stored.contentHash = att.contentHash || stored.contentHash;
          storedAttachments.push(stored);
          newlyStored.push(stored);
          if (stored.storageUsage?.warning) toast(stored.storageUsage.warning, 'bad');
        } else {
          const { _file, ...clean } = att;
          storedAttachments.push(clean);
        }
      }
      list = storedAttachments;
      return storedAttachments;
    },
    async commitRemoved() {
      await Promise.allSettled(removedAttachments.map(deleteAttachmentFile));
    },
    async rollbackNewlyStored() {
      await Promise.allSettled(newlyStored.map(deleteAttachmentFile));
    }
  };
}

export function openItemDrawer(itemId, onSaved) {
  const item = ALL_ITEMS.find(i => i.id === itemId);
  if (!item) return;
  const { mask, drawer } = ensureDrawer();
  const half = state.half;
  const r = getRecord(itemId, half);
  const editable = canEdit();
  const currentStatus = STATUS[r.status] || STATUS.none;
  const attachmentCount = (r.attachments || []).length;

  drawer.classList.add('drawer-item');
  drawer.querySelector('#dCode').textContent = `${item.code} · ${halfLabel(half)}`;
  drawer.querySelector('#dTitle').textContent = item.title;
  drawer.querySelector('#dFootNote').innerHTML = editable
    ? '<span class="foot-dot"></span>입력 내용과 첨부자료를 함께 저장합니다'
    : '<span class="foot-dot readonly"></span>읽기 전용으로 열었습니다';

  const linkedDocs = (item.docRefs || []).map(no => DOC_MASTER.find(d => d.docNo === no)).filter(Boolean);

  drawer.querySelector('#dBody').innerHTML = `
    <div class="drawer-summary">
      <div class="drawer-summary-item"><span>이행 상태</span><strong class="tone-${esc(r.status || 'none')}">${esc(currentStatus.label)}</strong></div>
      <div class="drawer-summary-item"><span>점검 주기</span><strong>${esc(item.cycle)}</strong></div>
      <div class="drawer-summary-item"><span>담당</span><strong>${esc(r.owner || '미지정')}</strong></div>
      <div class="drawer-summary-item"><span>첨부자료</span><strong>${attachmentCount}건</strong></div>
    </div>

    <section class="drawer-section drawer-reference">
      <div class="drawer-section-head">
        <div><span class="section-kicker">REFERENCE</span><h4>기준과 요구사항</h4></div>
        <span class="section-caption">판단 근거를 먼저 확인하세요</span>
      </div>
      <div class="reference-grid">
        <div class="ref-box ref-clause">
          <div class="t"><span class="ref-icon">01</span>조문 요지</div>
          <div class="c">${esc(item.clause)}</div>
        </div>
        <div class="ref-box ref-action">
          <div class="t"><span class="ref-icon">02</span>이행해야 할 내용</div>
          <div class="c">${esc(item.requirement)}</div>
          <div class="chip-row">
            <span class="tag">점검주기 ${esc(item.cycle)}</span>
            ${(item.isoRefs || []).map(c => `<span class="tag iso">ISO ${esc(c)}</span>`).join('')}
            ${(item.lawRefs || []).map(c => `<span class="tag law">${esc(c)}</span>`).join('')}
            ${linkedDocs.map(d => `<span class="tag doc">${esc(d.docNo)} ${esc(d.title)}</span>`).join('')}
          </div>
          ${item.linkedApp ? `<div class="linked-app"><a class="btn sm" href="${esc(item.linkedApp.url)}" target="_blank" rel="noopener">관련 앱에서 확인 ↗</a></div>` : ''}
          ${(item.reportLinks || []).length ? `<div class="report-links"><span class="ref-icon">📄</span>${item.reportLinks.map(l => `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('')}</div>` : ''}
        </div>
        <div class="ref-box ref-evidence">
          <div class="t"><span class="ref-icon">03</span>권장 증빙</div>
          <ol>${(item.evidence || []).map(e => `<li>${esc(e)}</li>`).join('')}</ol>
        </div>
      </div>
    </section>

    <section class="drawer-section attachment-section">
      <div class="drawer-section-head">
        <div><span class="section-kicker">EVIDENCE FILES</span><h4>첨부자료 · 외부 링크</h4></div>
        <span class="attach-count">${attachmentCount}건 등록</span>
      </div>
      <div class="attach-list" id="fAttachList">
        ${(r.attachments || []).map((a, i) => attachmentRowHtml(a, i, editable)).join('')}
        ${!(r.attachments || []).length ? '<div class="attach-empty"><span>＋</span><strong>등록된 첨부자료가 없습니다</strong><small>아래에서 파일 또는 외부 링크를 추가하세요</small></div>' : ''}
      </div>
      ${editable ? `<div class="attach-upload-grid">
        <div class="attach-add-group">
          <div class="attach-add-title"><span class="upload-icon">↑</span><span>파일 첨부<small>사진 50KB 목표 · 15MB 초과 문서 자동 ZIP 압축</small></span></div>
          <div class="attach-add">
            <input class="inp attach-file" type="file" id="fAttachFile" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.hwp,.hwpx,.jpg,.jpeg,.png,.webp,.txt,.csv,.zip">
            <input class="inp" id="fAttachFileNote" placeholder="파일 비고 (선택)">
            <button type="button" class="btn sm attach-action" id="fAttachFileBtn">선택 파일 추가</button>
          </div>
        </div>
        <div class="attach-add-group">
          <div class="attach-add-title"><span class="upload-icon link">↗</span><span>외부 링크<small>전자결재·문서함 주소를 연결</small></span></div>
          <div class="attach-add">
            <input class="inp" type="url" id="fAttachUrl" placeholder="https://...">
            <div class="attach-inline-fields">
              <input class="inp" id="fAttachLinkName" placeholder="표시 이름 (선택)">
              <input class="inp" id="fAttachLinkNote" placeholder="링크 비고 (선택)">
            </div>
            <button type="button" class="btn sm attach-action" id="fAttachLinkBtn">링크 등록</button>
          </div>
        </div>
      </div>` : ''}
      <div class="storage-note"><span>i</span><p>사진(JPG·PNG·WebP)은 WebP로 단계적으로 압축하되, <b>식별 가능한 최소 품질·해상도</b>를 지킵니다. 50KB는 목표값이며 넘더라도 품질 보호본을 저장합니다. 15MB를 넘는 PDF·Office·한글·ZIP은 자동으로 최고 압축 ZIP으로 변환하며, 변환 후에도 15MB를 넘는 경우에만 저장되지 않습니다.</p></div>
    </section>

    <section class="drawer-section">
      <div class="drawer-section-head">
        <div><span class="section-kicker">IMPLEMENTATION</span><h4>이행 기록</h4></div>
        <span class="section-caption">실행 현황과 증빙을 한 곳에서 관리하세요</span>
      </div>
      <div class="fld-row drawer-meta-fields">
        <div class="fld">
          <label>이행 상태</label>
          <select class="inp" id="fStatus" ${editable ? '' : 'disabled'}>
            ${STATUS_ORDER.map(s => `<option value="${s}" ${r.status === s ? 'selected' : ''}>${STATUS[s].label}</option>`).join('')}
          </select>
        </div>
        <div class="fld">
          <label>담당자 / 담당부서</label>
          <input class="inp" id="fOwner" value="${esc(r.owner)}" placeholder="이름 또는 담당부서를 직접 입력하세요" ${editable ? '' : 'disabled'}>
        </div>
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
        <label><span class="field-no">01</span>이행 현황 <em>무엇을 · 언제 · 누가 · 어떻게 했는지</em></label>
        <textarea class="inp" id="fImpl" style="min-height:156px" placeholder="예) 2026.07.15 경영책임자 명의 안전보건 경영방침을 제정하고 전 매장 376개소 게시 완료. 연간 목표는 재해율 0.15% 이하, 위험성평가 실시율 100%로 설정하여 이사회 승인(2026.02.20)을 받음." ${editable ? '' : 'disabled'}>${esc(r.implementation)}</textarea>
        <div class="help">날짜·주체·수량을 포함하면 기록의 완성도가 높아집니다.</div>
      </div>
      <div class="fld">
        <label><span class="field-no">02</span>당사 준비현황</label>
        <textarea class="inp" id="fCompany" style="min-height:82px" placeholder="현재 준비·이행 상황을 기재하세요." ${editable ? '' : 'disabled'}>${esc((r.userStatus || item.companyStatus || ''))}</textarea>
      </div>
      <div class="fld">
        <label><span class="field-no">03</span>작성 및 보관자료 목록</label>
        <textarea class="inp" id="fDocs" style="min-height:96px" placeholder="업무에 필요한 자료 목록을 한 줄에 하나씩 기재하세요." ${editable ? '' : 'disabled'}>${esc((r.userDocs || (item.requiredDocs || []).join('\n')))}</textarea>
        ${(item.requiredDocs && item.requiredDocs.length && !r.userDocs) ? `<div class="help info-help">기준 데이터에서 자동 표시 중 · 편집하면 이 항목에 별도 저장됩니다</div>` : ''}
      </div>
      <div class="fld">
        <label><span class="field-no">04</span>보유 증빙자료 <em>문서명 · 보관 위치</em></label>
        <textarea class="inp" id="fEvi" placeholder="예)&#10;1. 안전보건 경영방침 선언문(대표이사 서명본) — 안전보건팀 문서고 / SHP-02 첨부&#10;2. 매장 게시 사진 376건 — 이행증빙 자료함&#10;3. 이사회 의사록(2026.02.20) — 경영지원팀" ${editable ? '' : 'disabled'}>${esc(r.evidence)}</textarea>
      </div>
      <div class="fld">
        <label><span class="field-no">05</span>증빙자료 파일 목록</label>
        <textarea class="inp" id="fEvFiles" style="min-height:96px" placeholder="보유 중인 증빙자료 파일명·문서번호를 한 줄에 하나씩 기재하세요." ${editable ? '' : 'disabled'}>${esc((r.userEvidence || (item.evidenceFiles || []).join('\n')))}</textarea>
        ${(item.evidenceFiles && item.evidenceFiles.length && !r.userEvidence) ? `<div class="help info-help">기준 데이터에서 자동 표시 중 · 편집하면 이 항목에 별도 저장됩니다</div>` : ''}
      </div>
      <div class="fld">
        <label><span class="field-no">06</span>미흡사항 / 개선 필요사항</label>
        <textarea class="inp" id="fFind" style="min-height:88px" placeholder="점검 결과 확인된 부족한 부분과 보완 계획을 기재합니다. (없으면 '해당없음')" ${editable ? '' : 'disabled'}>${esc(r.findings)}</textarea>
        <div class="help">미흡사항은 개선조치(CAPA) 화면에서 별도 등록해 종결까지 관리하는 것을 권장합니다.</div>
      </div>
    </section>

    ${r.updated_at ? `<div class="drawer-updated">최종 수정 ${esc(String(r.updated_at).slice(0, 16).replace('T', ' '))} · ${esc(r.updated_by || '')}</div>` : ''}
  `;

  const saveBtn = drawer.querySelector('#dSave');
  const deleteBtn = drawer.querySelector('#dDelete');
  saveBtn.style.display = '';
  saveBtn.disabled = !editable;
  saveBtn.textContent = editable ? '변경사항 저장' : '읽기 전용';
  deleteBtn.style.display = canDelete() ? '' : 'none';
  deleteBtn.onclick = async () => {
    if (!canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
    if (!window.confirm('이 항목의 작성 기록과 첨부자료를 삭제할까요? 법령·ISO 기준 항목 자체는 유지됩니다.')) return;
    deleteBtn.disabled = true;
    showSpinner('작성 기록 삭제 중…');
    try {
      const res = await deleteRecord(itemId, half);
      toast(res.ok ? '작성 기록을 삭제했습니다.' : `로컬 삭제됨 · 동기화 실패: ${res.error}`, res.ok ? 'ok' : 'bad');
      closeDrawer();
      onSaved && onSaved();
    } finally {
      hideSpinner();
      deleteBtn.disabled = false;
    }
  };
  let attachments = [...(r.attachments || [])];
  const removedAttachments = [];

  function renderAttachList() {
    const list = drawer.querySelector('#fAttachList');
    if (!list) return;
    list.innerHTML = attachments.length
      ? attachments.map((a, i) => attachmentRowHtml(a, i, editable)).join('')
      : '<div class="attach-empty"><span>＋</span><strong>등록된 첨부자료가 없습니다</strong><small>아래에서 파일 또는 외부 링크를 추가하세요</small></div>';
    const count = drawer.querySelector('.attach-count');
    if (count) count.textContent = `${attachments.length}건 등록`;
    const summaryCount = drawer.querySelector('.drawer-summary-item:last-child strong');
    if (summaryCount) summaryCount.textContent = `${attachments.length}건`;
  }

  if (editable) {
    drawer.querySelector('#fAttachFileBtn')?.addEventListener('click', async () => {
      const fileEl = drawer.querySelector('#fAttachFile');
      const file = fileEl.files?.[0];
      if (!file) { toast('첨부할 파일을 선택해 주세요.', 'bad'); fileEl.focus(); return; }
      const addBtn = drawer.querySelector('#fAttachFileBtn');
      addBtn.disabled = true;
      showSpinner('사진 용량 최적화 중…');
      try {
        const prepared = await prepareAttachmentFile(file);
        if (attachments.some(a => a.kind === 'file' && a.contentHash === prepared.contentHash)) {
          toast('같은 파일이 이미 등록되어 있습니다.', 'bad');
          return;
        }
        attachments.push({
          id: uid('att'), kind: 'file', storage: 'pending', _file: prepared.file,
          name: prepared.file.name, note: drawer.querySelector('#fAttachFileNote').value.trim(),
          date: new Date().toISOString().slice(0, 10), mime: prepared.file.type, size: prepared.file.size,
          originalSize: prepared.originalSize, compressed: prepared.compressed, contentHash: prepared.contentHash
        });
        fileEl.value = '';
        drawer.querySelector('#fAttachFileNote').value = '';
        renderAttachList();
        toast(prepared.compressed ? `사진을 ${formatBytes(prepared.originalSize)}에서 ${formatBytes(prepared.file.size)}로 압축했습니다.` : '파일을 첨부 목록에 추가했습니다.', 'ok');
      } catch (err) {
        toast(err?.message || String(err), 'bad');
      } finally {
        hideSpinner();
        addBtn.disabled = false;
      }
    });

    drawer.querySelector('#fAttachLinkBtn')?.addEventListener('click', () => {
      const urlEl = drawer.querySelector('#fAttachUrl');
      const url = attachmentUrl(urlEl.value);
      if (!url) { toast('http 또는 https 형식의 올바른 링크를 입력해 주세요.', 'bad'); urlEl.focus(); return; }
      attachments.push({
        id: uid('att'), kind: 'link', url,
        name: drawer.querySelector('#fAttachLinkName').value.trim() || url,
        note: drawer.querySelector('#fAttachLinkNote').value.trim(),
        date: new Date().toISOString().slice(0, 10)
      });
      urlEl.value = '';
      drawer.querySelector('#fAttachLinkName').value = '';
      drawer.querySelector('#fAttachLinkNote').value = '';
      renderAttachList();
    });
  }

  drawer.querySelector('#fAttachList')?.addEventListener('click', async e => {
    const view = e.target.closest('.attach-view');
    if (view) {
      showSpinner('첨부자료 여는 중…');
      try { await viewAttachment(attachments[Number(view.dataset.idx)]); }
      catch (err) { toast(err?.message || String(err), 'bad'); }
      finally { hideSpinner(); }
      return;
    }
    const del = e.target.closest('.attach-del');
    if (!del || !editable) return;
    const idx = Number(del.dataset.idx);
    if (attachments[idx]?.storage !== 'pending' && !canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
    const [removed] = attachments.splice(idx, 1);
    if (removed && removed.storage !== 'pending') removedAttachments.push(removed);
    renderAttachList();
  });

  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    showSpinner('첨부자료와 이행기록 저장 중…');
    const newlyStored = [];
    try {
      const storedAttachments = [];
      for (const att of attachments) {
        if (att.storage === 'pending' && att._file) {
          const stored = await saveAttachmentFile(att._file, { itemId, half, note: att.note || '' });
          stored.originalSize = att.originalSize || att.size;
          stored.compressed = !!att.compressed;
          stored.contentHash = att.contentHash || stored.contentHash;
          storedAttachments.push(stored);
          newlyStored.push(stored);
        } else {
          const { _file, ...clean } = att;
          storedAttachments.push(clean);
        }
      }
      const patch = {
      status:        drawer.querySelector('#fStatus').value,
      owner:         drawer.querySelector('#fOwner').value.trim(),
      last_checked:  drawer.querySelector('#fChecked').value,
      due_date:      drawer.querySelector('#fDue').value,
      implementation:drawer.querySelector('#fImpl').value.trim(),
      evidence:      drawer.querySelector('#fEvi').value.trim(),
      findings:      drawer.querySelector('#fFind').value.trim(),
      userDocs:      drawer.querySelector('#fDocs').value.trim(),
      userStatus:    drawer.querySelector('#fCompany').value.trim(),
      userEvidence:  drawer.querySelector('#fEvFiles').value.trim(),
        attachments: storedAttachments
      };
      const res = await saveRecord(itemId, patch, half);
      attachments = storedAttachments;
      if (res.ok) await Promise.allSettled(removedAttachments.map(deleteAttachmentFile));
      toast(res.ok ? (res.local ? '저장했습니다 (로컬 저장)' : '저장했습니다 (Supabase 동기화 완료)') : `로컬 저장됨 · 동기화 실패: ${res.error}`,
            res.ok ? 'ok' : 'bad');
      closeDrawer();
      onSaved && onSaved();
    } catch (err) {
      await Promise.allSettled(newlyStored.map(deleteAttachmentFile));
      toast(`첨부자료 저장 실패: ${err?.message || String(err)}`, 'bad');
    } finally {
      hideSpinner();
      saveBtn.disabled = false;
    }
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

  const hna = $('#cHideNa', root);
  if (hna) hna.addEventListener('change', e => { listFilter.hideNa = e.target.checked; rerender(); });

  const pr = $('#cPrint', root);
  if (pr) pr.addEventListener('click', () => window.print());

  const aoNew = $('#auditOvNew', root);
  if (aoNew) aoNew.addEventListener('click', () => openAuditOverviewDrawer(null, rerender));

  root.addEventListener('click', async e => {
    const delAo = e.target.closest('[data-del-audit-ov]');
    if (delAo) { e.stopPropagation();
      if (!canDelete()) { toast('삭제는 마스터 관리자만 할 수 있습니다.', 'bad'); return; }
      if (window.confirm('이 심사 개요를 삭제할까요?')) { const res = await deleteRow('auditOverview', delAo.dataset.delAuditOv); toast(res.ok ? '삭제했습니다.' : res.error, res.ok ? 'ok' : 'bad'); rerender(); }
      return; }
    const aoRow = e.target.closest('[data-audit-ov]');
    if (aoRow) { openAuditOverviewDrawer(state.auditOverview.find(x => x.id === aoRow.dataset.auditOv), rerender); return; }

    const card = e.target.closest('[data-item]');
    if (card && !e.target.closest('a')) openItemDrawer(card.dataset.item, rerender);
  });
}

export function resetFilter() { listFilter.q = ''; listFilter.status = 'all'; listFilter.group = 'all'; listFilter.hideNa = true; }
