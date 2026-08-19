import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DesignCondition, DesignResult } from './engine/types.ts';
import FilterBar from './components/FilterBar.tsx';
import ResultTable from './components/ResultTable.tsx';
import ConnectionSVG from './components/ConnectionSVG.tsx';
// 모달·무거운 컴포넌트는 지연 로딩(초기 번들에서 three·xlsx 제외)
const CalcReport = lazy(() => import('./components/CalcReport.tsx'));
const AiscCalcReport = lazy(() => import('./components/AiscCalcReport.tsx'));
const AiscDetailReport = lazy(() => import('./components/AiscDetailReport.tsx'));
const KbcDetailReport = lazy(() => import('./components/KbcDetailReport.tsx'));
const QuantityPanel = lazy(() => import('./components/QuantityPanel.tsx'));
const ProjectPanel = lazy(() => import('./components/ProjectPanel.tsx'));
const ThreeViewer = lazy(() => import('./components/ThreeViewer.tsx'));
const DcrPopup = lazy(() => import('./components/DcrPopup.tsx'));
import { loadProject, persistProject, newItem, type ProjectItem } from './engine/project.ts';
import { LangContext, type Lang, tMember, tJoint } from './i18n.ts';
import { catalogFor, sectionByName } from './engine/sections.ts';
import { usesLimitState } from './engine/std.ts';
import { designConnection } from './engine/engine.ts';
import { aiscAutoCorrect } from './engine/aisc/compat.ts';
import { toDXF, toDXFAll, toDXFAll2, downloadFile } from './engine/dxf.ts';
import { toIFC } from './engine/ifcOut.ts';
import { quantityOf } from './engine/quantity.ts';

const DEFAULT: DesignCondition = {
  member: '보', jointType: '마찰', steel: 'SN355', plateSteel: 'SM355', bolt: 'F10T', strengthRatio: 0.85, sectionType: '압연',
  designStd: 'AISC', noStagger: false, equalPlateT: true,
};
const nf = (v?: number) => v == null ? '—' : v.toLocaleString('en-US');
// 사용자 피드백 구글 폼 링크 — 아래 URL을 발급받은 폼 주소로 교체하세요.
const FEEDBACK_URL = 'https://forms.gle/Qc8CztEGDeJXYyzf9';
const plate = (p?: { t: number; w: number; L: number }) => p ? `${p.t}×${p.w}×${p.L}` : '—';

// 도움말 목차 아코디언 항목 — 제목(t) 클릭 시 상세(children) 펼침
function HelpItem({ t, children }: { t: string; children: ReactNode }) {
  return <details className="help-item"><summary>{t}</summary><div className="help-d">{children}</div></details>;
}

