// KBC-09 상세 계산서(서술형·한/영) — 편람 설계절차를 단계별로 읽어 내려가도록 전개.
// 데이터 소스: 엔진 result.steps(CalcStep). 한→영은 i18n tr() 용어치환.
import type { DesignCondition, DesignResult, CalcStep } from '../engine/types.ts';
import { kbcCheck } from '../engine/kbcCheck.ts';
import { useLang, tr, tMember, tJoint } from '../i18n.ts';

const nf = (v?: number) => v == null ? '' : v.toLocaleString('en-US');
const strip = (g: string) => g.replace(/^[가-힣]\)\s*/, '');   // "가) ..." → "..."

// 단계별 도입 서술 [ko, en] — 스트립된 그룹명으로 키
const INTRO: Record<string, [string, string]> = {
  '소요휨강도 · 플랜지 소요축력': ['부재의 공칭휨강도에 부분강도비를 곱해 접합부 소요휨강도를 정하고, 이를 플랜지 커플(H−tf)로 나눠 플랜지 소요축력을 얻는다.',
    'The connection required moment is the member nominal flexural strength times the partial-strength ratio; dividing by the flange couple (H−tf) gives the flange axial demand.'],
  '플랜지 소요압축강도': ['기둥은 세장비를 무시하고 총단면 항복만으로 플랜지 소요압축력을 정한다.',
    'For a column, slenderness is neglected; the flange compressive demand comes from gross-section yielding only.'],
  '플랜지 첨판 폭·두께': ['소요축력을 첨판 강종의 설계항복강도로 나눠 소요단면적을 구하고, 표준 폭에서 두께를 정한다(내·외 분담).',
    'The required plate area is the demand divided by the plate design yield strength; the thickness follows from the standard width (inner/outer split).'],
  '플랜지 볼트 설계강도·배열': ['볼트 1개의 설계강도(마찰 미끄럼 또는 지압)를 산정하고, 소요축력을 나눠 필요한 볼트 행수를 정한다.',
    'The per-bolt design strength (slip or bearing) is computed; dividing the demand gives the required number of bolt rows.'],
  '플랜지 첨판 길이': ['볼트 배열·피치·연단·이음갭으로 첨판 길이를 정한다.',
    'The plate length follows from the bolt layout, pitch, edge distance and splice gap.'],
  '웨브 소요전단강도': ['웨브 총단면의 전단항복강도에 부분강도비를 곱해 소요전단강도를 정한다.',
    'The required shear is the gross web shear-yield strength times the partial-strength ratio.'],
  '웨브 이음 소요력': ['웨브 이음부가 부담할 소요력을 총웨브면적 기준으로 정한다.',
    'The web splice demand is taken on the gross web area.'],
  '웨브 볼트 · 첨판': ['웨브 볼트 1개 설계강도로 필요 개수를 정하고, 춤·피치 제약 하에서 배열과 첨판 치수를 정한다.',
    'The web bolt count comes from the per-bolt strength; the layout and plate size follow from the depth/pitch constraints.'],
};

