import { useState, useMemo, Fragment } from 'react';
import type { DesignCondition, DesignResult, Plate, BoltArray } from '../engine/types.ts';
import { catalogForCond, applyStdPlates, isStdMode, ksUsedHB } from '../engine/standard/schedule.ts';
import { ksClassOf, ksClassLabel, ksLabelOf } from '../engine/standard/ksData.ts';
import { designConnection } from '../engine/engine.ts';
import { aiscCheck, aiscAutoCorrect } from '../engine/aisc/compat.ts';
import { kbcCheck } from '../engine/kbcCheck.ts';
import { usesLimitState } from '../engine/std.ts';
import { nominalOf, unitWeightOf } from '../engine/hbeam_catalog.ts';
import { innerWebClash } from '../engine/connParts.ts';
import { useLang } from '../i18n.ts';

const nf = (v?: number) => v == null ? '' : v.toLocaleString('en-US');   // 1000+ 콤마
const fmtPlate = (p?: Plate) => p ? `${p.t}×${p.w}×${p.L}` : null;   // 판 치수(mm)는 콤마 없이 — 도면 관례·열폭 절약
const fmtBolt = (b: BoltArray) => `${b.m}×${b.n % 1 ? b.n.toFixed(1) : b.n}`;
const fmtW = (w: number) => w.toLocaleString('en-US');                   // 단위무게

const DIAS = [16, 20, 22, 24, 27, 30];   // 사용 직경(M27·M30=KDS 표준구멍 d+3)

