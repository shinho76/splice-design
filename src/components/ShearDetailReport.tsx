// SC(전단판) 상세 계산서(서술형·한/영) — AiscDetailReport.tsx(GS)와 동일한 형식·포맷.
//   데이터 소스: singlePlate.ts(steps[]). CheckFig(GS와 공용, AiscCheck 제네릭)로 도해 재사용.
import type { DesignCondition } from '../engine/types.ts';
import type { ShearResult } from '../engine/shear/singlePlate.ts';
import type { AiscCheck, AiscStep } from '../engine/aisc/types.ts';
import { sectionByName } from '../engine/sections.ts';
import { connChecksShear } from '../engine/shear/connChecksShear.ts';
import { useLang, tr, tJoint, type Lang } from '../i18n.ts';
import { groupTS, labelTS, trS } from './shearI18n.ts';
import { stdLabelLong } from '../engine/std.ts';
import CheckFig from './CheckFig.tsx';
import ShearConnectionSVG from './ShearConnectionSVG.tsx';

const nf = (n?: number, d = 1) => n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d });

// step 라벨 한→영 대응(한글은 엔진 원문 그대로 사용). 미등록 라벨은 trS() 단어치환으로 대체.
const SL_EN_SC: Record<string, string> = {
  '공칭전단응력 Fnv': 'Nominal shear stress Fnv', '볼트 1개 φrₙ(2면전단)': 'Per-bolt design shear φrₙ (double shear)',
  '편심 볼트군 φRn': 'Eccentric bolt group φRn', '볼트 1개 설계미끄럼강도(2면)': 'Per-bolt design slip φrₙ (double shear)',
  '지압 상한(볼트 1개)': 'Bearing limit (per bolt)', '연단볼트 찢김': 'Edge-bolt tear-out', '내부볼트 찢김': 'Interior-bolt tear-out',
  '합계 φRn': 'Total φRn', '합계 φRn(SR1과 동일 산식, t=tw)': 'Total φRn (same as SR1, t=tw)',
  '연단볼트 찢김(수평)': 'Edge-bolt tear-out (horizontal)', '합계 φRn(SR3과 동일 산식, t=tw)': 'Total φRn (same as SR3, t=tw)',
  '총전단면적(2매) Ag': 'Gross shear area (2 plies) Ag', '설계전단항복 φVn': 'Design shear yield φVn',
  '순전단면적(2매) Anv': 'Net shear area (2 plies) Anv', '설계전단파단 φVn': 'Design shear rupture φVn',
  '편심모멘트 Mecc': 'Eccentric moment Mecc', '소성단면계수(2매) Z': 'Plastic modulus (2 plies) Z', '설계휨항복 φMn': 'Design flexural yield φMn',
  '순단면계수(2매) Znet': 'Net elastic modulus (2 plies) Znet', '설계휨파단 φMn': 'Design flexural rupture φMn',
  '전단항 (V/φVn)': 'Shear term (V/φVn)', '휨항 (M/φMn)': 'Flexural term (M/φMn)', '이용률': 'Utilisation',
  '전단항 (V/φVn,파단)': 'Shear term (V/φVn, rupture)', '휨항 (M/φMn,파단)': 'Flexural term (M/φMn, rupture)',
  '총전단면적 Agv': 'Gross shear area Agv', '순전단면적 Anv': 'Net shear area Anv', '순인장면적 Ant': 'Net tension area Ant',
  '설계블록전단 φRn': 'Design block shear φRn', '연성상한 t_max': 'Ductility limit t_max', '채택 판두께(매당) tp': 'Selected plate t (per ply) tp',
  '총전단면적 Aw': 'Gross shear area Aw',
};
const slabel = (s: string, lang: Lang) => lang === 'ko' ? s : (SL_EN_SC[s] ?? trS(s, lang));