export default function KbcDetailReport({ result, cond, onClose }: { result: DesignResult; cond: DesignCondition; onClose: () => void }) {
  const lang = useLang();
  const L = (ko: string, en: string) => lang === 'en' ? en : ko;
  const pct = Math.round(cond.strengthRatio * 100);

  const order: string[] = [];
  const groups: Record<string, CalcStep[]> = {};
  for (const s of result.steps) { if (!groups[s.group]) order.push(s.group); (groups[s.group] ??= []).push(s); }
  const dcr = kbcCheck(result, cond);
  const dcrRows = dcr.items.slice().sort((a, b) => b.dcr - a.dcr);

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card doc narr" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="tool-btn" onClick={() => window.print()}>🖨 {L('PDF 저장', 'Save PDF')}</button>
          <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
        </div>

        <div className="doc-head">
          <div className="doc-kicker">KBC-09 · LRFD · {L('상세 계산서', 'DETAILED CALCULATION')}</div>
          <h2>{result.section} — {L('고력볼트 표준접합 상세 계산', 'Standard Bolted Connection — Full Narrative')}</h2>
          <p className="narr-lead">
            {tMember(cond.member, lang)} · {tJoint(cond.jointType, lang)}. {L('H형강 강종 ', 'Beam steel ')}<b>{cond.steel}</b>,
            {L(' 첨판 강종 ', ' plate steel ')}<b>{cond.plateSteel ?? cond.steel}</b>, {L('볼트 ', 'bolts ')}<b>{cond.bolt}</b> M{result.boltDia},
            {L(' 부분강도비 α = ', ' partial-strength ratio α = ')}<b>{pct}%</b>.
            {L(' 근거: 한국강구조학회 고력볼트 표준접합 설계편람(KBC-09 한계상태설계법).',
              ' Basis: KSSC High-Strength Bolt Standard Connection Design Guide (KBC-09 LRFD).')}
          </p>
        </div>

        {order.map((g, gi) => {
          const title = strip(g);
          const intro = INTRO[title];
          return (
            <section key={g} className="doc-sec">
              <h3><span className="sec-no">{gi + 1}.</span>{tr(title, lang)}</h3>
              {intro && <p className="narr-intro">{L(intro[0], intro[1])}</p>}
              {groups[g].map((st, i) => (
                <div key={i} className="narr-check">
                  <div className="narr-ct">
                    <span className="narr-id">{gi + 1}.{i + 1}</span> {tr(st.label, lang)}
                    {st.ref && <span className="narr-cl">［{st.ref}］</span>}
                  </div>
                  {st.note && <p className="narr-intro">▸ {tr(st.note, lang)}</p>}
                  {(st.formula || st.substitution || st.value != null) && (
                    <ol className="narr-steps"><li>
                      {st.formula && <span className="ns-eq">{tr(st.formula, lang)}</span>}
                      {st.substitution && <span className="ns-sub"> = {tr(st.substitution, lang)}</span>}
                      {st.value != null && <span className="ns-val"> = <b>{nf(st.value)}</b> {tr(st.unit, lang)}</span>}
                      {st.value == null && st.unit && <span className="ns-val"> {tr(st.unit, lang)}</span>}
                      {st.check && <span className={st.check === 'OK' ? 'narr-dcr' : ''}> ∴ {st.check}</span>}
                    </li></ol>
                  )}
                </div>
              ))}
            </section>
          );
        })}

        <section className="doc-sec">
          <h3><span className="sec-no">{order.length + 1}.</span>{L('설계 결과 요약', 'Design Summary')}</h3>
          <table className="result-table2"><tbody>
            <tr><th>{L('플랜지 볼트', 'Flange bolts')}</th><td>{result.flange.bolt.m}×{Math.round(result.flange.bolt.n)} = {result.flange.bolt.m * Math.round(result.flange.bolt.n) * 4}-M{result.boltDia}</td></tr>
            <tr><th>{L('플랜지 외첨판', 'Flange outer plate')}</th><td>{plate(result.flange.outerPlate)} ×2</td></tr>
            <tr><th>{L('플랜지 내첨판', 'Flange inner plate')}</th><td>{result.flange.innerPlate ? `${plate(result.flange.innerPlate)} ×4` : '—'}</td></tr>
            <tr><th>{L('웨브 볼트', 'Web bolts')}</th><td>{result.web.bolt.m}×{result.web.bolt.n} = {result.web.bolt.m * result.web.bolt.n * 2}-M{result.boltDia} (Pc={result.web.Pc ?? '—'})</td></tr>
            <tr><th>{L('웨브 첨판', 'Web plate')}</th><td>{plate(result.web.webPlate)} ×2</td></tr>
          </tbody></table>
        </section>

        {dcr.govDcr != null && (
          <section className="doc-sec">
            <h3><span className="sec-no">{order.length + 2}.</span>{L('한계상태별 DCR 검토', 'DCR by Limit State')}</h3>
            <p className="narr-intro">
              {L('각 한계상태의 소요강도(Ru)를 설계강도(φRn)로 나눈 DCR = Ru/φRn 를 정리한다. 지배(최대) DCR = ',
                'DCR = Ru/φRn for each limit state — demand over design capacity. Governing (max) DCR = ')}
              <b className={dcr.govDcr > 1 ? '' : 'narr-dcr'}>{dcr.govDcr.toFixed(2)}</b>
              {dcr.govDcr > 1 ? L(' 로 1.0을 초과하여 재검토가 필요하다.', ' exceeds 1.0 — review required.') : L(' ≤ 1.0 이므로 전 항목이 만족한다.', ' ≤ 1.0, so all limit states are satisfied.')}
            </p>
            <table className="result-table2 dcr-report">
              <thead><tr><th>{L('검토항목', 'Limit state')}</th><th>Ru</th><th>φRn</th><th>{L('조항', 'Ref')}</th><th>DCR</th></tr></thead>
              <tbody>
                {dcrRows.map(it => {
                  const gov = it.id === dcr.govId, ng = it.dcr > 1;
                  return (
                    <tr key={it.id} className={`${gov ? 'dcr-govrow' : ''}${ng ? ' dcr-ngrow' : ''}`}>
                      <td>{gov && <span className="dcr-star">▲</span>}{tr(it.label, lang)}</td>
                      <td>{nf(Math.round(it.demand))} {it.unit}</td>
                      <td>{nf(Math.round(it.capacity))} {it.unit}</td>
                      <td className="narr-cl">{it.ref}</td>
                      <td className={`dcr-val${ng ? ' ng' : ''}${gov ? ' gov' : ''}`}>{it.dcr.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}

function plate(p?: { t: number; w: number; L: number }) {
  return p ? `PL-${p.t}×${p.w}×${p.L}` : '—';
}
