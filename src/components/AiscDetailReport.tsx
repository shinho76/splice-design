// AISC 360-16 상세 계산서(서술형·한/영) — 위→아래로 읽으며 이해되도록 수식·면적을 세분 전개.
// 데이터 소스: engine/aisc (검토별 steps[]·블록전단 cases[]). 자동보정 형상 기준.
import type { DesignResult, DesignCondition } from '../engine/types.ts';
import { aiscAutoCorrect } from '../engine/aisc/compat.ts';
import type { AiscCheck, AiscStep, BlockCase } from '../engine/aisc/types.ts';
import { parseName } from '../engine/sections.ts';
import { useLang, type Lang } from '../i18n.ts';
import { EN_LABEL, caseLabel, groupT as group } from './aiscI18n.ts';
import { stdLabelLong } from '../engine/std.ts';

const nf = (n?: number, d = 1) => n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d });

// step 라벨 한글 대응(영문은 엔진 원문)
const SL_KO: Record<string, string> = {
  'Bolt group': '볼트군', 'Bolt shear area Ab': '볼트 전단면적 Ab', 'Critical stress Fcr': '임계응력 Fcr',
  'Design compression φRn': '설계압축강도 φRn', 'Design flexural rupture φMn': '설계휨파단강도 φMn', 'Design flexural φMn': '설계휨강도 φMn',
  'Design rupture φRn': '설계파단강도 φRn', 'Design shear rupture φVn': '설계전단파단강도 φVn', 'Design shear yield φVn': '설계전단항복강도 φVn',
  'Design shear φRn': '설계전단강도 φRn', 'Design shear φVn': '설계전단강도 φVn', 'Design slip φRn': '설계미끄럼강도 φRn',
  'Design yield φRn': '설계항복강도 φRn', 'Design φMn': '설계휨강도 φMn', 'Eccentric moment Mux': '편심모멘트 Mux',
  'Eccentricity e': '편심 e', 'Edge bolt': '연단볼트', 'Edge bolt (tearout/bearing)': '연단볼트 (찢김/지압)',
  'Edge bolt on flange (t=tf)': '플랜지 연단볼트 (t=tf)', 'Effective area Ae': '유효단면적 Ae', 'Effective net area Ae': '유효순단면적 Ae',
  'Governing (min)': '지배(최소)', 'Gross area (2 plates) Ag': '총단면적(2매) Ag', 'Gross area Ag': '총단면적 Ag',
  'Gross flange area Afg': '플랜지 총단면적 Afg', 'Gross shear area Aw (2 plates)': '총전단면적 Aw(2매)', 'Gross web area Aw': '웨브 총단면적 Aw',
  'Hole-reduction test': '구멍감소 판정', 'Interaction': '상호작용', 'Interior bolt': '내부볼트',
  'Member web (t = tw)': '부재웨브 (t=tw)', 'Min. bolt pretension Tb': '최소 볼트장력 Tb', 'Net WT area (holes in flange)': '순 WT면적 (플랜지 구멍공제)',
  'Net area An (deduct holes/plate)': '순단면적 An (매당 구멍공제)', 'Net area An (deduct m holes)': '순단면적 An (m구멍 공제)',
  'Net elastic modulus Snet': '순 탄성단면계수 Snet', 'Net flange area Afn': '플랜지 순단면적 Afn', 'Net shear area Anv (2 plates)': '순전단면적 Anv(2매)',
  'Net shear width': '순전단폭', 'Nominal moment Mn': '공칭휨강도 Mn', 'Nominal shear stress Fnv': '공칭전단강도 Fnv',
  'Plastic modulus Zpl (2 plates)': '소성단면계수 Zpl(2매)', 'Radius of gyration r': '회전반경 r', 'Shear planes / bolts': '전단면·볼트수',
  'Shear-lag factor U': '전단지연계수 U', 'Slenderness KL/r': '세장비 KL/r', 'Splice plates (t = 2·tp)': '첨판 (t=2·tp)',
  'Total': '합계', 'Total (m edge + m(n−1) interior)': '합계 (연단 m + 내부 m(n−1))',
  'WT flange part': 'WT 플랜지부', 'WT gross area Awt': 'WT 총단면적 Awt', 'WT web-stem part': 'WT 웨브스템부',
};
const slabel = (s: string, lang: Lang) => lang === 'ko' ? (SL_KO[s] ?? s) : s;

