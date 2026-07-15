import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DesignCondition, DesignResult } from './engine/types.ts';
import FilterBar from './components/FilterBar.tsx';
import ResultTable from './components/ResultTable.tsx';
import CalcReport from './components/CalcReport.tsx';
import QuantityPanel from './components/QuantityPanel.tsx';
import ProjectPanel from './components/ProjectPanel.tsx';
import ConnectionSVG from './components/ConnectionSVG.tsx';
import ThreeViewer from './components/ThreeViewer.tsx';
import { loadProject, persistProject, newItem, type ProjectItem } from './engine/project.ts';
import { LangContext, type Lang, tMember, tJoint } from './i18n.ts';
import { SECTIONS } from './engine/sections.ts';
import { designConnection } from './engine/engine.ts';
import { toDXF, toDXFAll, downloadFile } from './engine/dxf.ts';
import { toIFC } from './engine/ifcOut.ts';
import { quantityOf } from './engine/quantity.ts';

const DEFAULT: DesignCondition = {
  member: '보', jointType: '마찰', steel: 'SN355', plateSteel: 'SN355', bolt: 'F10T', strengthRatio: 1.0, sectionType: '압연',
};
const nf = (v?: number) => v == null ? '—' : v.toLocaleString('en-US');
const plate = (p?: { t: number; w: number; L: number }) => p ? `${p.t}×${p.w}×${p.L}` : '—';

