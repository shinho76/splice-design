import type { DesignCondition, DesignResult, CalcStep } from '../engine/types.ts';
import ConnectionSVG from './ConnectionSVG.tsx';
import { toDXF, downloadFile } from '../engine/dxf.ts';
import { useLang, tr, tMember, tJoint } from '../i18n.ts';

const nf = (v: number | undefined) => v == null ? '' : v.toLocaleString('en-US');
const stripPrefix = (g: string) => g.replace(/^[가-힣]\)\s*/, '');   // "가) ..." → "..."

/** 전문 설계 계산서 — 목차 + 1. 2. 번호 체계 + 접합 상세도 (제9장 예제 형식) */
export default function CalcReport({ result, cond, onClose, onAdd }: {
  result: DesignResult; cond: DesignCondition; onClose: () => void; onAdd?: (r: DesignResult) => void;
}) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  // 그룹을 등장 순서대로 정리 → 1, 2, 3 …
  const order: string[] = [];
  const groups: Record<string, CalcStep[]> = {};
  for (const s of result.steps) { if (!groups[s.group]) order.push(s.group); (groups[s.group] ??= []).push(s); }
  const secs = order.map((g, i) => ({ no: i + 1, title: stripPrefix(g), steps: groups[g] }));

  const exportDXF = () => downloadFile(`${result.section}_${cond.jointType}.dxf`, toDXF(result, cond), 'application/dxf');
  const pct = Math.round(cond.strengthRatio * 100);

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card doc" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          {onAdd && <button className="tool-btn" onClick={() => onAdd(result)}>＋ {L('프로젝트 담기', 'Add to Project')}</button>}
          <button className="tool-btn" onClick={exportDXF}>⬇ DXF</button>
          <button className="tool-btn" onClick={() => window.print()}>🖨 {L('PDF 저장', 'Save PDF')}</button>
          <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
        </div>

        {/* 표제부 */}
        <div className="doc-head">
          <div className="doc-kicker">STRUCTURAL CALCULATION SHEET</div>
          <h2>{L('고력볼트 표준접합부 설계 계산서', 'High-Strength Bolt Standard Connection — Design Calculation')}</h2>
          <table className="doc-meta">
            <tbody>
              <tr><th>{L('부재 / 접합', 'Member / Joint')}</th><td>{tMember(cond.member, lang)} · {tJoint(cond.jointType, lang)}</td><th>{L('단면', 'Section')}</th><td>{result.section}</td></tr>
              <tr><th>{L('강종 / 볼트', 'Steel / Bolt')}</th><td>{L('H형강', 'H-beam')} {cond.steel} · {L('첨판', 'plate')} {cond.plateSteel ?? cond.steel} / {L('고력볼트', 'H.S. bolt')} {cond.bolt}</td><th>{L('부분강도비 α', 'Partial-strength ratio α')}</th><td>{pct}%</td></tr>
              <tr><th>{L('설계기준', 'Design Code')}</th><td colSpan={3}>{L('KBC-09 한계상태설계법 · 한국강구조학회 고력볼트 표준접합 설계편람', 'KBC-09 LRFD · KSSC High-Strength Bolt Standard Connection Design Guide')}</td></tr>
            </tbody>
          </table>
        </div>

        {/* 목차 */}
        <nav className="doc-toc">
          <div className="toc-title">{L('목 차', 'CONTENTS')}</div>
          <ol>
            {secs.map(s => <li key={s.no}><span className="toc-no">{s.no}.</span>{tr(s.title, lang)}<span className="toc-dot" /></li>)}
            <li><span className="toc-no">{secs.length + 1}.</span>{L('설계 결과 요약', 'Design Summary')}<span className="toc-dot" /></li>
            <li><span className="toc-no">{secs.length + 2}.</span>{L('접합 상세도', 'Connection Detail')}<span className="toc-dot" /></li>
          </ol>
        </nav>

        {/* 본문 */}
        {secs.map(s => (
          <section key={s.no} className="doc-sec">
            <h3><span className="sec-no">{s.no}.</span>{tr(s.title, lang)}</h3>
            {s.steps.map((st, i) => (
              <div key={i} className="calc-step">
                <div className="cs-head">
                  <span className="cs-num">{s.no}.{i + 1}</span>
                  <span className="cs-label">{tr(st.label, lang)}</span>
                  {st.ref && <span className="cs-ref">［{st.ref}］</span>}
                </div>
                {st.note && <p className="cs-basis">▸ {tr(st.note, lang)}</p>}
                {(st.formula || st.substitution || st.value != null) && (
                  <p className="cs-math">
                    {st.formula && <span className="cs-formula">{tr(st.formula, lang)}</span>}
                    {st.substitution && <span className="cs-sub"> = {tr(st.substitution, lang)}</span>}
                    {st.value != null && <span className="cs-val"> = <b>{nf(st.value)}</b> {tr(st.unit, lang)}</span>}
                    {st.value == null && st.unit && <span className="cs-val"> {tr(st.unit, lang)}</span>}
                    {st.check && <span className={st.check === 'OK' ? 'cs-ok' : 'cs-ng'}> ∴ {st.check}</span>}
                  </p>
                )}
              </div>
            ))}
          </section>
        ))}

        <section className="doc-sec">
          <h3><span className="sec-no">{secs.length + 1}.</span>{L('설계 결과 요약', 'Design Summary')}</h3>
          <table className="result-table2">
            <tbody>
              <tr><th>{L('플랜지 볼트', 'Flange bolts')}</th><td>{result.flange.bolt.m} {L('열', 'col')} × {result.flange.bolt.n} {L('행', 'row')} = {result.flange.bolt.m * Math.round(result.flange.bolt.n) * 4}-M{result.boltDia}</td></tr>
              <tr><th>{L('플랜지 외첨판', 'Flange outer plate')}</th><td>{plate(result.flange.outerPlate)} <span className="q">({L('2매', '2 ea')})</span></td></tr>
              <tr><th>{L('플랜지 내첨판', 'Flange inner plate')}</th><td>{result.flange.innerPlate ? <>{plate(result.flange.innerPlate)} <span className="q">({L('4매', '4 ea')})</span></> : '—'}</td></tr>
              <tr><th>{L('웨브 볼트', 'Web bolts')}</th><td>{result.web.bolt.m}×{result.web.bolt.n} = {result.web.bolt.m * result.web.bolt.n * 2}-M{result.boltDia} (Pc={result.web.Pc ?? '—'})</td></tr>
              <tr><th>{L('웨브 첨판', 'Web plate')}</th><td>{plate(result.web.webPlate)} <span className="q">({L('2매', '2 ea')})</span></td></tr>
            </tbody>
          </table>
        </section>

        <section className="doc-sec">
          <h3><span className="sec-no">{secs.length + 2}.</span>{L('접합 상세도', 'Connection Detail')}</h3>
          <ConnectionSVG r={result} cond={cond} />
        </section>
      </div>
    </div>
  );
}

function plate(p?: { t: number; w: number; L: number }) {
  return p ? `PL- ${p.t} × ${p.w} × ${p.L}` : '—';
}