// 검토별 도입 서술 [ko, en]
const INTRO: Record<string, [string, string]> = {
  FB1: ['볼트는 플랜지력 Pf 전체를 2개 전단면(이중전단: 외첨판+플랜지+내첨판쌍)으로 전달한다.', 'The bolts transfer the full flange force Pf across two shear planes (double shear: outer plate + flange + inner plate pair).'],
  FB2: ['마찰접합에서 볼트는 Pf 하에서 미끄러지지 않아야 하며, 마찰은 볼트장력으로 발현된다.', 'For a slip-critical joint the bolts must not slip under Pf; friction is developed by the bolt pretension.'],
  FP1: ['외첨판은 분담 플랜지력 하에서 총단면 항복이 없어야 한다.', 'The outer splice plate must not yield across its gross section under its share of the flange force.'],
  FP2: ['항복 외에, 외첨판은 볼트구멍 열(순단면)에서 파단하지 않아야 한다.', 'Beyond yielding, the outer plate must not rupture through the line of bolt holes (net section).'],
  FP3: ['해당 플랜지가 압축이면 외첨판은 이음갭 구간 좌굴을 검토한다.', 'Where this flange is in compression, the outer plate is checked for buckling across the open splice gap.'],
  FP4: ['각 볼트는 외첨판에 지압하며, 연단·내부 볼트의 지압·찢김을 합산한다.', 'Each bolt bears against the outer plate; bearing and tear-out are summed over the edge and interior bolts.'],
  FP5: ['외첨판의 한 블록이 볼트군 주위로 뜯길 수 있어 모든 후보블록(Case A~D)을 검토한다.', 'A wedge of the outer plate could tear out around the bolt group; every candidate block (Cases A–D) is examined.'],
  FI1: ['내첨판 2매는 합성 총단면에서 항복하지 않아야 한다.', 'The pair of inner plates must not yield across their combined gross section.'],
  FI2: ['내첨판은 볼트구멍에서 파단하지 않아야 한다.', 'The inner plates must not rupture through the bolt holes.'],
  FI3: ['압축 시 내첨판은 이음갭 좌굴을 검토한다.', 'In compression the inner plates are checked for buckling across the gap.'],
  FI4: ['내첨판의 지압·찢김을 전 볼트에 대해 합산한다.', 'Bearing and tear-out of the inner plates, summed over all bolts.'],
  FI5: ['내첨판(2매)의 블록전단 뜯김을 모든 케이스에 대해 검토한다.', 'Block-shear tear-out of the inner plates (two plates), every candidate case.'],
  FM1: ['볼트는 H형강 플랜지 자체에도 지압한다.', 'The bolts also bear against the H-beam flange itself.'],
  FM2: ['구멍으로 약화된 인장플랜지의 휨파단(F13.1)을 검토한다.', 'The tension flange, weakened by holes, is checked for flexural rupture (F13.1).'],
  FM3: ['이음 플랜지를 WT(플랜지+웨브 스템)로 이상화하여 인장항복을 검토한다.', 'The spliced flange is idealised as a WT (flange + web stem) and checked for tension yielding.'],
  FM4: ['동일 WT를 전단지연을 포함해 인장파단으로 검토한다.', 'The same WT is checked for tension rupture, including the shear-lag effect.'],
  FM5: ['볼트군 주위 H형강 플랜지의 블록전단 뜯김을 모든 케이스에 대해 검토한다.', 'Block-shear tear-out of the H-beam flange around the bolt group, every candidate case.'],
  WB1: ['웨브 볼트는 전단 Vu 전체를 부담한다. 볼트군은 동심(C=n)으로 보고 편심모멘트는 첨판이 부담한다.', 'The web bolts carry the full shear Vu; the group is taken as concentric — the plates absorb the eccentric moment.'],
  WB2: ['마찰 웨브에서 볼트는 Vu 하에서 미끄러지지 않아야 한다.', 'For a slip-critical web the bolts must not slip under Vu.'],
  WR1: ['웨브 볼트는 부재웨브와 첨판 2매에 지압하며, 약한 쪽이 지배한다.', 'The web bolts bear on the beam web and on the two splice plates; the weaker of the two governs.'],
  WP1: ['웨브 첨판의 한 블록이 수직전단으로 뜯길 수 있어 모든 케이스를 검토한다.', 'A block of the web plates could tear out under the vertical shear; every candidate case is examined.'],
  WI1: ['웨브 첨판은 전단 Vu와 편심모멘트 Mux를 함께 받으며, 항복을 상호작용으로 검토한다.', 'The web plates carry shear Vu together with the eccentric moment Mux; yielding is checked by an interaction.'],
  WI2: ['동일 전단+휨 조합을 웨브 첨판 순단면 파단에 대해 검토한다.', 'The same shear + moment combination is checked against rupture of the net web-plate section.'],
  WM1: ['부재 웨브 자체의 전단항복을 검토한다.', 'The beam web itself is checked for shear yielding.'],
  WM2: ['이음부 부재 웨브의 블록전단 뜯김을 검토한다.', 'Block-shear tear-out of the beam web at the splice.'],
};