export default function App() {
  const [cond, setCond] = useState<DesignCondition>(DEFAULT);
  const [selected, setSelected] = useState<DesignResult | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [showQty, setShowQty] = useState(false);
  const [showProj, setShowProj] = useState(false);
  const [view3D, setView3D] = useState<DesignResult | null>(null);
  const [zoomPrev, setZoomPrev] = useState(false);   // 접합 상세도 확대 보기
  const [dcrView, setDcrView] = useState<{ r: DesignResult; fScale: number; wScale: number } | null>(null);   // DCR 팝업 대상(+캡핑배율)
  const [boltMode, setBoltMode] = useState<'Default' | 'Custom'>('Default');
  const [boltOv, setBoltOv] = useState<Record<number, number>>({});   // 행index → 지정직경(위 행 따름)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());  // 테이블에서 제거한 단면(−버튼)
  const hideSection = (name: string) => setHidden(h => { const n = new Set(h); n.add(name); return n; });
  const resetHidden = () => setHidden(h => (h.size ? new Set() : h));
  const [project, setProject] = useState<ProjectItem[]>(loadProject);
  const [dark, setDark] = useState<boolean>(() => {
    const s = localStorage.getItem('splice_theme');
    return s ? s === 'dark' : true;          // 기본 다크, 이후 선택 기억
  });
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('splice_lang') as Lang) || 'ko');
  const [showHelp, setShowHelp] = useState(false);   // ? 사용 안내 팝오버
  const [autoFix, setAutoFix] = useState(true);   // AISC 전체 부재 최적화(철판 최소·DCR≤1) — 기본 ON
  const L = <K,>(ko: K, en: K): K => (lang === 'en' ? en : ko);   // 짧은 인라인 번역 헬퍼

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('splice_theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => { localStorage.setItem('splice_lang', lang); }, [lang]);
  useEffect(() => { persistProject(project); }, [project]);
  // 인쇄(PDF) 시 브라우저 머리글의 문서제목('고력볼트 표준접합 설계표')을 비운다. 인쇄 후 복원.
  //  ※ 날짜·URL·페이지번호(바닥글)는 브라우저 인쇄설정('머리글 및 바닥글')에서만 제거 가능.
  useEffect(() => {
    let saved = '';
    const clear = () => { saved = document.title; document.title = ' '; };
    const restore = () => { if (saved) document.title = saved; };
    window.addEventListener('beforeprint', clear);
    window.addEventListener('afterprint', restore);
    return () => { window.removeEventListener('beforeprint', clear); window.removeEventListener('afterprint', restore); };
  }, []);
  // 도움말·확대·모달 열림 시 Esc로 닫기
  useEffect(() => {
    if (!showHelp) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowHelp(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHelp]);

  // Custom 볼트직경 해석 : 해당 행 이상에서 가장 가까운 지정값(위 행을 따름)
  const diaAt = useCallback((i: number): number | undefined => {
    if (boltMode !== 'Custom') return undefined;
    let bestK: number | undefined;
    for (const k of Object.keys(boltOv).map(Number)) if (k <= i && (bestK === undefined || k > bestK)) bestK = k;
    return bestK === undefined ? undefined : boltOv[bestK];
  }, [boltMode, boltOv]);
  const setDiaAt = (i: number, d: number) => setBoltOv(o => ({ ...o, [i]: d }));

  // KPI 집계 (조건·Custom 변경 시)
  const stats = useMemo(() => {
    let bolts = 0, wt = 0, boltWt = 0, ok = 0;
    const af = usesLimitState(cond.designStd) && autoFix;
    let total = 0;
    catalogFor(cond.profile, cond.sectionSet).forEach((s, i) => {
      if (hidden.has(s.name)) return;                 // 제거된 단면은 집계 제외
      total++;
      let r = designConnection(cond, s, diaAt(i)), okThis: boolean;
      if (af) { const ac = aiscAutoCorrect(r, cond); r = ac.result; okThis = ac.ok; }
      else okThis = !r.steps.some(st => st.check === 'NG');
      const q = quantityOf(r, cond);
      bolts += q.boltCount; wt += q.plateWeightKg; boltWt += q.boltWeightKg;
      if (okThis) ok++;
    });
    return { bolts, wt: Math.round(wt), boltWt: Math.round(boltWt), ok, total };
  }, [cond, diaAt, autoFix, hidden]);

  // 자동보정 ON(AISC) 시 선택 부재를 보정 형상으로 표시
  const selEff = (usesLimitState(cond.designStd) && autoFix && selected) ? aiscAutoCorrect(selected, cond).result : selected;
  const detailQ = useMemo(() => (selEff ? quantityOf(selEff, cond) : null), [selEff, cond]);

  const addToProject = (r: DesignResult) => setProject(p => [...p, newItem(r.section, cond)]);
  const allRowsForDXF = () => {                                    // DXF는 테이블과 동일 형상(최적화 반영)으로 출력
    const af = usesLimitState(cond.designStd) && autoFix;
    return catalogFor(cond.profile, cond.sectionSet).map((s, i) => ({ s, i })).filter(({ s }) => !hidden.has(s.name))
      .map(({ s, i }) => { const r = designConnection(cond, s, diaAt(i)); return af ? aiscAutoCorrect(r, cond).result : r; });
  };
  const exportAllDXF = () =>
    downloadFile(`splice_전체_${cond.member}_${cond.jointType}.dxf`, toDXFAll(allRowsForDXF(), cond), 'application/dxf');
  const exportAllDXF2 = () =>   // 사무소 표준 포맷(ExT/INT/W·볼트길이·주기)
    downloadFile(`splice_전체_${cond.member}_${cond.jointType}_표준포맷.dxf`, toDXFAll2(allRowsForDXF(), cond), 'application/dxf');
  const exportOneDXF = (r: DesignResult) => downloadFile(`${r.section}_${cond.jointType}.dxf`, toDXF(r, cond), 'application/dxf');
  const exportOneIFC = (r: DesignResult) => downloadFile(`${r.section}_${cond.jointType}.ifc`, toIFC(r, cond), 'application/x-step');
  const isCol = cond.member === '기둥';
  const pct = Math.round(cond.strengthRatio * 100);

  return (
    <LangContext.Provider value={lang}>
    <div className="console">
      <aside className="rail">
        <span className="rlogo">S</span>
        <button className="rnav on" title={L('검토 결과', 'Results')}>▤</button>
        <button className="rnav" title={L('물량산정', 'Quantities')} onClick={() => setShowQty(true)}>▦</button>
        <button className="rnav" title={L('프로젝트', 'Project')} onClick={() => setShowProj(true)}>◫{project.length ? <em className="rbadge">{project.length}</em> : null}</button>
        <button className="rnav" title={L('전체 DXF 다운로드', 'Download all DXF')} onClick={exportAllDXF}>⤓</button>
        <button className="rnav" title={L('전체 DXF 다운로드 (사무소 표준 포맷)', 'Download all DXF2 (office format)')} onClick={exportAllDXF2}>⤓²</button>
        <span className="rspace" />
      </aside>

      <div className="cmain">
        <header className="ctop">
          <div className="cbrand">SPLICE<span className="accent">DESIGN</span></div>
          <div className="ctop-title">{L('고력볼트 표준접합 설계', 'H.S. Bolt Standard Connection Design')}</div>
          <span className="ctop-sp" />
          <div className="help-wrap">
            <div className="seg-theme" role="group" aria-label={L('사용 안내', 'Help')}>
              <button type="button" className={showHelp ? 'on' : ''} onClick={() => setShowHelp(v => !v)}
                aria-expanded={showHelp} aria-haspopup="dialog" title={L('사용 안내 · 이 서비스는?', 'Help · What is this?')}>?</button>
            </div>
            {showHelp && (
              <>
                <div className="help-back" onClick={() => setShowHelp(false)} />
                <div className="help-pop" role="dialog" aria-label={L('사용 안내', 'Help')}>
                  <div className="help-h">
                    <b>{L('고력볼트 표준접합 설계', 'H.S. Bolt Standard Connection Design')}</b>
                    <button className="help-x" title={L('닫기', 'Close')} onClick={() => setShowHelp(false)}>✕</button>
                  </div>
                  <p className="help-lead">{L(
                    'H·W형강 보/기둥 이음부를 KBC-09 / KDS 14 31 25 / AISC 360-16으로 전 단면 자동 설계 — 볼트배열·이음판·물량·상세도면(DXF)·계산서를 생성합니다. 아래 목차(화면 좌→우)를 클릭하면 상세 설명이 열립니다.',
                    'Auto-designs H/W beam & column splices per KBC-09 / KDS 14 31 25 / AISC 360-16 — bolt layout, plates, quantities, shop DXF and calc sheets. Click a topic below (screen left→right) to expand.')}</p>

                  <div className="help-sec">{L('◱ 좌측 레일', '◱ Left rail')}</div>
                  <HelpItem t={L('▤ 검토결과 · ▦ 물량산정 · ◫ 프로젝트', '▤ Results · ▦ Quantities · ◫ Project')}>
                    {L('▤ 결과표 화면. ▦ 고력볼트 본수·중량과 강판 중량 집계(CSV 내보내기). ◫ 담아 둔 단면들의 프로젝트 목록(집계·저장).',
                       '▤ Results table. ▦ Bolt count/weight and plate weight totals (CSV export). ◫ Project list of saved sections (totals, persistence).')}
                  </HelpItem>
                  <HelpItem t={L('⤓ 전체 DXF · ⤓² 사무소 표준포맷', '⤓ All DXF · ⤓² Office format')}>
                    {L('현재 조건의 전 단면 상세도면을 한 파일로 내보냅니다. ⤓²는 사무소 종합도 포맷. 모두 R12(AC1009)로 저장돼 AutoCAD·뷰어에서 열립니다.',
                       'Exports detail drawings for all sections at once. ⤓² uses the office master-sheet format. Saved as R12 (AC1009) for AutoCAD and viewers.')}
                  </HelpItem>

                  <div className="help-sec">{L('▤ 상단 바', '▤ Top bar')}</div>
                  <HelpItem t={L('? 도움말 · 한/EN 언어 · ☾/☀ 테마', '? Help · KO/EN · ☾/☀ Theme')}>
                    {L('이 창(?)·한/영 전환·다크/화이트 테마. 모든 버튼은 마우스를 올리면 기능 설명(툴팁)이 나옵니다.',
                       'This panel (?), KO/EN toggle, dark/light theme. Hover any button for a tooltip.')}
                  </HelpItem>

                  <div className="help-sec">{L('☰ 설계 조건 (좌측 패널)', '☰ Design conditions (left)')}</div>
                  <HelpItem t={L('형강(H/W) · 단면(전체/Preferred)', 'Profile (H/W) · Sections (All/Preferred)')}>
                    {L('H형강 73종, W형강 289종. 「Preferred」는 자주 쓰는 단면만(H 21·W 53) 추립니다.',
                       'H-shape 73 sections, W-shape 289. “Preferred” narrows to common sections (H 21 / W 53).')}
                  </HelpItem>
                  <HelpItem t={L('설계기준 (AISC 16 / KDS 22 / KBC-09)', 'Standard (AISC 16 / KDS 22 / KBC-09)')}>
                    {L('AISC·KDS=한계상태설계(KDS는 AISC 360-16 준용). KBC-09=표준접합 설계법. 기준에 따라 검토·계산서 형식이 달라집니다.',
                       'AISC/KDS = LRFD limit-state (KDS follows AISC 360-16). KBC-09 = standard-connection method. Checks and calc-sheet format vary by standard.')}
                  </HelpItem>
                  <HelpItem t={L('부재(보/기둥) · 접합(마찰/지압)', 'Member (Beam/Col) · Joint (Slip/Bearing)')}>
                    {L('마찰접합은 미끄럼과 함께 볼트전단·지압도 검토하고, 지압접합은 미끄럼을 생략합니다(AISC).',
                       'Slip-critical checks slip plus bolt shear/bearing; bearing-type skips the slip check (AISC).')}
                  </HelpItem>
                  <HelpItem t={L('재질 (H형강 · 이음판)', 'Steel (H-shape · plate)')}>
                    {L('KS/ASTM 드롭다운. H형강 재질을 고르면 이음판 재질이 자동 선택됩니다(예 A992→A572 Gr50).',
                       'KS/ASTM dropdowns. Choosing the H-shape grade auto-selects the plate grade (e.g. A992 → A572 Gr50).')}
                  </HelpItem>
                  <HelpItem t={L('볼트 · 나사부(N/X)', 'Bolt · Thread (N/X)')}>
                    {L('KS(F10T·S10T·F13T)·ASTM(A325·F1852·A490·F2280). 나사부 N=전단면 통과(0.45Fu)·X=제외(0.563Fu) — AISC/KDS에서만 표시.',
                       'KS (F10T/S10T/F13T), ASTM (A325/F1852/A490/F2280). Thread N = included (0.45Fu), X = excluded (0.563Fu) — shown for AISC/KDS.')}
                  </HelpItem>
                  <HelpItem t={L('볼트직경(표준/지정) · 엇모 · 이음판두께', 'Bolt Ø · Stagger · Plate t')}>
                    {L('「지정」은 행별 직경을 직접 선택. 엇모=지그재그 배치(순단면 B4.3b). 이음판두께 「동일」=내·외 동일두께 설계.',
                       '“Custom” sets diameter per row. Stagger = zig-zag layout (net section B4.3b). Plate t “Equal” = same inner/outer thickness.')}
                  </HelpItem>
                  <HelpItem t={L('강도비 α · 갭', 'Ratio α · Gap')}>
                    {L('α=발현시킬 부재강도 비율(부분강도접합). 갭=이음 이격(0·5·10mm).',
                       'α = fraction of member strength to develop (partial-strength). Gap = splice opening (0/5/10 mm).')}
                  </HelpItem>
                  <HelpItem t={L('⚙ 최적화 (AISC/KDS)', '⚙ Optimize (AISC/KDS)')}>
                    {L('켜면 철판 물량 최소로 DCR≤1.0을 맞춥니다. 볼트로 전강도를 못 내는 초대형 단면은 부분강도(%)로 표시.',
                       'On: minimizes plate steel to reach DCR≤1.0. Jumbo sections that cannot develop full strength show a partial-strength ratio (%).')}
                  </HelpItem>

                  <div className="help-sec">{L('◧ 중앙 결과표', '◧ Center results')}</div>
                  <HelpItem t={L('상단 지표(KPI)', 'Top KPIs')}>
                    {L('검토부재 수·적합/부적합·고력볼트 총본수·강재 물량을 실시간 집계.',
                       'Live totals: sections checked, pass/fail, total bolts, steel quantity.')}
                  </HelpItem>
                  <HelpItem t={L('단면치수 열 (● 상태 · % 부분강도 · ⚠ 간섭 · 용접)', 'Section column (● status · % · ⚠ clash · weld)')}>
                    {L('● 초록=적합·빨강=재검토. % 배지=발현 가능한 최대 강도비(부분강도). ⚠=내부 이음판↔웨브 이음판 간섭(초대형 W단면). 용접=발현율<70% 또는 간섭 → 볼트 대신 용접 splice 권장.',
                       '● green = OK, red = review. % badge = max developable ratio. ⚠ = inner↔web plate clash (jumbo W sections). 용접 = develops <70% or clash → welded splice recommended over bolts.')}
                  </HelpItem>
                  <HelpItem t={L('DCR 열 (클릭 → 항목별)', 'DCR column (click → by item)')}>
                    {L('지배 DCR(소요/설계). 클릭하면 검토항목별 DCR과 우측 상세가 함께 열립니다.',
                       'Governing DCR. Click to open per-item DCR and the right-side detail.')}
                  </HelpItem>
                  <HelpItem t={L('설계강도·볼트·이음판 열', 'Strength · bolts · plates')}>
                    {L('휨/전단 설계강도, 볼트 배열(m×n), 게이지 g1·g2, 외부·내부 이음판/웨브 이음판(두께×폭×길이).',
                       'Moment/shear strength, bolt array (m×n), gauges g1/g2, outer/inner/web plates (t×w×L).')}
                  </HelpItem>

                  <div className="help-sec">{L('▧ 우측 상세 (행 클릭 시)', '▧ Right detail (on row click)')}</div>
                  <HelpItem t={L('접합 상세도(SVG) · 3D 형상', 'Detail drawing (SVG) · 3D')}>
                    {L('평면·입면·단면 접합상세와 3D 형상(볼트·이음판·필렛).',
                       'Plan/elevation/section detail and 3D shape (bolts, plates, fillet).')}
                  </HelpItem>
                  <HelpItem t={L('요약계산서 · 상세계산서', 'Summary · Detailed calc')}>
                    {L('요약=검토항목별 φRn·소요·DCR·판정. 상세=수식 전개 + 블록전단 파단경로 도해.',
                       'Summary = per-item φRn/demand/DCR. Detailed = full formulas + block-shear rupture-path figures.')}
                  </HelpItem>
                  <HelpItem t={L('DXF · IFC · 프로젝트 담기', 'DXF · IFC · Add to project')}>
                    {L('개별 단면 상세 DXF(R12), BIM 연동 IFC, 프로젝트 목록 담기.',
                       'Single-section detail DXF (R12), BIM IFC, add to project list.')}
                  </HelpItem>

                  <div className="help-sec">{L('ⓘ 알아두기', 'ⓘ Good to know')}</div>
                  <HelpItem t={L('부분강도접합', 'Partial-strength splice')}>
                    {L('점보/초대형 단면은 볼트 이음으로 부재 전강도를 낼 수 없어 소요를 부재강도로 캡핑합니다(발현비 %).',
                       'Jumbo sections cannot develop full member strength through a bolted splice, so demand is capped (% ratio).')}
                  </HelpItem>
                  <HelpItem t={L('블록전단 Case A/B/C/D', 'Block shear Case A/B/C/D')}>
                    {L('볼트군이 U자(전열/내측쌍)·L자(외연/중앙)로 뜯기는 후보 파단을 모두 검토해 최소 지배값 채택. 상세계산서에 파단선으로 도시.',
                       'Evaluates U-shaped (full/inner-pair) and L-shaped (outer/central) tear-out patterns, taking the minimum. Shown in the detailed calc.')}
                  </HelpItem>
                  <HelpItem t={L('DXF 버전 (R12 / AC1009)', 'DXF version (R12 / AC1009)')}>
                    {L('AutoCAD·모든 뷰어 호환을 위해 R12로 저장하며, 생성 시 구조(테이블·엔트리명·섹션순서)를 엄격 검증합니다.',
                       'Saved as R12 for AutoCAD and all viewers, with strict structure validation (tables, entry names, section order) at export.')}
                  </HelpItem>
                </div>
              </>
            )}
          </div>
          <div className="seg-theme" role="group" aria-label={L('언어 전환', 'Language')}>
            <button type="button" className={lang === 'ko' ? 'on' : ''} onClick={() => setLang('ko')} aria-pressed={lang === 'ko'} title="한국어">한</button>
            <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')} aria-pressed={lang === 'en'} title="English">EN</button>
          </div>
          <div className="seg-theme" role="group" aria-label={L('테마 전환', 'Theme')}>
            <button type="button" className={dark ? 'on' : ''} onClick={() => setDark(true)} aria-pressed={dark} title={L('다크 모드', 'Dark')} aria-label={L('다크 모드', 'Dark')}>☾</button>
            <button type="button" className={!dark ? 'on' : ''} onClick={() => setDark(false)} aria-pressed={!dark} title={L('화이트 모드', 'Light')} aria-label={L('화이트 모드', 'Light')}>☀</button>
          </div>
          <a className="fb-btn" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer"
            title={L('사용자 피드백 (구글 폼, 새 탭)', 'User feedback (Google Form, new tab)')}>💬 {L('피드백', 'Feedback')}</a>
        </header>

        <div className="cbody">
          <aside className="cfilters">
            <div className="cfilters-h">☰ {L('설계 조건', 'Design Conditions')}</div>
            <FilterBar cond={cond} onChange={setCond} boltMode={boltMode} onBoltMode={setBoltMode} />
            {usesLimitState(cond.designStd) && (
              <div className="cf-autofix">
                <button type="button" className={autoFix ? 'on' : ''} onClick={() => setAutoFix(v => !v)} aria-pressed={autoFix} title={L('전체 부재 AISC 최적화 — 철판 물량 최소로 DCR≤1.0 달성(부재지배는 부분강도)', 'Optimize all members — minimum plate to reach DCR≤1.0 (member-governed → partial strength)')}>⚙ {L('최적화', 'Optimize')}</button>
              </div>
            )}
            <div className="cfilters-hint">▸ {L('조건을 바꾸면 결과표가 즉시 갱신됩니다.', 'Changing conditions updates the table instantly.')}</div>
          </aside>

          <div className="ccenter">
            <div className="kpi-strip">
              <div className="kpi k1"><span className="k">{L('검토 부재', 'Members')}</span> <span className="v num">{stats.total}</span> <span className="d">{tMember(cond.member, lang)} · {tJoint(cond.jointType, lang)}</span></div>
              <div className="kpi k2"><span className="k">{L('적합', 'Pass')}</span> <span className="v num ok">{stats.ok}</span> <span className="d ok">{stats.total ? Math.round(stats.ok / stats.total * 100) : 0}%</span> <span className="k">{L('부적합', 'Fail')}</span> <span className="v num ng">{stats.total - stats.ok}</span></div>
              <div className="kpi k3"><span className="k">{L('고력볼트', 'Bolts')}</span> <span className="v num">{nf(stats.bolts)}<small> {L('본', 'ea')}</small> / {(stats.boltWt / 1000).toFixed(2)}<small> ton</small></span> <span className="d">{cond.bolt}</span></div>
              <div className="kpi k4"><span className="k">{L('이음판', 'Plates')}</span> <span className="v num">{(stats.wt / 1000).toFixed(2)}<small> ton</small></span></div>
            </div>
            <div className="cgrid"><ResultTable cond={cond} onSelect={setSelected} onView3D={setView3D} custom={boltMode === 'Custom'} diaAt={diaAt} onSetDia={setDiaAt} selectedSection={selected?.section} autoFix={autoFix} hidden={hidden} onHide={hideSection} onResetHidden={resetHidden} onDcrClick={setDcrView} /></div>
          </div>

          <aside className="cdetail">
            {selEff ? (
              <>
                <div className="dh">{sectionByName(selEff.section)?.label ?? selEff.section}
                  {sectionByName(selEff.section)?.label && <span className="dh-mm">{selEff.section}</span>}
                  <span className="dbadge">{autoFix && usesLimitState(cond.designStd) ? L('최적화', 'Optimized') : L('선택됨', 'Selected')}</span></div>
                <div className="dsub">{tMember(cond.member, lang)} · {tJoint(cond.jointType, lang)} · {cond.steel} · {cond.bolt}</div>
                <div className="dspecs">
                  <div><span>{isCol ? L('압축강도', 'Compression') : L('휨모멘트', 'Moment')}</span><b>{nf(isCol ? selEff.Puf_kN : selEff.Mu_kNm)} kN{isCol ? '' : '·m'}</b></div>
                  <div><span>{L('플랜지 볼트', 'Flange bolts')}</span><b>{selEff.flange.bolt.m}×{selEff.flange.bolt.n} · {selEff.flange.bolt.m * Math.round(selEff.flange.bolt.n) * 4}-M{selEff.boltDia}</b></div>
                  <div><span>{L('외부 이음판', 'Outer plate')}</span><b>{plate(selEff.flange.outerPlate)} ×2</b></div>
                  <div><span>{L('내부 이음판', 'Inner plate')}</span><b>{selEff.flange.innerPlate ? `${plate(selEff.flange.innerPlate)} ×4` : '—'}</b></div>
                  <div><span>{L('웨브 볼트', 'Web bolts')}</span><b>{selEff.web.bolt.m}×{selEff.web.bolt.n} · {selEff.web.bolt.m * selEff.web.bolt.n * 2}-M{selEff.boltDia}</b></div>
                  <div><span>{L('웨브 이음판', 'Web plate')}</span><b>{plate(selEff.web.webPlate)} ×2</b></div>
                  {detailQ && <>
                    <div className="dspec-hd"><span>{L('고력볼트', 'H.S. bolts')} (KS B 1010)</span><b>{detailQ.boltSpec.totalCount}{L('본', 'ea')} · {detailQ.boltWeightKg} kg</b></div>
                    <div><span>{L('플랜지볼트', 'Flange bolts')}</span><b>M{selEff.boltDia} L{detailQ.boltSpec.flange.length} · {detailQ.boltSpec.flange.count}{L('본', 'ea')} · {detailQ.boltSpec.flange.totalKg} kg</b></div>
                    <div><span>{L('웨브볼트', 'Web bolts')}</span><b>M{selEff.boltDia} L{detailQ.boltSpec.web.length} · {detailQ.boltSpec.web.count}{L('본', 'ea')} · {detailQ.boltSpec.web.totalKg} kg</b></div>
                  </>}
                </div>
                <div className="dact">
                  <button className="db primary" title={L('소요강도·설계강도·판정을 요약한 계산서를 엽니다', 'Open a summary calc sheet: demand, capacity and check')} onClick={() => setShowReport(true)}>{L('요약계산서', 'Summary')}</button>
                  <button className="db" title={L('수식·대입·근거조항까지 포함한 상세 계산서를 엽니다', 'Open the detailed calc sheet with formulas, substitutions and clauses')} onClick={() => setShowDetail(true)}>{L('상세계산서', 'Detailed')}</button>
                  <button className="db" title={L('이 단면의 접합상세도를 DXF(CAD) 파일로 내보냅니다', 'Export this connection detail as a DXF (CAD) file')} onClick={() => exportOneDXF(selEff)}>DXF</button>
                  <button className="db" title={L('접합부를 3D로 확인합니다', 'View the connection in 3D')} onClick={() => setView3D(selEff)}>3D</button>
                  <button className="db" title={L('BIM 연동용 IFC 파일로 내보냅니다', 'Export an IFC file for BIM')} onClick={() => exportOneIFC(selEff)}>IFC</button>
                  <button className="db" title={L('이 단면을 프로젝트 목록에 담습니다(집계·저장)', 'Add this section to the project list (aggregate & save)')} onClick={() => addToProject(selEff)}>＋ {L('프로젝트', 'Project')}</button>
                </div>
                <div className="dprev">
                  <button className="prev-zoom" title={L('크게 보기', 'Enlarge')} onClick={() => setZoomPrev(true)}>🔍</button>
                  <ConnectionSVG r={selEff} cond={cond} />
                </div>
              </>
            ) : (
              <div className="dempty">
                <div className="de-ic">▤</div>
                <p>{L(<>좌측 표에서 <b>부재를 선택</b>하면<br />접합 상세·물량·도면이 여기에 표시됩니다.</>,
                      <>Select a <b>member</b> from the table to see<br />connection details, quantities and drawings.</>)}</p>
              </div>
            )}
          </aside>
        </div>

        <div className="cstat">
          <span className="sdot" />
          <span>{L(`실시간 계산 · ${stats.total}/${stats.total} 완료`, `Live calc · ${stats.total}/${stats.total} done`)}</span>
          <span className="sright">{L('KBC-09 · 한국강구조학회 표준접합상세', 'KBC-09 · KSSC Standard Connection')}</span>
        </div>
      </div>

      <Suspense fallback={<div className="lazy-load">{L('불러오는 중…', 'Loading…')}</div>}>
        {showReport && selEff && (usesLimitState(cond.designStd)
          ? <AiscCalcReport result={selEff} cond={cond} onClose={() => setShowReport(false)} />
          : <CalcReport result={selEff} cond={cond} onClose={() => setShowReport(false)} onAdd={addToProject} />)}
        {showDetail && selEff && (usesLimitState(cond.designStd)
          ? <AiscDetailReport result={selEff} cond={cond} onClose={() => setShowDetail(false)} />
          : <KbcDetailReport result={selEff} cond={cond} onClose={() => setShowDetail(false)} />)}
        {showQty && <QuantityPanel cond={cond} diaAt={diaAt} autoFix={autoFix} onClose={() => setShowQty(false)} />}
        {showProj && <ProjectPanel items={project} onChange={setProject} onClose={() => setShowProj(false)} />}
        {view3D && <ThreeViewer r={view3D} cond={cond} onClose={() => setView3D(null)} />}
        {dcrView && <DcrPopup r={dcrView.r} cond={cond} fScale={dcrView.fScale} wScale={dcrView.wScale} onClose={() => setDcrView(null)} />}
      </Suspense>
      {zoomPrev && selEff && (
        <div className="prev-back" onClick={() => setZoomPrev(false)}>
          <div className="prev-modal" onClick={e => e.stopPropagation()}>
            <div className="prev-modal-hd">
              <span>{selEff.section} · {tMember(cond.member, lang)} {tJoint(cond.jointType, lang)}</span>
              <div className="prev-modal-act">
                <button className="db" title={L('이 접합상세도를 DXF(CAD) 파일로 내보냅니다', 'Export this detail as a DXF (CAD) file')} onClick={() => exportOneDXF(selEff)}>DXF</button>
                <button className="prev-close" title={L('닫기', 'Close')} onClick={() => setZoomPrev(false)}>✕</button>
              </div>
            </div>
            <div className="prev-modal-bd"><ConnectionSVG r={selEff} cond={cond} /></div>
          </div>
        </div>
      )}
    </div>
    </LangContext.Provider>
  );
}
