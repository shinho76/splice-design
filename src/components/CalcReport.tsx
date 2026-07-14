import type { DesignCondition, DesignResult, CalcStep } from '../engine/types.ts';
import ConnectionSVG from './ConnectionSVG.tsx';
import { toDXF, downloadFile } from '../engine/dxf.ts';

const nf = (v: number | undefined) => v == null ? '' : v.toLocaleString('en-US');
const stripPrefix = (g: string) => g.replace(/^[가-힣]\)\s*/, '');   // "가) ..." → "..."

/** 전문 설계 계산서 — 목차 + 1. 2. 번호 체계 + 접합 상세도 (제9장 예제 형식) */
export default function CalcReport({ result, cond, onClose, onAdd }: {
  result: DesignResult; cond: DesignCondition; onClose: () => void; onAdd?: (r: DesignResult) => void;
}) {
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
          {onAdd && <button className="tool-btn" onClick={() => onAdd(result)}>＋ 프로젝트 담기</button>}
          <button className="tool-btn" onClick={exportDXF}>⬇ DXF</button>
          <button className="tool-btn" onClick={() => window.print()}>🖨 PDF 저장</button>
          <button className="close" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        {/* 표제부 */}
        <div className="doc-head">
          <div className="doc-kicker">STRUCTURAL CALCULATION SHEET</div>
          <h2>고력볼트 표준접합부 설계 계산서</h2>
          <table className="doc-meta">
            <tbody>
              <tr><th>부재 / 접합</th><td>{cond.member} · {cond.jointType}접합</td><th>단면</th><td>{result.section}</td></tr>
              <tr><th>강종 / 볼트</th><td>H형강 {cond.steel} · 첨판 {cond.plateSteel ?? cond.steel} / 고력볼트 {cond.bolt}</td><th>부분강도비 α</th><td>{pct}%</td></tr>
              <tr><th>설계기준</th><td colSpan={3}>KBC-09 한계상태설계법 · 한국강구조학회 고력볼트 표준접합 설계편람</td></tr>
            </tbody>
          </table>
        </div>

        {/* 목차 */}
        <nav className="doc-toc">
          <div className="toc-title">목 차</div>
          <ol>
            {secs.map(s => <li key={s.no}><span className="toc-no">{s.no}.</span>{s.title}<span className="toc-dot" /></li>)}
            <li><span className="toc-no">{secs.length + 1}.</span>설계 결과 요약<span className="toc-dot" /></li>
            <li><span className="toc-no">{secs.length + 2}.</span>접합 상세도<span className="toc-dot" /></li>
          </ol>
        </nav>

        {/* 본문 */}
        {secs.map(s => (
          <section key={s.no} className="doc-sec">
            <h3><span className="sec-no">{s.no}.</span>{s.title}</h3>
            {s.steps.map((st, i) => (
              <div key={i} className="calc-step">
                <div className="cs-head">
                  <span className="cs-num">{s.no}.{i + 1}</span>
                  <span className="cs-label">{st.label}</span>
                  {st.ref && <span className="cs-ref">［{st.ref}］</span>}
                </div>
                {st.note && <p className="cs-basis">▸ {st.note}</p>}
                {(st.formula || st.substitution || st.value != null) && (
                  <p className="cs-math">
                    {st.formula && <span className="cs-formula">{st.formula}</span>}
                    {st.substitution && <span className="cs-sub"> = {st.substitution}</span>}
                    {st.value != null && <span className="cs-val"> = <b>{nf(st.value)}</b> {st.unit}</span>}
                    {st.value == null && st.unit && <span className="cs-val"> {st.unit}</span>}
                    {st.check && <span className={st.check === 'OK' ? 'cs-ok' : 'cs-ng'}> ∴ {st.check}</span>}
                  </p>
                )}
              </div>
            ))}
          </section>
        ))}

        <section className="doc-sec">
          <h3><span className="sec-no">{secs.length + 1}.</span>설계 결과 요약</h3>
          <table className="result-table2">
            <tbody>
              <tr><th>플랜지 볼트</th><td>{result.flange.bolt.m}열 × {result.flange.bolt.n}행 = {result.flange.bolt.m * Math.round(result.flange.bolt.n) * 4}-M{result.boltDia}</td></tr>
              <tr><th>플랜지 외첨판</th><td>{plate(result.flange.outerPlate)} <span className="q">(2매)</span></td></tr>
              <tr><th>플랜지 내첨판</th><td>{result.flange.innerPlate ? <>{plate(result.flange.innerPlate)} <span className="q">(4매)</span></> : '—'}</td></tr>
              <tr><th>웨브 볼트</th><td>{result.web.bolt.m}×{result.web.bolt.n} = {result.web.bolt.m * result.web.bolt.n * 2}-M{result.boltDia} (Pc={result.web.Pc ?? '—'})</td></tr>
              <tr><th>웨브 첨판</th><td>{plate(result.web.webPlate)} <span className="q">(2매)</span></td></tr>
            </tbody>
          </table>
        </section>

        <section className="doc-sec">
          <h3><span className="sec-no">{secs.length + 2}.</span>접합 상세도</h3>
          <ConnectionSVG r={result} cond={cond} />
        </section>
      </div>
    </div>
  );
}

function plate(p?: { t: number; w: number; L: number }) {
  return p ? `PL- ${p.t} × ${p.w} × ${p.L}` : '—';
}