function Steps({ steps, lang }: { steps: AiscStep[]; lang: Lang }) {
  return (
    <ol className="narr-steps">
      {steps.map((s, i) => (
        <li key={i}>
          <span className="ns-label">{slabel(s.label, lang)}</span>
          {s.formula && <span className="ns-eq"> = {s.formula}</span>}
          {s.subst && <span className="ns-sub"> = {s.subst}</span>}
          {s.value != null && <span className="ns-val"> = <b>{nf(s.value)}</b>{s.unit && s.unit !== 'ratio' ? ` ${s.unit}` : ''}</span>}
          {s.ref && <span className="ns-ref">[{s.ref}]</span>}
        </li>
      ))}
    </ol>
  );
}

function BlockCaseTable({ cases, lang }: { cases: BlockCase[]; lang: Lang }) {
  const L = (ko: string, en: string) => lang === 'en' ? en : ko;
  return (
    <table className="narr-bs">
      <thead>
        <tr>
          <th>{L('케이스', 'Case')}</th><th>U<sub>bs</sub></th>
          <th>A<sub>gv</sub><br />mm²</th><th>A<sub>nv</sub><br />mm²</th><th>A<sub>nt</sub><br />mm²</th>
          <th>φR<sub>n</sub><br />kN</th><th>{L('분담', 'share')}</th><th>{L('소요', 'demand')}<br />kN</th><th>DCR</th>
        </tr>
      </thead>
      <tbody>
        {cases.map((c, i) => {
          const phi = c.phiRn / 1e3, dem = (c.dcr ?? 0) * phi;
          return (
            <tr key={i} className={c.gov ? 'bs-gov' : ''}>
              <td className="bs-lb">{caseLabel(c.label, lang)}</td>
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

function Conclusion({ c, lang }: { c: AiscCheck; lang: Lang }) {
  const L = (ko: string, en: string) => lang === 'en' ? en : ko;
  if (c.dcr == null) return c.note ? <p className="narr-na">{L('해당 없음', 'Not applicable')} — {c.note === '지압' ? L('지압접합', 'bearing-type joint') : c.note === '단일열' ? L('단일 볼트열, 순단면 파단이 지배', 'single bolt line, governed by net rupture') : c.note}.</p> : null;
  const ratio = c.unit === 'ratio';
  const pass = c.ok;
  return (
    <p className={'narr-concl ' + (pass ? 'ok' : 'ng')}>
      {ratio
        ? <>{L('상호작용 이용률', 'Interaction utilisation')} = <b>{nf(c.demand, 2)}</b> {pass ? '≤' : '>'} 1.00</>
        : <>φR<sub>n</sub> = <b>{nf(c.phiRn)}</b> {c.unit} {pass ? '≥' : '<'} {L('소요', 'demand')} = <b>{nf(c.demand)}</b> {c.unit}</>}
      {' → '}<span className="narr-dcr">DCR = {c.dcr.toFixed(2)}</span> · <b>{pass ? 'PASS' : 'FAIL'}</b>
    </p>
  );
}

export default function AiscDetailReport({ result, cond, onClose }: { result: DesignResult; cond: DesignCondition; onClose: () => void }) {
  const lang = useLang();
  const L = (ko: string, en: string) => lang === 'en' ? en : ko;
  const ac = aiscAutoCorrect(result, cond);
  const r = ac.result;
  const dem = ac.report.demand;
  const { H, B, tw, tf } = parseName(r.section);
  const arm = H - tf;
  const kn = (n: number) => nf(n / 1e3);
  const knm = (n: number) => nf(n / 1e6);

  const order: string[] = [];
  const groups: Record<string, AiscCheck[]> = {};
  for (const c of ac.checks) { if (!groups[c.group]) order.push(c.group); (groups[c.group] ??= []).push(c); }

  const ps = cond.plateSteel ?? cond.steel;

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card doc aisc narr" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="tool-btn" onClick={() => window.print()}>🖨 {L('PDF 저장', 'Save PDF')}</button>
          <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
        </div>

        <div className="doc-head">
          <div className="doc-kicker">{stdLabelLong(cond.designStd)} · LRFD · {L('상세 계산서', 'DETAILED CALCULATION')}</div>
          <h2>{r.section} — {L('고력볼트 이음 상세 계산', 'Bolted Splice, Full Design Narrative')}</h2>
          <p className="narr-lead">
            {L(`${cond.member} · ${cond.jointType === '지압' ? '지압접합' : '마찰접합(Class B)'}. `, `${cond.member === '기둥' ? 'Column' : 'Beam'} splice, ${cond.jointType === '지압' ? 'bearing-type' : 'slip-critical (Class B)'} joint. `)}
            {L('H형강 강종 ', 'Beam steel ')}<b>{cond.steel}</b>, {L('첨판 강종 ', 'plate steel ')}<b>{ps}</b>, {L('볼트 ', 'bolts ')}<b>{cond.bolt}</b> M{r.boltDia},
            {L(` 나사부 ${cond.threadCond === 'X' ? '전단면 제외(X)' : '전단면 통과(N)'}.`, ` threads ${cond.threadCond === 'X' ? 'excluded (X)' : 'included (N)'} from the shear plane.`)}
            {L(' 자동최소화 후 배치: 플랜지 ', ' Layout after auto-minimisation: flange ')}{r.flange.bolt.m}×{Math.round(r.flange.bolt.n)}{L('볼트, 외첨판 ', ' bolts, outer PL-')}{L(`PL-${r.flange.outerPlate?.t}×${r.flange.outerPlate?.w}`, `${r.flange.outerPlate?.t}×${r.flange.outerPlate?.w}`)}
            {r.flange.innerPlate ? L(`, 내첨판 PL-${r.flange.innerPlate.t}×${r.flange.innerPlate.w}×2`, `, inner PL-${r.flange.innerPlate.t}×${r.flange.innerPlate.w}×2`) : ''};
            {L(' 웨브 ', ' web ')}{r.web.bolt.m}×{r.web.bolt.n}{L('볼트, PL-', ' bolts, PL-')}{r.web.webPlate?.t}×{r.web.webPlate?.w}×2.
          </p>
        </div>

        {/* 1. 소요력 */}
        <section className="doc-sec">
          <h3><span className="sec-no">1.</span>{L('소요력 · 하중경로', 'Design forces & load path')}</h3>
          <p className="narr-p">
            {L('이음부는 부재 설계강도를 발현하도록 설계한다. 휨모멘트를 플랜지 커플로 분해하면 인장(및 압축)플랜지가 다음 힘을 부담한다:',
              'The splice is proportioned to develop the member design strength. The bending moment is resolved into a flange couple: the tension (and compression) flange carries')}
            <span className="narr-eq"> P<sub>f</sub> = M<sub>u</sub>/(d − t<sub>f</sub>) = {knm(dem.Mu)}×10⁶/({H} − {tf}) = <b>{kn(dem.Pf)}</b> kN</span>
            &nbsp;({L('커플 arm', 'lever arm')} d − t<sub>f</sub> = {arm} mm).
          </p>
          <p className="narr-p">
            {L('이 플랜지력은 이중전단 경로를 따르며 ', 'This flange force follows a double-shear load path and is shared ')}<b>50 : 50</b>
            {L('으로 분담된다 — 외첨판 1매가 Pf/2 = ', ' — the single outer plate resists Pf/2 = ')}<b>{kn(dem.half)}</b>
            {L(' kN, 내첨판 2매가 나머지 Pf/2를 부담한다. 다만 각 볼트는 2개 전단면을 지나므로 ', ' kN, and the pair of inner plates together resist the other Pf/2. Every bolt, however, sees the ')}
            <i>{L('Pf 전체', 'full Pf')}</i>{L('를 받는다.', ' because it crosses two shear planes.')}
          </p>
          <p className="narr-p">
            {L('웨브 이음은 설계전단 ', 'The web splice carries the design shear ')}<span className="narr-eq">V<sub>u</sub> = <b>{kn(dem.Vu)}</b> kN</span>
            {L('를 부담한다. 웨브 볼트군이 이음 중심선에서 ', '. Because the web bolt group sits a distance ')}
            <span className="narr-eq">e = {nf(dem.e, 0)} mm</span>{L(' 떨어져 있어 첨판은 편심모멘트 ', ' from the splice centre-line, the web plates must also resist the eccentric moment ')}
            <span className="narr-eq">M<sub>ux</sub> = V<sub>u</sub>·e = <b>{knm(dem.MuxWeb)}</b> kN·m</span>{L('도 부담한다.', '.')}
          </p>
          {dem.capScale < 1 && (
            <p className="narr-p narr-cap">
              {L('참고 — 부재 자체 한계상태(F13.1 플랜지 파단·D2 인장·웨브 전단항복)는 볼트 이음으로 부재 전강도를 발현할 수 없다. 따라서 발현력을 ',
                "Note — the member's own limit states (F13.1 flange rupture, D2 tension, or web shear yielding) cannot develop the full member strength through a bolted splice. The developed force has therefore been capped to ")}
              <b>{Math.round(dem.capScale * 100)}%</b>{L('로 제한(부분강도접합)', ', i.e. this is a partial-strength splice')}
              {ac.pfCap ? L(` (플랜지 Pf ${nf(ac.pfCap)} kN 제한)`, ` (flange Pf limited to ${nf(ac.pfCap)} kN)`) : null}
              {ac.vuCap ? L(` (웨브 Vu ${nf(ac.vuCap)} kN 제한)`, ` (web Vu limited to ${nf(ac.vuCap)} kN)`) : null}.
            </p>
          )}
        </section>

        {/* 2..N. 검토 그룹 */}
        {order.map((g, gi) => (
          <section key={g} className="doc-sec">
            <h3><span className="sec-no">{gi + 2}.</span>{group(g, lang)}</h3>
            {groups[g].map((c, i) => (
              <div key={i} className={'narr-check' + (c.ok === false ? ' is-ng' : '')}>
                <div className="narr-ct"><span className="narr-id">{c.id}</span> {lang === 'ko' ? c.label : (EN_LABEL[c.id] ?? c.label)} <span className="narr-cl">[{c.clause}]</span></div>
                {INTRO[c.id] && <p className="narr-intro">{L(INTRO[c.id][0], INTRO[c.id][1])}</p>}
                {c.steps && c.steps.length > 0 && <Steps steps={c.steps} lang={lang} />}
                {c.cases && c.cases.length > 0 && <>
                  <p className="narr-p narr-bs-note">{L('각 후보블록은 뜯기는 볼트만 분리하므로, 강도를 그 하중분담(아래 분담)과 비교한다. DCR이 가장 큰 블록이 지배한다.',
                    'Each candidate block carries only the bolts it releases, so its capacity is compared with that share of the force (load share below). The block with the highest DCR governs.')}</p>
                  <BlockCaseTable cases={c.cases} lang={lang} />
                </>}
                <Conclusion c={c} lang={lang} />
              </div>
            ))}
          </section>
        ))}

        <p className="note">
          {L('AISC 360-16(15판) LRFD. φ = 0.90(항복)·0.75(파단/볼트전단/지압/블록전단)·0.90(압축). 순단면은 표준구멍 d+2mm에 손상여유 2mm를 더해 공제(B4.3b). 블록전단은 요소별 케이스마다 ',
            'Prepared to AISC 360-16 (15th ed.), LRFD. φ = 0.90 (yielding), 0.75 (rupture / bolt shear / bearing / block shear), 0.90 (compression). Net areas use the effective-hole allowance d + 2 mm for standard holes plus 2 mm damage (B4.3b). Block shear evaluates ')}
          φR<sub>n</sub> = 0.75·[min(0.6F<sub>u</sub>A<sub>nv</sub>, 0.6F<sub>y</sub>A<sub>gv</sub>) + U<sub>bs</sub>F<sub>u</sub>A<sub>nt</sub>]{L('를 산정한다.', ' for every element case.')}
        </p>
      </div>
    </div>
  );
}
