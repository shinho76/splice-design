// AISC 360-16 상세 계산서(영문 서술형) — 위→아래로 읽으며 이해되도록 수식·면적을 세분 전개.
// 데이터 소스: engine/aisc (검토별 steps[]·블록전단 cases[]). 자동보정 형상 기준.
import type { DesignResult, DesignCondition } from '../engine/types.ts';
import { aiscAutoCorrect } from '../engine/aisc/compat.ts';
import type { AiscCheck, AiscStep, BlockCase } from '../engine/aisc/types.ts';
import { parseName } from '../engine/sections.ts';

const nf = (n?: number, d = 1) => n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d });

// 검토 영문 명칭
const EN_LABEL: Record<string, string> = {
  FB1: 'Bolt shear (double shear)', FB2: 'Bolt slip resistance (Class B)',
  FP1: 'Outer plate — tension yielding', FP2: 'Outer plate — tension rupture', FP3: 'Outer plate — compression buckling', FP4: 'Outer plate — bearing & tear-out', FP5: 'Outer plate — block shear',
  FI1: 'Inner plates — tension yielding', FI2: 'Inner plates — tension rupture', FI3: 'Inner plates — compression buckling', FI4: 'Inner plates — bearing & tear-out', FI5: 'Inner plates — block shear',
  FM1: 'Beam flange — bearing & tear-out', FM2: 'Beam flange — flexural rupture (F13.1)', FM3: 'Beam flange (WT) — tension yielding', FM4: 'Beam flange (WT) — tension rupture', FM5: 'Beam flange — block shear',
  WB1: 'Web bolt shear (double shear)', WB2: 'Web bolt slip resistance', WR1: 'Web — bearing & tear-out', WP1: 'Web plates — block shear', WI1: 'Web plates — yielding interaction', WI2: 'Web plates — rupture interaction', WM1: 'Beam web — shear yielding', WM2: 'Beam web — block shear',
};
// 블록전단 케이스 라벨 영문화
const CASE_EN: Record<string, string> = {
  '전열 U블록': 'full U-block (2 shear planes)', '외연 L블록': 'outer L-block', '중앙 L블록': 'central L-block',
  '내측 페어': 'inner pair U-block', '양연 U블록': 'twin U-block',
};
const caseLabelEn = (label: string): string => {
  const letter = label[0];
  const inner = label.slice(label.indexOf('(') + 1, label.lastIndexOf(')'));
  return `${letter} — ${CASE_EN[inner] ?? inner}`;
};
// 그룹 헤더 영문화(치수 유지)
const groupEn = (g: string): string => g
  .replace('볼트(웨브)', 'Bolts (web)').replace('볼트', 'Bolts')
  .replace('외첨판', 'Outer plate').replace('내첨판', 'Inner plates').replace('웨브 첨판', 'Web plates')
  .replace('부재 H형강', 'H-beam member').replace('부재 웨브', 'Beam web');

// 검토별 한 줄 도입 서술(무엇을·어느 부위를 검토하는가)
const INTRO: Record<string, string> = {
  FB1: 'The bolts transfer the full flange force Pf across two shear planes (double shear: outer plate + flange + inner plate pair).',
  FB2: 'For a slip-critical joint the bolts must not slip under Pf; friction is developed by the bolt pretension.',
  FP1: 'The outer splice plate must not yield across its gross section under its share of the flange force.',
  FP2: 'Beyond yielding, the outer plate must not rupture through the line of bolt holes (net section).',
  FP3: 'Where this flange is in compression, the outer plate is checked for buckling across the open splice gap.',
  FP4: 'Each bolt bears against the outer plate; bearing and tear-out are summed over the edge and interior bolts.',
  FP5: 'A wedge of the outer plate could tear out around the bolt group; every candidate block (Cases A–D) is examined.',
  FI1: 'The pair of inner plates must not yield across their combined gross section.',
  FI2: 'The inner plates must not rupture through the bolt holes.',
  FI3: 'In compression the inner plates are checked for buckling across the gap.',
  FI4: 'Bearing and tear-out of the inner plates, summed over all bolts.',
  FI5: 'Block-shear tear-out of the inner plates (two plates), every candidate case.',
  FM1: 'The bolts also bear against the H-beam flange itself.',
  FM2: 'The tension flange, weakened by holes, is checked for flexural rupture (F13.1).',
  FM3: 'The spliced flange is idealised as a WT (flange + web stem) and checked for tension yielding.',
  FM4: 'The same WT is checked for tension rupture, including the shear-lag effect.',
  FM5: 'Block-shear tear-out of the H-beam flange around the bolt group, every candidate case.',
  WB1: 'The web bolts carry the full shear Vu; the group is taken as concentric — the plates absorb the eccentric moment.',
  WB2: 'For a slip-critical web the bolts must not slip under Vu.',
  WR1: 'The web bolts bear on the beam web and on the two splice plates; the weaker of the two governs.',
  WP1: 'A block of the web plates could tear out under the vertical shear; every candidate case is examined.',
  WI1: 'The web plates carry shear Vu together with the eccentric moment Mux; yielding is checked by an interaction.',
  WI2: 'The same shear + moment combination is checked against rupture of the net web-plate section.',
  WM1: 'The beam web itself is checked for shear yielding.',
  WM2: 'Block-shear tear-out of the beam web at the splice.',
};

