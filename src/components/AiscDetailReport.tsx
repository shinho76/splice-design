// AISC 360-16 상세 계산서(서술형·한/영) — 위→아래로 읽으며 이해되도록 수식·면적을 세분 전개.
// 데이터 소스: engine/aisc (검토별 steps[]·블록전단 cases[]). 자동보정 형상 기준.
import type { DesignResult, DesignCondition } from '../engine/types.ts';
import { aiscAutoCorrect } from '../engine/aisc/compat.ts';
import type { AiscCheck, AiscStep, BlockCase } from '../engine/aisc/types.ts';
import { parseName, sectionByName } from '../engine/sections.ts';
import { Fy as FySteel } from '../engine/materials.ts';
import { useLang, tr, type Lang } from '../i18n.ts';
import { connChecks } from '../engine/connChecks.ts';
import { boltSpecOf } from '../engine/bolt_spec.ts';
import { EN_LABEL, groupT as group } from './aiscI18n.ts';
import { stdLabelLong } from '../engine/std.ts';
import { toSVGDetail } from '../engine/dxf.ts';
import CheckFig from './CheckFig.tsx';

const nf = (n?: number, d = 1) => n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d });

// step 라벨 한글 대응(영문은 엔진 원문)
const SL_KO: Record<string, string> = {
  'Bearing limit φ·2.4dtFu (all bolts)': '지압 상한 φ·2.4dtFu (전 볼트)', 'Bearing limit φ·2.4dtf·Fu (all bolts)': '지압 상한 φ·2.4·d·tf·Fu (전 볼트)',
  'Slip coefficient μ (Class B)': '미끄럼계수 μ (Class B)', 'Pretension factor Du': '장력계수 Du', 'Filler factor hf': '필러계수 hf', 'Shear planes ns': '전단면수 ns',
  'Per-bolt design slip φrₙ': '볼트 1개 설계미끄럼 φrₙ', 'Total φRn = φrₙ·n': '총 φRn = φrₙ·n',
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
  'Net area An (deduct n holes/plate)': '순단면적 An (n열 구멍공제/매)',
  'Design shear φVn (connecting element)': '설계전단강도 φVn (이음요소 J4.2a)',
  'Interaction (convention, not a single Spec eq.)': '상호작용 (관용식)',
  'Net elastic modulus Snet': '순 탄성단면계수 Snet', 'Net flange area Afn': '플랜지 순단면적 Afn', 'Net shear area Anv (2 plates)': '순전단면적 Anv(2매)',
  'Net shear width': '순전단폭', 'Nominal moment Mn': '공칭휨강도 Mn', 'Nominal shear stress Fnv': '공칭전단강도 Fnv',
  'Plastic modulus Zpl (2 plates)': '소성단면계수 Zpl(2매)', 'Radius of gyration r': '회전반경 r', 'Shear planes / bolts': '전단면·볼트수',
  'Shear-lag factor U': '전단지연계수 U', 'Slenderness KL/r': '세장비 KL/r', 'Splice plates (t = 2·tp)': '이음판 (t=2·tp)',
  'Total': '합계', 'Total (m edge + m(n−1) interior)': '합계 (연단 m + 내부 m(n−1))',
  'WT flange part': 'WT 플랜지부', 'WT gross area Awt': 'WT 총단면적 Awt', 'WT web-stem part': 'WT 웨브스템부',
};
const slabel = (s: string, lang: Lang) => lang === 'ko' ? (SL_KO[s] ?? s) : s;