// 검토별 도입 서술 [ko, en]
const INTRO: Record<string, [string, string]> = {
  SB1: ['볼트는 소요전단 V 전체를 2개 전단면(2면전단: 양측 전단판)으로 전달한다. 판이 지지면에서 편심 a만큼 떨어져 있어 볼트군은 편심(탄성벡터법 C계수)으로 저항한다.', 'The bolts transfer the full shear V across two shear planes (double shear: plates on both sides of the web). Since the plate sits an offset a from the support face, the bolt group resists it eccentrically (elastic-vector C-factor).'],
  SB2: ['마찰접합에서 볼트는 V 하에서 미끄러지지 않아야 하며, 편심 볼트군의 임계볼트를 기준으로 한다.', 'For a slip-critical joint the bolts must not slip under V, checked at the critical (most-loaded) bolt of the eccentric group.'],
  SR1: ['각 볼트는 전단판(2매 합산두께)에 지압하며, 연단·내부 볼트의 지압·찢김을 수직방향으로 합산한다.', 'Each bolt bears against the shear plate (combined 2-ply thickness); bearing and tear-out are summed over the edge and interior bolts in the vertical direction.'],
  SR2: ['동일 볼트가 보 웨브(1매)에도 지압하며, 판과 웨브 중 약한 쪽이 지배한다.', 'The same bolts also bear against the beam web (single ply); the weaker of plate and web governs.'],
  SR3: ['원자료(Thornton Tomasetti Single Plate Capacity)의 수평방향 지압·찢김 항목 — 열간 간격이 아닌 연단(Leh) 찢김이 전 볼트에 대해 지배한다(NC≤2열).', "The source sheet's horizontal-direction bearing/tear-out item — edge (Leh) tear-out governs for every bolt (NC ≤ 2 columns, no interior spacing case)."],
  SR4: ['보 웨브는 무코프(연속 부재) 전제라 수평 자유단이 없어 실질적으로 지배하지 않으나, 참고용으로 함께 산출한다.', "The beam web has no horizontal free edge (uncoped, continuous member), so this rarely governs; computed for reference."],
  SP1: ['전단판(2매)은 소요전단 V 하에서 총단면 항복이 없어야 한다.', 'The shear plate (2 plies) must not yield across its gross section under the design shear V.'],
  SP2: ['항복 외에, 전단판은 볼트구멍 열(순단면)에서 전단파단하지 않아야 한다.', 'Beyond yielding, the plate must not rupture in shear through the line of bolt holes (net section).'],
  SP3: ['판 중심선이 지지면에서 편심 offset만큼 떨어져 있어 판 평면내 국부 휨모멘트 M=V·e가 발생한다 — 총단면 기준 항복을 검토한다.', 'Because the plate centreline sits an eccentric offset from the support face, an in-plane local moment M=V·e arises — checked for yielding on the gross section.'],
  SP4: ['동일 편심휨을 볼트구멍이 공제된 순단면 기준 파단으로 검토한다.', 'The same eccentric moment is checked against rupture on the net section (holes deducted).'],
  SP5: ['전단 V와 편심모멘트 M을 동시에 받는 판의 항복 상호작용을 검토한다. 이용률 √[(V/φVn)²+(M/φMn)²]≤1가 한계다.', 'The plate carries shear V and moment M together; yielding interaction is checked. Utilisation √[(V/φVn)²+(M/φMn)²]≤1 is the limit.'],
  SP8: ['동일 상호작용을 파단(순단면) 강도 기준으로 검토한다.', 'The same interaction is checked against rupture (net-section) strength.'],
  SP6: ['전단판이 볼트군 주위로 뜯길 수 있어(블록전단), 지지측 자유단을 낀 L형(단일열, Ubs=0.5)과 — NC=2일 때 — 열간·양연을 낀 U형(Ubs=1.0)을 모두 검토해 최소 φRn을 지배로 채택한다. 원자료(PDF p.20 Block Shear Case A) 대조 결과 shear-tab의 전형적 지배 경로는 L형이다.', "The plate could tear out around the bolt group (block shear). Both the L-shape (single line adjacent to the support-side free edge, Ubs=0.5) and — when NC=2 — the U-shape (two lines with edges, Ubs=1.0) are checked; the lower φRn governs. Per the source sheet (PDF p.20, Block Shear Case A) the L-shape typically governs for a shear tab."],
  SP7: ['볼트 연성(구멍 변형능력)을 확보하기 위해 AISC Manual Part 10의 두께 상한(db/2+1.6mm) 이하로 판두께를 제한한다(매당 두께 기준).', 'To ensure bolt ductility (hole-elongation capacity), the plate thickness (per ply) is limited to the AISC Manual Part 10 upper bound (db/2+1.6mm).'],
  SM1: ['부재(피지지보) 웨브 자체의 전단항복을 검토한다 — 전단판/볼트와 무관하게 부재 자체가 소요전단을 지지할 수 있어야 한다.', "The supported beam's own web is checked for shear yielding — independent of the plate/bolts, the member itself must be able to carry the design shear."],
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

function Conclusion({ c, lang }: { c: AiscCheck; lang: Lang }) {
  const L = (ko: string, en: string) => lang === 'en' ? en : ko;
  if (c.dcr == null) return null;
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

// #N 볼트 치수·체결 점검 — 사양(그립·표준길이·본수, ShearResult에 이미 산정) + 설치여유(connChecksShear)
function BoltInstallSection({ r, cond, lang, no }: { r: ShearResult; cond: DesignCondition; lang: Lang; no: number }) {
  const L = (ko: string, en: string) => lang === 'en' ? en : ko;
  const cc = connChecksShear(r);
  const thread = cond.threadCond === 'X' ? L('X(전단면 제외)', 'X (excluded)') : L('N(전단면 통과)', 'N (included)');
  return (
    <section className="doc-sec">
      <h3><span className="sec-no">{no}.</span>{L('볼트 치수 · 체결 점검', 'Bolt sizing & installation check')}</h3>
      <table className="cond-table bolt-spec">
        <tbody>
          <tr>
            <th>{L('규격', 'Grade')}</th><td>{cond.bolt} · M{r.boltDia}</td>
            <th>{L('나사부', 'Thread')}</th><td>{thread}</td>
          </tr>
          <tr>
            <th>{L('전단판 볼트', 'Plate bolts')}</th><td>{r.boltCount}{L('본', '')}</td>
            <td colSpan={2}>{L('그립', 'grip')} {r.boltGrip}mm({L('판', 'PL')}{r.plate.t}+{L('웨브', 'web')}{sectionByName(r.section)?.tw}+{L('판', 'PL')}{r.plate.t}) · {L('표준길이', 'Std length')} M{r.boltDia}×{r.boltLen}</td>
          </tr>
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
      <p className="narr-bs-cap">{L('그립 = 체결 판두께 합(전단판 2매+웨브). 표준길이 = 그립 + (너트+와셔2매+나사여장), 5mm 올림(KS B 1010). 설치여유는 AISC Table 7-16(근사)·J3.4M 기준.',
        'Grip = fastened stack (2 plates + web). Std length = grip + (nut + 2 washers + thread projection), rounded up to 5 mm (KS B 1010). Clearances per AISC Table 7-16 (approx.) and J3.4M.')}</p>
    </section>
  );
}

export default function ShearDetailReport({ r, cond, onClose }: { r: ShearResult; cond: DesignCondition; onClose: () => void }) {
  const lang = useLang();
  const L = (ko: string, en: string) => lang === 'en' ? en : ko;
  const sec = sectionByName(r.section);
  const H = sec?.H ?? 0, tw = sec?.tw ?? 0;
  const ps = cond.plateSteel ?? cond.steel;

  const order: string[] = [];
  const groups: Record<string, AiscCheck[]> = {};
  for (const c of r.checks) { if (!groups[c.group]) order.push(c.group); (groups[c.group] ??= []).push(c); }

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card doc aisc narr" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="tool-btn" onClick={() => window.print()}>🖨 {L('PDF 저장', 'Save PDF')}</button>
          <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
        </div>

        <div className="doc-head">
          <div className="doc-kicker">{stdLabelLong(cond.designStd)} · LRFD · {L('상세 계산서', 'DETAILED CALCULATION')}</div>
          <h2>{r.section} — {L('전단판 접합 상세 계산(2면전단)', 'Shear Tab, Full Design Narrative (Double Shear)')}</h2>
          <p className="narr-lead">
            {L(`전단판 접합, ${cond.jointType === '지압' ? '지압접합' : '마찰접합(Class B)'}. `, `Shear tab, ${cond.jointType === '지압' ? 'bearing-type' : 'slip-critical (Class B)'} joint. `)}
            {L('H형강 강종 ', 'Beam steel ')}<b>{cond.steel}</b>, {L('전단판 강종 ', 'plate steel ')}<b>{ps}</b>, {L('볼트 ', 'bolts ')}<b>{cond.bolt}</b> M{r.boltDia},
            {L(` 나사부 ${cond.threadCond === 'X' ? '전단면 제외(X)' : '전단면 통과(N)'}.`, ` threads ${cond.threadCond === 'X' ? 'excluded (X)' : 'included (N)'} from the shear plane.`)}
            {L(' 자동설계 배치: 전단판(양측) ', ' Auto-designed layout: shear tab (both sides) ')}{r.NC}×{r.NR}{L('볼트, 2-PL ', ' bolts, 2-PL ')}{r.plate.t}×{r.plate.L}×{r.plate.w}.
          </p>
        </div>

        <div className="doc-body">
        {/* 0. 설계조건 + 접합 상세도 */}
        <section className="doc-sec">
          <h3><span className="sec-no">0.</span>{L('설계조건 · 접합 상세도', 'Design conditions & connection detail')}</h3>
          <table className="cond-table">
            <tbody>
              <tr>
                <th>{L('형상', 'Shape')}</th><td>H-Shape · {r.section}</td>
                <th>{L('설계기준', 'Std')}</th><td>{stdLabelLong(cond.designStd)} · LRFD</td>
              </tr>
              <tr>
                <th>{L('접합 형식', 'Type')}</th><td>{L('전단판(2면전단·양측판)', 'Shear tab (double shear)')}</td>
                <th>{L('접합', 'Joint')}</th><td>{tJoint(cond.jointType, lang)}</td>
              </tr>
              <tr>
                <th>{L('H형강', 'Beam')}</th><td>{cond.steel}</td>
                <th>{L('전단판', 'Plate')}</th><td>{ps}</td>
              </tr>
              <tr>
                <th>{L('볼트', 'Bolt')}</th><td>{cond.bolt} · M{r.boltDia} · {L(`나사부 ${cond.threadCond === 'X' ? 'X(제외)' : 'N(통과)'}`, `threads ${cond.threadCond === 'X' ? 'X' : 'N'}`)}</td>
                <th>{L('강도비 α', 'Ratio α')}</th><td>{Math.round(cond.strengthRatio * 100)}%</td>
              </tr>
              <tr>
                <th>{L('구성', 'Config')}</th><td colSpan={3}>{r.config} · e,bolt={r.eBolt}mm · e,plate={r.ePlate}mm</td>
              </tr>
            </tbody>
          </table>
          <figure className="cond-fig">
            <ShearConnectionSVG r={r} cond={cond} />
            <figcaption>{L('전단판 접합 상세도 — 입면·단면(2면전단). 지지부재는 SC 엔진이 형상을 산정하지 않아 해치 기호로만 표시.',
              'Shear tab connection detail — elevation/section (double shear). The support member is not modeled by the SC engine; shown only as a hatch symbol.')}</figcaption>
          </figure>
        </section>

        {/* 1. 소요력 · 하중경로 */}
        <section className="doc-sec">
          <h3><span className="sec-no">1.</span>{L('소요력 · 하중경로', 'Design forces & load path')}</h3>
          <p className="narr-p">
            {L('부재 웨브 설계전단(웨브전단 85% 발현 기준, 기존 splice 앱과 동일) ', "Design shear from the member's own web shear capacity (85% basis, same convention as the splice app) ")}
            <span className="narr-eq">V = α·φ<sub>v</sub>·0.6·F<sub>y</sub>·(H·t<sub>w</sub>) = <b>{nf(r.V_kN)}</b> kN</span>
            {L(' (α=강도비, H·t_w=웨브 총단면).', ' (α = strength ratio, H·t_w = gross web area).')}
          </p>
          <p className="narr-p">
            {L('전단판은 지지면(z=0)에서 편심 offset a만큼 떨어진 위치에서 볼트로 체결되는 캔틸레버 형태다. 이 편심 때문에 볼트군은 ', 'The shear plate is a cantilevered tab bolted at an offset a from the support face (z=0). Because of this eccentricity, the bolt group is checked ')}
            <b>{L('편심 볼트군(탄성벡터법)', 'as an eccentric group (elastic-vector method)')}</b>
            {L('으로 검토되며, 판은 평면내 국부 휨모멘트 ', ", and the plate carries an in-plane local moment ")}
            <span className="narr-eq">M<sub>ecc</sub> = V·e<sub>plate</sub> = {nf(r.V_kN)}×{r.ePlate} = <b>{nf(r.V_kN * r.ePlate / 1e3, 2)}</b> kN·m</span>{L('를 함께 받는다.', '.')}
          </p>
          <p className="narr-p">
            {L('볼트군 C계수 산정에 쓰이는 편심(e,bolt=지지면→최원단 볼트열)과 판휨 산정에 쓰이는 편심(e,plate=지지면→볼트군 도심)은 서로 다르다 — 원자료(Thornton Tomasetti Single Plate Capacity) 대조 확인 결과다:',
              'The eccentricity used for the bolt-group C-factor (e,bolt = support face → farthest bolt line) differs from that used for plate bending (e,plate = support face → bolt-group centroid) — confirmed against the source sheet (Thornton Tomasetti Single Plate Capacity):')}
            {' '}<span className="narr-eq">e<sub>bolt</sub> = {r.eBolt} mm, e<sub>plate</sub> = {r.ePlate} mm</span>
            {L(` → 이 편심(e,bolt)이 88.9mm(3.5in)를 초과하면 `, ' → when e,bolt exceeds 88.9 mm (3.5 in), the configuration is classified ')}<b>{r.config}</b>{L('으로 분류한다.', '.')}
          </p>
          {!r.fitsWeb && (
            <p className="narr-p narr-cap">
              {L(`참고 — 소요전단이 커서 볼트행수가 늘어나 판 춤(${r.plate.L}mm)이 보 웨브 순높이(T=${r.clearH}mm)를 초과했다. 실제 시공 시 대체접합(양면앵글·모멘트접합) 또는 α 하향 검토가 필요하다.`,
                `Note — the required shear demands enough bolt rows that the plate depth (${r.plate.L} mm) exceeds the beam web clear height (T=${r.clearH} mm). An alternative connection (double angle / moment) or a lower α should be considered.`)}
            </p>
          )}
        </section>

        {/* 2..N. 검토 그룹 */}
        {order.map((g, gi) => (
          <section key={g} className="doc-sec">
            <h3><span className="sec-no">{gi + 2}.</span>{groupTS(g, lang).replace(/^[A-Z]\.\s*/, '')}</h3>
            {groups[g].map((c, i) => (
              <div key={i} className={'narr-check' + (c.ok === false ? ' is-ng' : '')}>
                <div className="narr-ct"><span className="narr-id">{c.id}</span> {labelTS(c.id, c.label, lang)} <span className="narr-cl">[{c.clause}]</span></div>
                <CheckFig c={c} lang={lang} />
                {INTRO[c.id] && <p className="narr-intro">{L(INTRO[c.id][0], INTRO[c.id][1])}</p>}
                {c.steps && c.steps.length > 0 && <Steps steps={c.steps} lang={lang} />}
                {!c.steps?.length && c.detail && <p className="narr-p">{trS(c.detail, lang)}</p>}
                <Conclusion c={c} lang={lang} />
              </div>
            ))}
          </section>
        ))}

        <BoltInstallSection r={r} cond={cond} lang={lang} no={order.length + 2} />

        <p className="note">
          {L('AISC 360-16(15판) LRFD. φ = 1.00(전단판 전단항복 J4.2 상당)·0.90(휨항복 F11)·0.75(파단/볼트전단/지압/블록전단). 순단면 공제폭 = 표준구멍 dₕ(=d+2mm, Table J3.3) + 손상여유 2mm(B4.3b) = d+4mm. 원자료(Thornton Tomasetti "Single Plate Capacity")의 단전단(1매) 검토항목을 2면전단(양측판, tp2=2·tp)으로 확장했으며, 용접설계·컬럼측 면외 항복선 검토는 원자료에도 없어 포함하지 않는다.',
            'Prepared to AISC 360-16 (15th ed.), LRFD. φ = 1.00 (plate shear yield, per J4.2), 0.90 (flexural yield, F11), 0.75 (rupture / bolt shear / bearing / block shear). Net areas use the effective-hole allowance d + 2 mm (Table J3.3) plus 2 mm damage (B4.3b). The source sheet\'s (Thornton Tomasetti "Single Plate Capacity") single-shear items are extended to double shear (2 plates, tp2=2·tp); weld design and column-side out-of-plane yield-line checks are not included, as the source sheet does not cover them either.')}
        </p>
        </div>
      </div>
    </div>
  );
}