export default function App() {
  const [cond, setCond] = useState<DesignCondition>(DEFAULT);
  const [selected, setSelected] = useState<DesignResult | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [showQty, setShowQty] = useState(false);
  const [showProj, setShowProj] = useState(false);
  const [view3D, setView3D] = useState<DesignResult | null>(null);
  const [boltMode, setBoltMode] = useState<'Default' | 'Custom'>('Default');
  const [boltOv, setBoltOv] = useState<Record<number, number>>({});   // 행index → 지정직경(위 행 따름)
  const [project, setProject] = useState<ProjectItem[]>(loadProject);
  const [dark, setDark] = useState<boolean>(() => {
    const s = localStorage.getItem('splice_theme');
    return s ? s === 'dark' : true;          // 기본 다크, 이후 선택 기억
  });
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('splice_lang') as Lang) || 'ko');
  const L = <K,>(ko: K, en: K): K => (lang === 'en' ? en : ko);   // 짧은 인라인 번역 헬퍼

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('splice_theme', dark ? 'dark' : 'light');
  }, [dark]);
  useEffect(() => { localStorage.setItem('splice_lang', lang); }, [lang]);
  useEffect(() => { persistProject(project); }, [project]);

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
    SECTIONS.forEach((s, i) => {
      const r = designConnection(cond, s, diaAt(i));
      const q = quantityOf(r, cond);
      bolts += q.boltCount; wt += q.plateWeightKg; boltWt += q.boltWeightKg;
      if (!r.steps.some(st => st.check === 'NG')) ok++;
    });
    return { bolts, wt: Math.round(wt), boltWt: Math.round(boltWt), ok, total: SECTIONS.length };
  }, [cond, diaAt]);

  const detailQ = useMemo(() => (selected ? quantityOf(selected, cond) : null), [selected, cond]);

  const addToProject = (r: DesignResult) => setProject(p => [...p, newItem(r.section, cond)]);
  const exportAllDXF = () => {
    const rows = SECTIONS.map((s, i) => designConnection(cond, s, diaAt(i)));
    downloadFile(`splice_전체_${cond.member}_${cond.jointType}.dxf`, toDXFAll(rows, cond), 'application/dxf');
  };
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
        <span className="rspace" />
      </aside>

      <div className="cmain">
        <header className="ctop">
          <div className="cbrand">SPLICE<span className="accent">DESIGN</span></div>
          <FilterBar cond={cond} onChange={setCond} boltMode={boltMode} onBoltMode={setBoltMode} />
          <div className="seg-theme" role="group" aria-label={L('언어 전환', 'Language')}>
            <button type="button" className={lang === 'ko' ? 'on' : ''} onClick={() => setLang('ko')} aria-pressed={lang === 'ko'} title="한국어">한</button>
            <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')} aria-pressed={lang === 'en'} title="English">EN</button>
          </div>
          <div className="seg-theme" role="group" aria-label={L('테마 전환', 'Theme')}>
            <button type="button" className={dark ? 'on' : ''} onClick={() => setDark(true)} aria-pressed={dark} title={L('다크 모드', 'Dark')} aria-label={L('다크 모드', 'Dark')}>☾</button>
            <button type="button" className={!dark ? 'on' : ''} onClick={() => setDark(false)} aria-pressed={!dark} title={L('화이트 모드', 'Light')} aria-label={L('화이트 모드', 'Light')}>☀</button>
          </div>
        </header>

        <div className="kpi-strip">
          <div className="kpi"><div className="k">{L('검토 부재', 'Members')}</div><div className="v num">{stats.total}</div><div className="d">{tMember(cond.member, lang)} · {tJoint(cond.jointType, lang)}</div></div>
          <div className="kpi"><div className="k">{L('적합', 'Pass')}</div><div className="v num ok">{stats.ok}</div><div className="d ok">{Math.round(stats.ok / stats.total * 100)}%</div></div>
          <div className="kpi"><div className="k">{L('부적합', 'Fail')}</div><div className="v num ng">{stats.total - stats.ok}</div><div className="d ng">{stats.total - stats.ok ? L('재검토', 'recheck') : '—'}</div></div>
          <div className="kpi"><div className="k">{L('고력볼트', 'H.S. Bolts')}</div><div className="v num">{nf(stats.bolts)}<small> {L('본', 'ea')}</small> / {(stats.boltWt / 1000).toFixed(2)}<small> t</small></div><div className="d">{cond.bolt}</div></div>
          <div className="kpi"><div className="k">{L('강재 물량', 'Steel Qty')}</div><div className="v num">{(stats.wt / 1000).toFixed(2)}<small> t</small></div><div className="d">{L('첨판', 'plates')}</div></div>
        </div>

        <div className="cbody">
          <div className="cgrid"><ResultTable cond={cond} onSelect={setSelected} onView3D={setView3D} custom={boltMode === 'Custom'} diaAt={diaAt} onSetDia={setDiaAt} selectedSection={selected?.section} /></div>
          <aside className="cdetail">
            {selected ? (
              <>
                <div className="dh">{selected.section}<span className="dbadge">{L('선택됨', 'Selected')}</span></div>
                <div className="dsub">{tMember(cond.member, lang)} · {tJoint(cond.jointType, lang)} · {cond.steel} · {cond.bolt}</div>
                <div className="dspecs">
                  <div><span>{isCol ? L('압축강도', 'Compression') : L('휨모멘트', 'Moment')}</span><b>{nf(isCol ? selected.Puf_kN : selected.Mu_kNm)} kN{isCol ? '' : '·m'}</b></div>
                  <div><span>{L('플랜지 볼트', 'Flange bolts')}</span><b>{selected.flange.bolt.m}×{selected.flange.bolt.n} · {selected.flange.bolt.m * Math.round(selected.flange.bolt.n) * 4}-M{selected.boltDia}</b></div>
                  <div><span>{L('외첨판', 'Outer plate')}</span><b>{plate(selected.flange.outerPlate)} ×2</b></div>
                  <div><span>{L('내첨판', 'Inner plate')}</span><b>{selected.flange.innerPlate ? `${plate(selected.flange.innerPlate)} ×4` : '—'}</b></div>
                  <div><span>{L('웨브 볼트', 'Web bolts')}</span><b>{selected.web.bolt.m}×{selected.web.bolt.n} · {selected.web.bolt.m * selected.web.bolt.n * 2}-M{selected.boltDia}</b></div>
                  <div><span>{L('웨브첨판', 'Web plate')}</span><b>{plate(selected.web.webPlate)} ×2</b></div>
                  {detailQ && <>
                    <div className="dspec-hd"><span>{L('고력볼트', 'H.S. bolts')} (KS B 1010)</span><b>{detailQ.boltSpec.totalCount}{L('본', 'ea')} · {detailQ.boltWeightKg} kg</b></div>
                    <div><span>{L('플랜지볼트', 'Flange bolts')}</span><b>M{selected.boltDia} L{detailQ.boltSpec.flange.length} · {detailQ.boltSpec.flange.count}{L('본', 'ea')} · {detailQ.boltSpec.flange.totalKg} kg</b></div>
                    <div><span>{L('웨브볼트', 'Web bolts')}</span><b>M{selected.boltDia} L{detailQ.boltSpec.web.length} · {detailQ.boltSpec.web.count}{L('본', 'ea')} · {detailQ.boltSpec.web.totalKg} kg</b></div>
                  </>}
                </div>
                <div className="dact">
                  <button className="db primary" onClick={() => setShowReport(true)}>{L('상세 계산서', 'Calc Sheet')}</button>
                  <button className="db" onClick={() => exportOneDXF(selected)}>DXF</button>
                  <button className="db" onClick={() => setView3D(selected)}>3D</button>
                  <button className="db" onClick={() => exportOneIFC(selected)}>IFC</button>
                  <button className="db" onClick={() => addToProject(selected)}>＋ {L('프로젝트', 'Project')}</button>
                </div>
                <div className="dprev"><ConnectionSVG r={selected} cond={cond} /></div>
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

      {showReport && selected && <CalcReport result={selected} cond={cond} onClose={() => setShowReport(false)} onAdd={addToProject} />}
      {showQty && <QuantityPanel cond={cond} diaAt={diaAt} onClose={() => setShowQty(false)} />}
      {showProj && <ProjectPanel items={project} onChange={setProject} onClose={() => setShowProj(false)} />}
      {view3D && <ThreeViewer r={view3D} cond={cond} onClose={() => setView3D(null)} />}
    </div>
    </LangContext.Provider>
  );
}