// 검토별 도입 서술 [ko, en]
const INTRO: Record<string, [string, string]> = {
  FB1: ['볼트는 플랜지력 Pf 전체를 2개 전단면(이중전단: 외부 이음판+플랜지+내부 이음판쌍)으로 전달한다.', 'The bolts transfer the full flange force Pf across two shear planes (double shear: outer plate + flange + inner plate pair).'],
  FB2: ['마찰접합에서 볼트는 Pf 하에서 미끄러지지 않아야 하며, 마찰은 볼트장력으로 발현된다.', 'For a slip-critical joint the bolts must not slip under Pf; friction is developed by the bolt pretension.'],
  FP1: ['외부 이음판은 분담 플랜지력 하에서 총단면 항복이 없어야 한다.', 'The outer splice plate must not yield across its gross section under its share of the flange force.'],
  FP2: ['항복 외에, 외부 이음판은 볼트구멍 열(순단면)에서 파단하지 않아야 한다.', 'Beyond yielding, the outer plate must not rupture through the line of bolt holes (net section).'],
  FP3: ['해당 플랜지가 압축이면 외부 이음판은 이음갭 구간 좌굴을 검토한다.', 'Where this flange is in compression, the outer plate is checked for buckling across the open splice gap.'],
  FP4: ['각 볼트는 외부 이음판에 지압하며, 연단·내부 볼트의 지압·찢김을 합산한다.', 'Each bolt bears against the outer plate; bearing and tear-out are summed over the edge and interior bolts.'],
  FP5: ['외부 이음판이 볼트군 주위로 뜯길 수 있어 첨부 도해의 모든 파단경로(Path 1·2a·2b·3)를 검토한다.', 'A wedge of the outer plate could tear out around the bolt group; every rupture path (Path 1, 2a, 2b, 3) is examined.'],
  FI1: ['내부 이음판 2매는 합성 총단면에서 항복하지 않아야 한다.', 'The pair of inner plates must not yield across their combined gross section.'],
  FI2: ['내부 이음판은 볼트구멍에서 파단하지 않아야 한다.', 'The inner plates must not rupture through the bolt holes.'],
  FI3: ['압축 시 내부 이음판은 이음갭 좌굴을 검토한다.', 'In compression the inner plates are checked for buckling across the gap.'],
  FI4: ['내부 이음판의 지압·찢김을 전 볼트에 대해 합산한다.', 'Bearing and tear-out of the inner plates, summed over all bolts.'],
  FI5: ['내부 이음판(2매)의 블록전단 뜯김을 첨부 도해의 모든 파단경로(Path 4·5a·5b)에 대해 검토한다.', 'Block-shear tear-out of the inner plates (two plates), every rupture path (Path 4, 5a, 5b).'],
  FM1: ['볼트는 H형강 플랜지 자체에도 지압한다.', 'The bolts also bear against the H-beam flange itself.'],
  FM2: ['구멍으로 약화된 인장플랜지의 휨파단(F13.1)을 검토한다. 콤팩트 단면의 공칭휨강도는 Mn=Fy·Zx(Zx=단면표 소성단면계수)이다. 구멍감소 판정 — Fu·Afn ≥ Yt·Fy·Afg이면 감소 없이 Mp 유지, 미달이면 Mn=(Fu·Afn/Afg)·Sx로 저감한다. 여기서 Yt=1.0(Fy/Fu≤0.8), 그 외 1.1.', 'The tension flange, weakened by holes, is checked for flexural rupture (F13.1). For a compact section the nominal moment is Mn=Fy·Zx (Zx = tabulated plastic modulus). Hole-reduction test — if Fu·Afn ≥ Yt·Fy·Afg no reduction (Mp), otherwise Mn=(Fu·Afn/Afg)·Sx. Here Yt=1.0 when Fy/Fu≤0.8, else 1.1.'],
  FM3: ['이음 플랜지를 WT(플랜지+웨브 스템, Awt=B·tf+(H/2−tf)·tw)로 이상화하여 인장항복을 검토한다.', 'The spliced flange is idealised as a WT (flange + web stem, Awt=B·tf+(H/2−tf)·tw) and checked for tension yielding.'],
  FM4: ['동일 WT를 전단지연(U)을 포함해 인장파단으로 검토한다. U는 Table D3.1 Case 7(플랜지접합 W형강, 열당 볼트 3개↑): bf≥⅔d → 0.90, 미만 → 0.85.', 'The same WT is checked for tension rupture with shear lag U. Per Table D3.1 Case 7 (W-shape connected by flanges, ≥3 bolts/line): U=0.90 if bf≥⅔d, else 0.85.'],
  FM5: ['볼트군 주위 H형강(거더) 플랜지의 블록전단 뜯김을 파단경로(Path 6·7, 8·9)에 대해 검토한다.', 'Block-shear tear-out of the H-beam (girder) flange around the bolt group (Path 6·7, 8·9).'],
  WB1: ['웨브 볼트는 전단 Vu 전체를 부담한다. ns=전단면수(양면 이음판 → 이중전단 ns=2), n=볼트수(춤×축). 볼트군은 동심(C=n)으로 보고 편심모멘트는 이음판이 부담한다.', 'The web bolts carry the full shear Vu. ns = shear planes (two side plates → double shear, ns=2), n = bolt count (depth×long.). The group is taken as concentric; the plates absorb the eccentric moment.'],
  WB2: ['마찰 웨브에서 볼트는 Vu 하에서 미끄러지지 않아야 한다.', 'For a slip-critical web the bolts must not slip under Vu.'],
  WR1: ['웨브 볼트는 부재웨브와 이음판 2매에 지압하며, 약한 쪽이 지배한다.', 'The web bolts bear on the beam web and on the two splice plates; the weaker of the two governs.'],
  WP1: ['웨브 이음판(Web Splice Plate)이 수직전단 V로 뜯길 수 있어 Path 1을 검토한다. 수평력 H=0이므로 H블록은 제외.', 'The web splice plate could tear out under the vertical shear V (Path 1); horizontal H=0, so H-blocks are excluded.'],
  WI1: ['웨브 이음판은 전단 Vu와 편심모멘트 Mux를 함께 받으며, 항복을 상호작용으로 검토한다. 이용률 √[(Mux/φMn)²+(Vu/φVn)²]≤1 — 두 작용의 조합비로, 1.0이 한계(원점~단위원 안이면 안전). 이음판(connecting element) 전단항복 φv=1.0은 J4.2(a). ※ AISC 단일 규정식이 아닌 관용 조합식.', 'The web plates carry shear Vu with the eccentric moment Mux; yielding is checked by an interaction. Utilisation √[(Mux/φMn)²+(Vu/φVn)²]≤1 combines the two actions (1.0 = limit). Shear yield of the connecting element uses φv=1.0 per J4.2(a). Note: a convention, not a single Spec equation.'],
  WI2: ['동일 전단+휨 조합을 웨브 이음판 순단면 파단으로 검토한다(φ=0.75, J4.2(b)). 순단면은 첫 볼트열 위치이므로 그 위치 모멘트 M_net=Vu·(e−j0)를 사용(AISC Manual Part 10 단면분리 원칙). 이용률 의미는 WI1과 동일.', 'The same shear+moment combination is checked against net-section rupture (φ=0.75, J4.2(b)). Since the net section is at the first bolt line, the moment there M_net=Vu·(e−j0) is used (AISC Manual Part 10 section-separation principle). Utilisation meaning as in WI1.'],
  WM1: ['부재 웨브 자체의 전단항복을 검토한다.', 'The beam web itself is checked for shear yielding.'],
  WM2: ['부재 웨브가 이음볼트 구멍(수직 nVert개)을 지난 순단면에서 전단파단하는지 검토한다(φ·0.6·Fu·Anv, φ=0.75, J4.2(b)). WM1(총단면 항복)과 병행하며, 보통 파단강도가 항복보다 약간 낮아 지배할 수 있다.', 'The beam web is checked for shear rupture across the net section through the splice-bolt holes (φ·0.6·Fu·Anv, φ=0.75, J4.2(b)), in parallel with WM1 (gross-section yield); rupture is often slightly lower than yield and may govern.'],
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

// 블록전단 수식 전개 — Path별로 φRn = φ[min(0.6FuAnv, 0.6FyAgv) + Ubs·Fu·Ant] 를 대입까지 풀어 표기.
function BlockCaseExpand({ cases, lang }: { cases: BlockCase[]; lang: Lang }) {
  const L = (ko: string, en: string) => lang === 'en' ? en : ko;
  return (
    <div className="narr-bs-exp">
      {cases.map((c, i) => {
        const Fu = c.Fu ?? 0, Fy = c.Fy ?? 0, pl = c.plates ?? 1;
        const shRup = 0.6 * Fu * c.Anv / 1e3, shYld = 0.6 * Fy * c.Agv / 1e3;   // kN
        const shGov = Math.min(shRup, shYld), rupGov = shRup <= shYld;
        const tens = c.Ubs * Fu * c.Ant / 1e3;
        const rnEl = shGov + tens, phi = c.phiRn / 1e3, dem = (c.dcr ?? 0) * phi;
        const ac = c.areaCalc;
        const sum = (terms: string[]) => terms.length > 1 ? `(${terms.join(') + (')})` : (terms[0] ?? '');
        return (
          <div key={i} className={'bs-exp-item' + (c.gov ? ' bs-gov' : '')}>
            <div className="bs-exp-h"><b>{c.path}</b> · U<sub>bs</sub> = {c.Ubs.toFixed(1)}{c.gov ? <span className="bs-govtag"> ◀ {L('지배', 'governs')}</span> : null}</div>
            <div className="bs-exp-body">
              {ac ? <>
                <div>A<sub>gv</sub> = Σ(L·t) = {sum(ac.shear.map(s => `${nf(s.L, 0)}·${ac.t}`))} = <b>{nf(c.Agv, 0)}</b> mm²</div>
                <div>A<sub>nv</sub> = Σ[(L − (n<sub>r</sub>−0.5)·dₕ)·t] = {sum(ac.shear.map(s => `(${nf(s.L, 0)}−${(s.rows - 0.5).toFixed(1)}·${ac.dh})·${ac.t}`))} = <b>{nf(c.Anv, 0)}</b> mm²</div>
                <div>A<sub>nt</sub> = Σ[(b − n·dₕ{ac.tension.some(t => t.gain > 0.05) ? ' + Σs²/4g' : ''})·t] = {sum(ac.tension.map(t => `(${nf(t.width, 0)}−${t.holes}·${ac.dh}${t.gain > 0.05 ? `+${nf(t.gain, 0)}` : ''})·${ac.t}`))} = <b>{nf(c.Ant, 0)}</b> mm²</div>
              </> : <div>A<sub>gv</sub> = {nf(c.Agv, 0)} mm² · A<sub>nv</sub> = {nf(c.Anv, 0)} mm² · A<sub>nt</sub> = {nf(c.Ant, 0)} mm²</div>}
              <div>{L('전단파단', 'Shear rupture')} 0.6·F<sub>u</sub>·A<sub>nv</sub> = 0.6·{Fu}·{nf(c.Anv, 0)} = <b>{nf(shRup)}</b> kN{rupGov ? <span className="bs-min"> ← min</span> : null}</div>
              <div>{L('전단항복', 'Shear yield')} 0.6·F<sub>y</sub>·A<sub>gv</sub> = 0.6·{Fy}·{nf(c.Agv, 0)} = <b>{nf(shYld)}</b> kN{!rupGov ? <span className="bs-min"> ← min</span> : null}</div>
              <div>{L('인장파단', 'Tension rupture')} U<sub>bs</sub>·F<sub>u</sub>·A<sub>nt</sub> = {c.Ubs.toFixed(1)}·{Fu}·{nf(c.Ant, 0)} = <b>{nf(tens)}</b> kN</div>
              <div>R<sub>n</sub> = min({nf(shRup)}, {nf(shYld)}) + {nf(tens)} = <b>{nf(rnEl)}</b> kN{pl > 1 ? <> (×{pl}{L('매', '')} = {nf(rnEl * pl)} kN)</> : null}</div>
              <div>φR<sub>n</sub> = 0.75 × {nf(rnEl * pl)} = <b>{nf(phi)}</b> kN · DCR = {nf(dem)}/{nf(phi)} = <b>{(c.dcr ?? 0).toFixed(2)}</b></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BlockCaseTable({ cases, lang }: { cases: BlockCase[]; lang: Lang }) {
  const L = (ko: string, en: string) => lang === 'en' ? en : ko;
  return (
    <table className="narr-bs">
      <thead>
        <tr>
          <th>{L('파단경로', 'Path')}</th><th>U<sub>bs</sub></th>
          <th>A<sub>gv</sub><br />mm²</th><th>A<sub>nv</sub><br />mm²</th><th>A<sub>nt</sub><br />mm²</th>
          <th>φR<sub>n</sub><br />kN</th><th>{L('분담', 'share')}</th><th>{L('소요', 'demand')}<br />kN</th><th>DCR</th>
        </tr>
      </thead>
      <tbody>
        {cases.map((c, i) => {
          const phi = c.phiRn / 1e3, dem = (c.dcr ?? 0) * phi;
          return (
            <tr key={i} className={c.gov ? 'bs-gov' : ''}>
              <td className="bs-lb">{c.path ? <b>{c.path}</b> : null}</td>
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

// #6 볼트 치수·체결 점검 — 사양(그립·표준길이·본수) + 설치여유/간섭(connChecks: 피치·연단·소켓여유·필렛간섭)
function BoltInstallSection({ r, cond, lang, no }: { r: DesignResult; cond: DesignCondition; lang: Lang; no: number }) {
  const L = (ko: string, en: string) => lang === 'en' ? en : ko;
  const bs = boltSpecOf(r);
  const cc = connChecks(r);
  const thread = cond.threadCond === 'X' ? L('X(전단면 제외)', 'X (excluded)') : L('N(전단면 통과)', 'N (included)');
  const grp = (g: typeof bs.flange, ko: string, en: string) => (
    <tr><th>{L(ko, en)}</th><td>{g.count}{L('본', '')}</td><td>{L('그립', 'grip')} {g.grip}mm</td><td>{L('표준길이', 'Std length')} M{r.boltDia}×{g.length}</td></tr>
  );
  return (
    <section className="doc-sec">
      <h3><span className="sec-no">{no}.</span>{L('볼트 치수 · 체결 점검', 'Bolt sizing & installation check')}</h3>
      <table className="cond-table bolt-spec">
        <tbody>
          <tr>
            <th>{L('규격', 'Grade')}</th><td>{cond.bolt} · M{r.boltDia}</td>
            <th>{L('나사부', 'Thread')}</th><td>{thread}</td>
          </tr>
          {grp(bs.flange, '플랜지 볼트', 'Flange bolts')}
          {grp(bs.web, '웨브 볼트', 'Web bolts')}
        </tbody>
      </table>
      <table className="bolt-chk">
        <thead>
          <tr><th>{L('점검항목', 'Check item')}</th><th>{L('값', 'Value')}</th><th>{L('기준', 'Limit')}</th><th>{L('판정', 'Result')}</th></tr>
        </thead>
        <tbody>
          {cc.checks.map((k, i) => (
            <tr key={i} className={k.ok ? '' : 'chk-ng'}>
              <td className="ck-lb">{tr(k.label, lang)}</td>
              <td>{tr(k.value, lang)}</td>
              <td>{tr(k.limit, lang)}</td>
              <td className="ck-rs">{k.ok ? '✔ OK' : '⚠ NG'}{k.note ? <span className="ck-nt"> · {tr(k.note, lang)}</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="narr-bs-cap">{L('그립 = 체결 판두께 합. 표준길이 = 그립 + (너트+와셔2매+나사여장), 5mm 올림(KS B 1010). 설치여유는 AISC Table 7-16(근사)·J3.4M 기준.',
        'Grip = fastened plate stack. Std length = grip + (nut + 2 washers + thread projection), rounded up to 5 mm (KS B 1010). Clearances per AISC Table 7-16 (approx.) and J3.4M.')}</p>
    </section>
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

  // 발현율 ≤50% → 계산결과 생략, 용접 splice 권장만 표기
  const capScale = Math.min(ac.flangeScale, ac.webScale);
  if (capScale <= 0.5) {
    return (
      <div className="report" onClick={onClose}>
        <div className="report-card doc aisc narr" onClick={e => e.stopPropagation()}>
          <div className="report-tools">
            <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
          </div>
          <div className="doc-head">
            <div className="doc-kicker">{stdLabelLong(cond.designStd)} · LRFD · {L('상세 계산서', 'DETAILED CALCULATION')}</div>
            <h2>{r.section} — {L('고력볼트 이음 상세 계산', 'Bolted Splice')}</h2>
          </div>
          <div className="weld-only">
            <div className="wo-badge">{L('용접 splice 권장', 'Welded splice recommended')}</div>
            {ac.flangeScale <= 0.5
              ? <p>{L(`플랜지의 F13.1 순단면 휨파단이 지배하므로 플랜지가 부재강도의 ${Math.round(ac.flangeScale * 100)}%만 발현 가능(≤50%)합니다. 따라서 볼트 접합보다 플랜지의 용접 splice(CJP)를 권장하며, 계산 결과는 생략합니다.`,
                  `Flange net-section flexural rupture (F13.1) governs, so the flange develops only ${Math.round(ac.flangeScale * 100)}% of the member strength (≤50%). A welded flange splice (CJP) is therefore recommended over a bolted one; the calculation is omitted.`)}</p>
              : <p>{L(`웨브가 부재강도의 ${Math.round(ac.webScale * 100)}%만 발현 가능(≤50%)하여 볼트 splice가 부적합합니다. 용접 splice(CJP)를 권장하고 계산 결과는 생략합니다.`,
                  `The web develops only ${Math.round(ac.webScale * 100)}% of the member strength (≤50%), so a bolted splice is unsuitable. A welded splice (CJP) is recommended; the calculation is omitted.`)}</p>}
          </div>
        </div>
      </div>
    );
  }

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
            {L('H형강 강종 ', 'Beam steel ')}<b>{cond.steel}</b>, {L('이음판 강종 ', 'plate steel ')}<b>{ps}</b>, {L('볼트 ', 'bolts ')}<b>{cond.bolt}</b> M{r.boltDia},
            {L(` 나사부 ${cond.threadCond === 'X' ? '전단면 제외(X)' : '전단면 통과(N)'}.`, ` threads ${cond.threadCond === 'X' ? 'excluded (X)' : 'included (N)'} from the shear plane.`)}
            {L(' 자동최소화 후 배치: 플랜지 ', ' Layout after auto-minimisation: flange ')}{r.flange.bolt.m}×{Math.round(r.flange.bolt.n)}{L('볼트, 외부 이음판 ', ' bolts, outer PL-')}{L(`PL-${r.flange.outerPlate?.t}×${r.flange.outerPlate?.w}`, `${r.flange.outerPlate?.t}×${r.flange.outerPlate?.w}`)}
            {r.flange.innerPlate ? L(`, 내부 이음판 PL-${r.flange.innerPlate.t}×${r.flange.innerPlate.w}×2`, `, inner PL-${r.flange.innerPlate.t}×${r.flange.innerPlate.w}×2`) : ''};
            {L(' 웨브 ', ' web ')}{r.web.bolt.m}×{r.web.bolt.n}{L('볼트, PL-', ' bolts, PL-')}{r.web.webPlate?.t}×{r.web.webPlate?.w}×2.
          </p>
        </div>

        <div className="doc-body">
        {/* 0. 설계조건 + 접합 상세도 */}
        <section className="doc-sec">
          <h3><span className="sec-no">0.</span>{L('설계조건 · 접합 상세도', 'Design conditions & connection detail')}</h3>
          <table className="cond-table">
            <tbody>
              <tr>
                <th>{L('형상', 'Shape')}</th><td>{(cond.profile ?? 'H') === 'W' ? 'W-Shape' : 'H-Shape'} · {r.section}</td>
                <th>{L('설계기준', 'Std')}</th><td>{stdLabelLong(cond.designStd)} · LRFD</td>
              </tr>
              <tr>
                <th>{L('부재', 'Member')}</th><td>{cond.member === '기둥' ? L('기둥', 'Column') : L('보', 'Beam')}</td>
                <th>{L('접합', 'Joint')}</th><td>{cond.jointType === '지압' ? L('지압접합', 'Bearing') : L('마찰접합(Class B)', 'Friction (Class B)')}</td>
              </tr>
              <tr>
                <th>{L('H형강', 'Beam')}</th><td>{cond.steel}</td>
                <th>{L('이음판', 'Plate')}</th><td>{ps}</td>
              </tr>
              <tr>
                <th>{L('볼트', 'Bolt')}</th><td>{cond.bolt} · M{r.boltDia} · {L(`나사부 ${cond.threadCond === 'X' ? 'X(제외)' : 'N(통과)'}`, `threads ${cond.threadCond === 'X' ? 'X' : 'N'}`)}</td>
                <th>{L('엇모', 'Stagger')}</th><td>{(cond.noStagger ?? false) ? L('제외', 'Off') : L('포함', 'On')}</td>
              </tr>
              <tr>
                <th>{L('이음판두께', 'Plate t')}</th><td>{(cond.equalPlateT ?? true) ? L('내·외 동일', 'Equal') : L('개별', 'Indiv.')}</td>
                <th>{L('이음판 분담비율', 'Plate share')}</th><td>{(cond.plateShare ?? '5050') === 'area' ? L('면적비례', 'By area') : '50:50'}</td>
              </tr>
              <tr>
                <th>{L('블록전단', 'Block shear')}</th><td>{(cond.bsShare ?? 'balanced') === 'full' ? L('전체력', 'Full') : L('균형', 'Balanced')}</td>
                <th>{L('강도비 α · 갭', 'Ratio α · gap')}</th><td>{Math.round(cond.strengthRatio * 100)}% · {cond.gap ?? 5}mm</td>
              </tr>
            </tbody>
          </table>
          <figure className="cond-fig">
            <div className="cond-svg" dangerouslySetInnerHTML={{ __html: toSVGDetail(r, cond) }} />
            <figcaption>{L('접합 상세도 — 평면·입면·단면(개별 DXF 동일). 녹색=플랜지 이음판·청색=웨브 이음판·적색=치수.',
              'Connection detail — plan/elevation/section (same as individual DXF). green = flange plate, blue = web plate, red = dimensions.')}</figcaption>
          </figure>
        </section>

        {/* 1. 소요력 */}
        <section className="doc-sec">
          <h3><span className="sec-no">1.</span>{L('소요력 · 하중경로', 'Design forces & load path')}</h3>
          {(() => {
            const alpha = cond.strengthRatio, mFy = FySteel(cond.steel, tf), Zx = sectionByName(r.section)?.Zx ?? 0;
            return (
              <p className="narr-p">
                {L('부재 설계휨강도 ', 'Member design flexural strength ')}
                <span className="narr-eq">M<sub>u</sub> = α·φ·F<sub>y</sub>·Z<sub>x</sub> = {alpha.toFixed(2)}·0.9·{mFy}·{nf(Zx, 0)} = <b>{nf(r.Mu_kNm)}</b> kN·m</span>
                {L('. 웨브 설계전단 ', '. Web design shear ')}
                <span className="narr-eq">V<sub>u</sub> = α·φ<sub>v</sub>·0.6·F<sub>y</sub>·(H·t<sub>w</sub>) = {alpha.toFixed(2)}·0.9·0.6·{mFy}·{H}·{tw} = <b>{nf(r.Vu_kN)}</b> kN</span>
                {L(' (φ=0.9, Z_x=단면표 소성단면계수, H·t_w=웨브 총단면).', ' (φ=0.9, Z_x = tabulated plastic modulus, H·t_w = gross web area).')}
              </p>
            );
          })()}
          <p className="narr-p">
            {L('이음부는 부재 설계강도를 발현하도록 설계한다. 휨모멘트를 플랜지 커플로 분해하면 인장(및 압축)플랜지가 다음 힘을 부담한다:',
              'The splice is proportioned to develop the member design strength. The bending moment is resolved into a flange couple: the tension (and compression) flange carries')}
            <span className="narr-eq"> {dem.capScale < 1 ? L('발현 ', 'developed ') : ''}P<sub>f</sub> = M<sub>u</sub>/(d − t<sub>f</sub>) = {knm(dem.Mu)}×10⁶/({H} − {tf}) = <b>{kn(dem.Pf)}</b> kN{dem.capScale < 1 ? L(` (부재 Pf ${nf(r.Puf_kN)} kN)`, ` (member Pf ${nf(r.Puf_kN)} kN)`) : ''}</span>
            &nbsp;({L('커플 arm', 'lever arm')} d − t<sub>f</sub> = {arm} mm).
          </p>
          <p className="narr-p">
            {!r.flange.innerPlate
              ? <>{L('내부 이음판이 없는 소형 단면이므로 ', 'This is a small section without inner plates, so ')}<b>{L('외부 이음판이 플랜지력 Pf 전체(100%)를 분담', 'the outer plate resists the full flange force Pf (100%)')}</b>
                  {L('한다 — 외부 이음판 = ', ' — outer plate = ')}<b>{kn(dem.halfOuter)}</b>{L(' kN (= Pf). 볼트는 단일전단(1면).', ' kN (= Pf). The bolts act in single shear.')}</>
              : Math.abs(dem.halfOuter - dem.half) > 1
              ? <>{L('이 플랜지력은 이중전단 경로를 따르며 ', 'This flange force follows a double-shear load path and is shared ')}<b>{L('판 총단면적 비례', 'by plate gross area')}</b>
                  {L('로 분담된다 — 외부 이음판 = ', ' — the outer plate takes ')}<b>{kn(dem.halfOuter)}</b>
                  {L(' kN, 내부 이음판 2매 = ', ' kN, the inner-plate pair takes ')}<b>{kn(dem.halfInner)}</b>
                  {L(' kN (면적 A외/(A외+A내) 비례).', ' kN (∝ A_out/(A_out+A_in)).')}</>
              : <>{L('이 플랜지력은 이중전단 경로를 따르며 ', 'This flange force follows a double-shear load path and is shared ')}<b>50 : 50</b>
                  {L('으로 분담된다 — 외부 이음판 1매 = 내부 이음판 2매 = Pf/2 = ', ' — the outer plate and the inner-plate pair each resist Pf/2 = ')}<b>{kn(dem.halfOuter)}</b>{L(' kN.', ' kN.')}</>}
            {r.flange.innerPlate && <>{L(' 다만 각 볼트는 2개 전단면을 지나므로 ', ' Every bolt, however, sees the ')}
            <i>{L('Pf 전체', 'full Pf')}</i>{L('를 받는다.', ' because it crosses two shear planes.')}</>}
          </p>
          <p className="narr-p">
            {L('웨브 이음은 설계전단 ', 'The web splice carries the design shear ')}<span className="narr-eq">V<sub>u</sub> = <b>{kn(dem.Vu)}</b> kN</span>
            {L('를 부담한다. 웨브 볼트군이 이음 중심선에서 ', '. Because the web bolt group sits a distance ')}
            <span className="narr-eq">e = {nf(dem.e, 0)} mm</span>{L(' 떨어져 있어 이음판은 편심모멘트 ', ' from the splice centre-line, the web plates must also resist the eccentric moment ')}
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
            <h3><span className="sec-no">{gi + 2}.</span>{group(g, lang).replace(/^[A-Z]\.\s*/, '')}</h3>
            {groups[g].map((c, i) => (
              <div key={i} className={'narr-check' + (c.ok === false ? ' is-ng' : '')}>
                <div className="narr-ct"><span className="narr-id">{c.id}</span> {lang === 'ko' ? c.label : (EN_LABEL[c.id] ?? c.label)} <span className="narr-cl">[{c.clause}]</span></div>
                <CheckFig c={c} lang={lang} />
                {INTRO[c.id] && <p className="narr-intro">{L(INTRO[c.id][0], INTRO[c.id][1])}</p>}
                {c.steps && c.steps.length > 0 && <Steps steps={c.steps} lang={lang} />}
                {c.cases && c.cases.length > 0 && <>
                  <p className="narr-p narr-bs-note">{cond.bsShare === 'full'
                    ? L('[전체력] 모든 Path를 요소 전체 소요력(분담 1.0)과 비교한다(보수적). 단일 파단선 L블록도 전체력으로 검토되어 과다보수일 수 있다. DCR이 가장 큰 Path가 지배한다.',
                        '[Full] Every path is compared with the full element force (share 1.0, conservative); single-line L-blocks are also checked at full force (may be over-conservative). The path with the highest DCR governs.')
                    : L('[균형] 양측 파단선 U블록(Path 2a·2b·3, 5a·5b, 6·7·8·9, 웨브 V)은 요소 전체 소요력(분담 1.0)과, 단일 파단선 L블록(Path 1·4)은 그 열이 분담하는 하중과 비교한다. DCR이 가장 큰 Path가 지배한다.',
                        '[Balanced] Two-sided U-blocks (Path 2a/2b/3, 5a/5b, 6·7/8·9, web V) are compared with the full element force (share 1.0); single-line L-blocks (Path 1/4) with the share carried by that gauge line. The path with the highest DCR governs.')}</p>
                  <p className="narr-eq bs-formula">φR<sub>n</sub> = φ·[ min(0.6·F<sub>u</sub>·A<sub>nv</sub>, 0.6·F<sub>y</sub>·A<sub>gv</sub>) + U<sub>bs</sub>·F<sub>u</sub>·A<sub>nt</sub> ], φ = 0.75 (J4.3)</p>
                  <BlockCaseExpand cases={c.cases} lang={lang} />
                  <p className="narr-bs-cap">{L('▸ 아래 표는 위 전개의 요약', '▸ Summary of the above expansion')}</p>
                  <BlockCaseTable cases={c.cases} lang={lang} />
                </>}
                <Conclusion c={c} lang={lang} />
              </div>
            ))}
          </section>
        ))}

        <BoltInstallSection r={r} cond={cond} lang={lang} no={order.length + 2} />

        <p className="note">
          {L('AISC 360-16(15판) LRFD. φ = 0.90(항복)·0.75(파단/볼트전단/지압/블록전단)·0.90(압축)·1.00(이음판 전단항복 J4.2(a)). 순단면 공제폭 = 표준구멍 dₕ(=d+2mm, Table J3.3; M20→22) + 손상여유 2mm(B4.3b) = d+4mm. 블록전단은 요소별 케이스마다 ',
            'Prepared to AISC 360-16 (15th ed.), LRFD. φ = 0.90 (yielding), 0.75 (rupture / bolt shear / bearing / block shear), 0.90 (compression). Net areas use the effective-hole allowance d + 2 mm for standard holes plus 2 mm damage (B4.3b). Block shear evaluates ')}
          φR<sub>n</sub> = 0.75·[min(0.6F<sub>u</sub>A<sub>nv</sub>, 0.6F<sub>y</sub>A<sub>gv</sub>) + U<sub>bs</sub>F<sub>u</sub>A<sub>nt</sub>]{L('를 산정한다.', ' for every element case.')}
        </p>
        </div>
      </div>
    </div>
  );
}