export default function ResultTable({ cond, onSelect, onView3D, custom, diaAt, onSetDia, selectedSection, autoFix, hidden, onHide, onResetHidden, onDcrClick }: {
  cond: DesignCondition; onSelect: (r: DesignResult) => void; onView3D: (r: DesignResult) => void;
  custom?: boolean; diaAt?: (i: number) => number | undefined; onSetDia?: (i: number, d: number) => void;
  selectedSection?: string; autoFix?: boolean;
  hidden?: Set<string>; onHide?: (name: string) => void; onResetHidden?: () => void;
  onDcrClick?: (p: { r: DesignResult; fScale: number; wScale: number }) => void;
}) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const isCol = cond.member === '기둥';
  const isAisc = usesLimitState(cond.designStd);   // AISC·KDS = 한계상태 엔진(aiscCheck)
  // 원본 인덱스(i) 유지 — Custom 직경 지정(diaAt/onSetDia)은 카탈로그 순번 기준.
  // 최적화(자동보정) 기본 ON → 행별 옵티마이저를 memo로 캐시(선택 등 재렌더 시 재계산 방지).
  const isStd = isStdMode(cond.mode);
  const isK = cond.mode === 'K';   // KS전단면 모드 — S·H 채택단면 굵게
  const allRows = useMemo(() => catalogForCond(cond).map((s, i) => {
    let r = designConnection(cond, s, diaAt?.(i));
    if (isStd && !autoFix) r = applyStdPlates(r, cond);     // S·최적화OFF=표준 판 고정
    const ac = (isAisc && autoFix) ? aiscAutoCorrect(r, cond) : null;  // 최적화ON=옵티마이저(판두께·볼트수 조절→중량최소·DCR≤1)
    const dr = ac ? ac.result : r;                       // 표시 형상(최적화 반영)
    const govDcr = ac ? ac.report.govDcr : (isAisc ? aiscCheck(r, cond).govDcr : kbcCheck(r, cond).govDcr);
    const partial = ac && ac.memberLimited ? Math.min(ac.flangeScale, ac.webScale) : null;  // 부분강도 최대비율
    const fScale = ac ? ac.flangeScale : 1, wScale = ac ? ac.webScale : 1;   // DCR팝업 캡핑 기준(테이블 일치)
    const clash = innerWebClash(dr);                       // 내부 이음판↔웨브 이음판 간섭(시공성)
    return { s, i, r, dr, govDcr, partial, fScale, wScale, clash };
  }), [cond, diaAt, autoFix, isAisc]);
  const rows = allRows.filter(({ s }) => !hidden?.has(s.name));
  const dbW = 46;                                     // 볼트 직경열: 지정/표준 동일 폭(토글 시 표 흔들림 방지)
  const hasHidden = (hidden?.size ?? 0) > 0;
  // 삭제 선택(체크) → 헤더 아이콘: + 선택만 남김 / − 선택 제외 / ⟳ 초기화
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const toggleCheck = (name: string) => setChecked(c => { const n = new Set(c); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const hideMany = (names: string[]) => { names.forEach(n => onHide?.(n)); setChecked(new Set()); };
  const keepOnly = () => hideMany(rows.filter(({ s }) => !checked.has(s.name)).map(({ s }) => s.name));  // 선택만 남김
  const excludeChecked = () => hideMany(rows.filter(({ s }) => checked.has(s.name)).map(({ s }) => s.name)); // 선택 제외
  const doReset = () => { onResetHidden?.(); setChecked(new Set()); };
  const checkedVisible = rows.reduce((a, { s }) => a + (checked.has(s.name) ? 1 : 0), 0);

  return (
    <div className="tablewrap">
      <table className="design-table">
        <colgroup>
          {isK && <col style={{ width: 78 }} />}
          <col style={{ width: 138 }} /><col style={{ width: 34 }} /><col style={{ width: 32 }} /><col style={{ width: 40 }} />
          <col style={{ width: 46 }} /><col style={{ width: 44 }} />
          <col style={{ width: dbW }} />
          <col style={{ width: 40 }} /><col style={{ width: 28 }} /><col style={{ width: 28 }} />
          <col style={{ width: 80 }} /><col style={{ width: 80 }} />
          <col style={{ width: 40 }} /><col style={{ width: 28 }} /><col style={{ width: 80 }} />
        </colgroup>
        <thead>
          <tr>
            {isK && <th rowSpan={2} className="g-info" style={{ textAlign: 'center' }}>KS<br /><span className="unit">LABEL</span></th>}
            <th rowSpan={2} className="col-name g-info">
              <span className="cn-head">{L('단면치수', 'Section')}</span>
              <span className="col-tools">
                <button className="col-keep" disabled={checkedVisible === 0} title={L('선택 단면만 남기기', 'Keep only checked')}
                  onClick={keepOnly}>＋</button>
                <button className="col-excl" disabled={checkedVisible === 0} title={L('선택 단면 제외', 'Exclude checked')}
                  onClick={excludeChecked}>－</button>
                <button className="col-reset" disabled={!hasHidden} title={L('전체 단면 복원', 'Restore all')}
                  onClick={doReset}>⟳</button>
              </span>
            </th>
            <th rowSpan={2} className="g-info dcr-h">DCR</th>
            <th rowSpan={2} className="g-info">r<br /><span className="unit">mm</span></th>
            <th rowSpan={2} className="gcol g-info">{L('단위중량', 'Unit wt')}<br /><span className="unit">kg/m</span></th>
            <th colSpan={2} className="gcol g-str">{L('설계강도', 'Design Strength')}</th>
            <th rowSpan={2} className="gcol g-bolt">{L('볼트', 'Bolt')}<br />d<sub>b</sub></th>
            <th colSpan={5} className="gcol g-fl">{L('플랜지', 'Flange')}</th>
            <th colSpan={3} className="gcol g-web">{L('웨브', 'Web')}</th>
          </tr>
          <tr>
            <th>{isCol ? L('압축강도', 'Compression') : L('휨모멘트', 'Moment')}<br />kN{isCol ? '' : '·m'}</th>
            <th className="gcol">{isCol ? L('웨브압축', 'Web comp.') : L('전단력', 'Shear')}<br />kN</th>
            <th>{L('볼트열', 'Bolts')}<br />m×n</th>
            <th>g₁</th>
            <th className="gcol">g₂</th>
            <th>{L('외부 이음판', 'Outer PL')}</th>
            <th className="gcol">{L('내부 이음판', 'Inner PL')}<br /><span className="unit">{L('t×폭×길이', 't×w×L')}</span></th>
            <th>{L('볼트열', 'Bolts')}<br />m×n</th>
            <th>P<sub>c</sub></th>
            <th>{L('이음판', 'Web PL')}<br /><span className="unit">{L('t×춤×너비', 't×d×w')}</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, i, r, dr, govDcr, partial, fScale, wScale, clash }, idx) => {
            const nominal = nominalOf(s.H, s.B);
            const newSeries = idx === 0 || nominal !== nominalOf(rows[idx - 1].s.H, rows[idx - 1].s.B);
            const inner = fmtPlate(dr.flange.innerPlate);
            const ng = govDcr != null ? govDcr > 1.0 : r.steps.some(st => st.check === 'NG');
            const sel = r.section === selectedSection;
            // K 모드: 계열(WIDE/MIDDLE/NARROW) 전환 시 구분 밴드 삽입
            const cls = isK ? ksClassOf(s.name) : undefined;
            const prevCls = isK && idx > 0 ? ksClassOf(rows[idx - 1].s.name) : undefined;
            const showBand = !!cls && cls !== prevCls;
            // K 모드: KS LABEL(공칭 호칭) 병합 — 연속 동일 호칭의 첫 행에만 rowSpan 셀 출력
            const ksLabel = isK ? ksLabelOf(s.name) : undefined;
            const labelFirst = isK && ksLabel !== (idx > 0 ? ksLabelOf(rows[idx - 1].s.name) : undefined);
            let labelSpan = 1;
            if (labelFirst) for (let j = idx + 1; j < rows.length && ksLabelOf(rows[j].s.name) === ksLabel; j++) labelSpan++;
            return (
              <Fragment key={r.section}>
              {showBand && (
                <tr className="cls-band">
                  <td colSpan={16} style={{ fontWeight: 800, textAlign: 'left', padding: '5px 10px', fontSize: '11.5px', letterSpacing: '0.4px', background: 'rgba(127,127,127,0.16)' }}>
                    {ksClassLabel(cls!)}
                  </td>
                </tr>
              )}
              <tr onClick={() => onSelect(dr)} className={`${newSeries ? 'series-top' : ''}${sel ? ' row-sel' : ''}`}>
                {isK && labelFirst && (
                  <td rowSpan={labelSpan} className="ks-label" style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 500, background: 'rgba(127,127,127,0.06)', borderRight: '0.5px solid var(--border, #ccc)' }}>
                    {ksLabel}
                  </td>
                )}
                <td className="col-name">
                  <input type="checkbox" className="row-chk" checked={checked.has(s.name)}
                    title={L('삭제 선택', 'Mark for deletion')} onClick={e => e.stopPropagation()}
                    onChange={e => { e.stopPropagation(); toggleCheck(s.name); }} />
                  <span className={`st-dot${ng ? ' ng' : ''}`} title={ng ? '재검토' : '적합'} />
                  <button className="cn-txt" style={isK ? { fontWeight: ksUsedHB(s.H, s.B) ? 800 : 400 } : undefined}
                    title={isK && ksUsedHB(s.H, s.B) ? `${r.section} · S·H 표준 채택단면` : (s.label ? `${s.label} · ${r.section}` : L('선택 + 3D 형상 보기', 'Select + view 3D shape'))} onClick={e => { e.stopPropagation(); onSelect(dr); onView3D(dr); }}>
                    {s.label
                      ? <span className="cn-two"><span className="cn-nom">{s.label}</span><span className="cn-mm">{r.section}</span></span>
                      : r.section}</button>
                  {partial != null && <span className="cn-partial"
                    title={L('부분강도접합 — 발현 가능한 최대 강도비율', 'Partial-strength splice — max developable ratio')}>
                    {Math.round(partial * 100)}%</span>}
                  {clash && <span className="cn-clash"
                    title={L(`내부 이음판 ↔ 웨브 이음판 간섭 ${clash.oy}mm — 상세화 재검토 필요(초대형 부분강도 단면)`, `inner ↔ web plate overlap ${clash.oy}mm — revise detailing (jumbo partial-strength section)`)}>⚠</span>}
                  {((partial != null && partial < 0.70) || clash) && <span className="cn-weld"
                    title={L(
                      clash ? '용접 splice 권장 — 내부↔웨브 이음판 간섭으로 볼트 상세 불가' : `용접 splice 권장 — 볼트 발현율 ${Math.round((partial ?? 0) * 100)}% (<70%)`,
                      clash ? 'Welded splice recommended — inner/web plate clash prevents bolted detailing' : `Welded splice recommended — bolt develops only ${Math.round((partial ?? 0) * 100)}% (<70%)`)}>용접</span>}</td>
                <td className={`dcr-cell${govDcr != null && govDcr > 1.0 ? ' ng' : ''}${govDcr != null ? ' dcr-click' : ''}`}
                  title={govDcr == null ? undefined : L('선택 + 검토항목별 DCR 보기', 'Select + view DCR by limit state')}
                  onClick={govDcr != null ? (e => { e.stopPropagation(); onSelect(dr); onDcrClick?.({ r: dr, fScale, wScale }); }) : undefined}>
                  {govDcr != null ? govDcr.toFixed(2) : <span className="dash">—</span>}</td>
                <td>{s.r}</td>
                <td className="gcol">{fmtW(unitWeightOf(s))}</td>
                <td>{nf(isCol ? dr.Puf_kN : dr.Mu_kNm)}</td>
                <td className="gcol">{nf(dr.Vu_kN)}</td>
                <td className="gcol">{custom
                  ? <select className="dia-sel" value={dr.boltDia} onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); onSetDia?.(i, Number(e.target.value)); }}>
                      {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  : dr.boltDia}</td>
                <td>{fmtBolt(dr.flange.bolt)}</td>
                <td>{dr.flange.gauge?.g1}</td>
                <td className="gcol">{dr.flange.gauge?.g2 ?? <span className="dash">—</span>}</td>
                <td>{fmtPlate(dr.flange.outerPlate)}</td>
                <td className="gcol">{inner ?? <span className="dash">—</span>}</td>
                <td>{fmtBolt(dr.web.bolt)}</td>
                <td>{dr.web.Pc ?? <span className="dash">—</span>}</td>
                <td>{fmtPlate(dr.web.webPlate)}</td>
              </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