function Steps({ steps }: { steps: AiscStep[] }) {
  return (
    <ol className="narr-steps">
      {steps.map((s, i) => (
        <li key={i}>
          <span className="ns-label">{s.label}</span>
          {s.formula && <span className="ns-eq"> = {s.formula}</span>}
          {s.subst && <span className="ns-sub"> = {s.subst}</span>}
          {s.value != null && <span className="ns-val"> = <b>{nf(s.value)}</b>{s.unit && s.unit !== 'ratio' ? ` ${s.unit}` : ''}</span>}
          {s.ref && <span className="ns-ref">[{s.ref}]</span>}
        </li>
      ))}
    </ol>
  );
}

function BlockCaseTable({ cases }: { cases: BlockCase[] }) {
  return (
    <table className="narr-bs">
      <thead>
        <tr>
          <th>Case</th><th>U<sub>bs</sub></th>
          <th>A<sub>gv</sub><br />mm²</th><th>A<sub>nv</sub><br />mm²</th><th>A<sub>nt</sub><br />mm²</th>
          <th>φR<sub>n</sub><br />kN</th><th>load<br />share</th><th>demand<br />kN</th><th>DCR</th>
        </tr>
      </thead>
      <tbody>
        {cases.map((c, i) => {
          const phi = c.phiRn / 1e3, dem = (c.dcr ?? 0) * phi;
          return (
            <tr key={i} className={c.gov ? 'bs-gov' : ''}>
              <td className="bs-lb">{caseLabelEn(c.label)}</td>
              <td>{c.Ubs.toFixed(1)}</td>
              <td>{nf(c.Agv, 0)}</td><td>{nf(c.Anv, 0)}</td><td>{nf(c.Ant, 0)}</td>
              <td>{nf(phi)}</td><td>×{c.frac.toFixed(2)}</td><td>{nf(dem)}</td>
              <td><b>{(c.dcr ?? 0).toFixed(2)}</b></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Conclusion({ c }: { c: AiscCheck }) {
  if (c.dcr == null) return c.note ? <p className="narr-na">Not applicable — {c.note === '지압' ? 'bearing-type joint' : c.note === '단일열' ? 'single bolt line, governed by net rupture' : c.note}.</p> : null;
  const ratio = c.unit === 'ratio';
  const pass = c.ok;
  return (
    <p className={'narr-concl ' + (pass ? 'ok' : 'ng')}>
      {ratio
        ? <>Interaction utilisation = <b>{nf(c.demand, 2)}</b> {pass ? '≤' : '>'} 1.00</>
        : <>φR<sub>n</sub> = <b>{nf(c.phiRn)}</b> {c.unit} {pass ? '≥' : '<'} demand = <b>{nf(c.demand)}</b> {c.unit}</>}
      {' → '}<span className="narr-dcr">DCR = {c.dcr.toFixed(2)}</span> · <b>{pass ? 'PASS' : 'FAIL'}</b>
    </p>
  );
}

export default function AiscDetailReport({ result, cond, onClose }: { result: DesignResult; cond: DesignCondition; onClose: () => void }) {
  const ac = aiscAutoCorrect(result, cond);
  const r = ac.result;
  const dem = ac.report.demand;
  const { H, B, tw, tf } = parseName(r.section);
  const arm = H - tf;
  const kn = (n: number) => nf(n / 1e3);
  const knm = (n: number) => nf(n / 1e6);

  // 그룹 순서 유지
  const order: string[] = [];
  const groups: Record<string, AiscCheck[]> = {};
  for (const c of ac.checks) { if (!groups[c.group]) order.push(c.group); (groups[c.group] ??= []).push(c); }

  const pf = cond.plateSteel ?? cond.steel;

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card doc aisc narr" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="tool-btn" onClick={() => window.print()}>🖨 Save PDF</button>
          <button className="close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="doc-head">
          <div className="doc-kicker">AISC 360-16 (15TH ED.) · LRFD · DETAILED CALCULATION</div>
          <h2>{r.section} — Bolted Splice, Full Design Narrative</h2>
          <p className="narr-lead">
            {cond.member === '기둥' ? 'Column' : 'Beam'} splice, {cond.jointType === '지압' ? 'bearing-type' : 'slip-critical (Class B)'} joint.
            Beam steel <b>{cond.steel}</b> (F<sub>y</sub>/F<sub>u</sub>), plate steel <b>{pf}</b>, bolts <b>{cond.bolt}</b> M{r.boltDia},
            threads {cond.threadCond === 'X' ? 'excluded (X)' : 'included (N)'} from the shear plane.
            Layout after auto-minimisation: flange {r.flange.bolt.m}×{Math.round(r.flange.bolt.n)} bolts, outer PL-{r.flange.outerPlate?.t}×{r.flange.outerPlate?.w}
            {r.flange.innerPlate ? `, inner PL-${r.flange.innerPlate.t}×${r.flange.innerPlate.w}×2` : ''};
            web {r.web.bolt.m}×{r.web.bolt.n} bolts, PL-{r.web.webPlate?.t}×{r.web.webPlate?.w}×2.
          </p>
        </div>

        {/* 1. 소요력 서술 */}
        <section className="doc-sec">
          <h3><span className="sec-no">1.</span>Design forces &amp; load path</h3>
          <p className="narr-p">
            The splice is proportioned to develop the member design strength. The bending moment is resolved into a
            flange couple: the tension (and compression) flange carries
            <span className="narr-eq"> P<sub>f</sub> = M<sub>u</sub> / (d − t<sub>f</sub>) = {knm(dem.Mu)}×10⁶ / ({H} − {tf}) = <b>{kn(dem.Pf)}</b> kN</span>
            &nbsp;(lever arm d − t<sub>f</sub> = {arm} mm).
          </p>
          <p className="narr-p">
            This flange force follows a double-shear load path and is shared <b>50 : 50</b> — the single outer plate resists
            P<sub>f</sub>/2 = <b>{kn(dem.half)}</b> kN, and the pair of inner plates together resist the other P<sub>f</sub>/2.
            Every bolt, however, sees the <i>full</i> P<sub>f</sub> because it crosses two shear planes.
          </p>
          <p className="narr-p">
            The web splice carries the design shear <span className="narr-eq">V<sub>u</sub> = <b>{kn(dem.Vu)}</b> kN</span>.
            Because the web bolt group sits a distance <span className="narr-eq">e = {nf(dem.e, 0)} mm</span> from the splice centre-line,
            the web plates must also resist the eccentric moment
            <span className="narr-eq"> M<sub>ux</sub> = V<sub>u</sub>·e = <b>{knm(dem.MuxWeb)}</b> kN·m</span>.
          </p>
          {dem.capScale < 1 && (
            <p className="narr-p narr-cap">
              Note — the member's own limit states (F13.1 flange rupture, D2 tension, or web shear yielding) cannot develop the
              full member strength through a bolted splice. The developed force has therefore been capped to
              <b> {Math.round(dem.capScale * 100)}%</b>, i.e. this is a <b>partial-strength</b> splice
              {ac.pfCap ? <> (flange P<sub>f</sub> limited to {nf(ac.pfCap)} kN)</> : null}
              {ac.vuCap ? <> (web V<sub>u</sub> limited to {nf(ac.vuCap)} kN)</> : null}.
            </p>
          )}
        </section>

        {/* 2..N. 검토 그룹 */}
        {order.map((g, gi) => (
          <section key={g} className="doc-sec">
            <h3><span className="sec-no">{gi + 2}.</span>{groupEn(g)}</h3>
            {groups[g].map((c, i) => (
              <div key={i} className={'narr-check' + (c.ok === false ? ' is-ng' : '')}>
                <div className="narr-ct"><span className="narr-id">{c.id}</span> {EN_LABEL[c.id] ?? c.label} <span className="narr-cl">[{c.clause}]</span></div>
                {INTRO[c.id] && <p className="narr-intro">{INTRO[c.id]}</p>}
                {c.steps && c.steps.length > 0 && <Steps steps={c.steps} />}
                {c.cases && c.cases.length > 0 && <>
                  <p className="narr-p narr-bs-note">Each candidate block carries only the bolts it releases, so its capacity is compared with that share of the force (load share below). The block with the highest DCR governs.</p>
                  <BlockCaseTable cases={c.cases} />
                </>}
                <Conclusion c={c} />
              </div>
            ))}
          </section>
        ))}

        <p className="note">
          Prepared to AISC 360-16 (15th ed.), LRFD. φ = 0.90 (yielding), 0.75 (rupture / bolt shear / bearing / block shear),
          0.90 (compression). Areas use the effective-hole allowance d + 2 mm for standard holes plus 2 mm damage (B4.3b).
          Block shear evaluates φR<sub>n</sub> = 0.75·[min(0.6F<sub>u</sub>A<sub>nv</sub>, 0.6F<sub>y</sub>A<sub>gv</sub>) + U<sub>bs</sub>F<sub>u</sub>A<sub>nt</sub>] for every element case.
        </p>
      </div>
    </div>
  );
}
