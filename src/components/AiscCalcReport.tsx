import type { DesignResult, DesignCondition } from '../engine/types.ts';
import { aiscAutoCorrect, type AiscCheck } from '../engine/aisc/compat.ts';
import { parseName } from '../engine/sections.ts';
import { useLang, tMember, tJoint } from '../i18n.ts';
import { groupT, labelT, trA } from './aiscI18n.ts';
import { stdLabel, stdLabelLong } from '../engine/std.ts';

// 검토 대상 부위 글리프(육안 확인용). clause로 종류 판별.
function glyphKey(c: AiscCheck): string {
  const q = c.clause;
  if (q === 'J3.6') return 'boltshear';
  if (q === 'J3.8') return 'slip';
  if (q === 'J3.10') return 'bearing';
  if (q === 'J4.1') return 'yield';
  if (q === 'J4.2') return 'rupture';
  if (q.startsWith('J4.4')) return 'buckle';
  if (q === 'J4.3') return 'block';
  if (q === 'F13.1') return 'flange';
  if (q.startsWith('D2')) return 'wt';
  return '';
}
function Glyph({ k }: { k: string }) {
  const P = 'M2,8 L58,8 L58,32 L2,32 Z';   // 판 외곽
  const holes = <>{[16, 30, 44].map(x => <circle key={x} cx={x} cy={20} r={3} className="ag-hole" />)}</>;
  return (
    <svg viewBox="0 0 60 40" className="ag-glyph" role="img" aria-label={k}>
      {k === 'boltshear' && <>
        <rect x="2" y="6" width="56" height="7" className="ag-steel" /><rect x="2" y="19" width="56" height="7" className="ag-steel2" /><rect x="2" y="27" width="56" height="7" className="ag-steel" />
        <line x1="30" y1="4" x2="30" y2="36" className="ag-r" /><circle cx="30" cy="20" r="3.4" className="ag-hole" />
      </>}
      {k === 'bearing' && <><path d={P} className="ag-steel" /><circle cx="20" cy="20" r="4" className="ag-hole" /><path d="M4,16 L15,16 M4,24 L15,24" className="ag-r" /><path d="M25,17 A4 4 0 0 0 25,23" className="ag-b" /></>}
      {k === 'yield' && <><path d={P} className="ag-steel" /><rect x="6" y="8" width="12" height="24" className="ag-bf" />{holes}</>}
      {k === 'rupture' && <><path d={P} className="ag-steel" /><line x1="30" y1="6" x2="30" y2="34" className="ag-r" strokeDasharray="3 2" />{holes}</>}
      {k === 'buckle' && <><path d={P} className="ag-steel" /><path d="M14,20 C22,12 38,28 46,20" className="ag-r" fill="none" strokeDasharray="4 2" /><line x1="14" y1="35" x2="46" y2="35" className="ag-dim" /></>}
      {k === 'block' && <><path d={P} className="ag-steel" /><path d="M8,10 L52,10 L52,30 L8,30" className="ag-b" fill="none" /><path d="M8,10 L52,10 M8,30 L52,30" className="ag-r" fill="none" /><line x1="8" y1="10" x2="8" y2="30" className="ag-b" />{holes}</>}
      {k === 'flange' && <><rect x="6" y="8" width="48" height="7" className="ag-bf" /><rect x="26" y="8" width="8" height="24" className="ag-steel" /><rect x="6" y="25" width="48" height="7" className="ag-steel" /><circle cx="20" cy="11" r="2.6" className="ag-hole" /><circle cx="40" cy="11" r="2.6" className="ag-hole" /></>}
      {k === 'wt' && <><rect x="6" y="9" width="48" height="7" className="ag-bf" /><rect x="26" y="9" width="8" height="24" className="ag-steel" /><circle cx="20" cy="12" r="2.6" className="ag-hole" /><circle cx="40" cy="12" r="2.6" className="ag-hole" /></>}
      {k === 'slip' && <><rect x="2" y="12" width="56" height="16" className="ag-steel" /><circle cx="20" cy="20" r="3.4" className="ag-hole" /><circle cx="40" cy="20" r="3.4" className="ag-hole" /></>}
    </svg>
  );
}

export default function AiscCalcReport({ result, cond, onClose }: { result: DesignResult; cond: DesignCondition; onClose: () => void }) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const ac = aiscAutoCorrect(result, cond);
  const r = ac.result;
  const { H, B, tw, tf } = parseName(r.section);
  const pct = Math.round(cond.strengthRatio * 100);

  // 그룹 순서 유지
  const order: string[] = [];
  const groups: Record<string, AiscCheck[]> = {};
  for (const c of ac.report.checks) { if (!groups[c.group]) order.push(c.group); (groups[c.group] ??= []).push(c); }

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card doc aisc" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="tool-btn" onClick={() => window.print()}>🖨 {L('PDF 저장', 'Save PDF')}</button>
          <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
        </div>

        <div className="doc-head">
          <div className="doc-kicker">{stdLabelLong(cond.designStd)} · LRFD · {L('플랜지·웨브 이음 전 한계상태 검토', 'FLANGE & WEB SPLICE — ALL LIMIT STATES')}</div>
          <h2>{stdLabel(cond.designStd)} {L('첨판 이음 계산서', 'Splice Calculation')}</h2>
          <table className="doc-meta"><tbody>
            <tr><th>{L('부재 / 접합', 'Member / Joint')}</th><td>{r.section} · {tMember(cond.member, lang)} {tJoint(cond.jointType, lang)}</td><th>{L('나사조건', 'Thread')}</th><td>{cond.threadCond ?? 'N'}</td></tr>
            <tr><th>{L('강종(H/판)', 'Steel H/PL')}</th><td>{cond.steel} / {cond.plateSteel ?? cond.steel} · {L('볼트', 'Bolt')} {cond.bolt}</td><th>{L('플랜지력 Pf', 'Flange force Pf')}</th><td>{r.Puf_kN.toLocaleString()} kN</td></tr>
            <tr><th>{L('설계기준', 'Basis')}</th><td colSpan={3}>{stdLabelLong(cond.designStd)} · {L('φ(항복0.9·파단/전단/지압0.75)', 'φ (yield 0.9, rupture/shear/bearing 0.75)')} · {L('분담 50:50·Ubs 1.0·K 1.2', 'split 50:50, Ubs 1.0, K 1.2')}</td></tr>
          </tbody></table>
        </div>

        {/* 자동보정 요약 */}
        <section className="doc-sec">
          <h3><span className="sec-no">1.</span>{L('배치 · 자동보정', 'Layout & Auto-correction')}</h3>
          <table className="result-table2"><tbody>
            <tr><th>{L('편람 표준배치', 'KBC layout')}</th><td>{L('외첨판', 'Outer')} PL-{result.flange.outerPlate?.t}×{result.flange.outerPlate?.w} · {L('내첨판', 'Inner')} PL-{result.flange.innerPlate?.t}×{result.flange.innerPlate?.w}×2 · {L('볼트', 'Bolt')} {result.flange.bolt.m}×{Math.round(result.flange.bolt.n)}-M{result.boltDia}</td></tr>
            <tr><th>{L('보정 내역', 'Changes')}</th><td>{ac.changes.length ? ac.changes.map(x => trA(x, lang)).join(' · ') : L('보정 없음(전 항목 만족)', 'none (all pass)')}</td></tr>
            <tr><th>{L('보정 후', 'Corrected')}</th><td><b>{L('외첨판', 'Outer')} PL-{r.flange.outerPlate?.t}×{r.flange.outerPlate?.w} · {L('내첨판', 'Inner')} PL-{r.flange.innerPlate?.t}×{r.flange.innerPlate?.w}×2 · {L('볼트', 'Bolt')} {r.flange.bolt.m}×{Math.round(r.flange.bolt.n)}-M{r.boltDia}</b> {!ac.ok && <span className="ag-ng">· {L('부재 단면 한계 — 단면 상향 필요', 'member section limited — upsize needed')}</span>}</td></tr>
            {ac.pfCap != null && <tr><th>{L('소요 캡핑', 'Demand cap')}</th><td>{L('부재 F13/D2 강도로 제한', 'limited by member F13/D2')}: Pf {r.Puf_kN.toLocaleString()} → <b>{Math.round(ac.pfCap).toLocaleString()} kN</b> <span className="ag-ng">({L('구멍 있는 부재의 실제 발현강도', 'holed-member achievable strength')})</span></td></tr>}
            <tr><th>{L('플랜지판 중량', 'Plate weight')}</th><td>{ac.wt0.toFixed(1)} → {ac.wt1.toFixed(1)} kg · {L('지배 DCR', 'gov. DCR')} <b className={ac.ok ? 'ag-ok' : 'ag-ng'}>{ac.report.govDcr}</b> {ac.ok ? 'OK' : 'NG'}</td></tr>
          </tbody></table>
        </section>

        {/* 검토 항목 (그룹별, 그림 포함) */}
        {order.map((g, gi) => (
          <section key={g} className="doc-sec">
            <h3><span className="sec-no">{gi + 2}.</span>{groupT(g, lang)}</h3>
            <table className="ag-table">
              <thead><tr>
                <th>{L('그림', 'Fig')}</th><th>{L('검토', 'Check')}</th><th>{L('조항', 'Clause')}</th><th>{L('식·치수', 'Detail')}</th>
                <th>φRn</th><th>{L('소요', 'Dem.')}</th><th>DCR</th><th>{L('판정', 'Res.')}</th>
              </tr></thead>
              <tbody>
                {groups[g].map((c, i) => (
                  <tr key={i} className={c.ok === false ? 'ag-row-ng' : ''}>
                    <td><Glyph k={glyphKey(c)} /></td>
                    <td className="ag-lb">{labelT(c.id, c.label, lang)}{c.note ? <em> · {trA(c.note, lang)}</em> : ''}</td>
                    <td className="ag-cl">{c.clause}</td>
                    <td className="ag-dt">{trA(c.detail, lang)}</td>
                    <td className="ag-num">{c.phiRn != null ? c.phiRn.toLocaleString() : '—'}</td>
                    <td className="ag-num">{c.demand != null ? c.demand.toLocaleString() : '—'}</td>
                    <td className="ag-num"><b>{c.dcr != null ? c.dcr.toFixed(2) : '—'}</b></td>
                    <td className={c.ok === false ? 'ag-ng' : c.ok ? 'ag-ok' : ''}>{c.ok == null ? '—' : c.ok ? 'OK' : 'NG'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <p className="note">{L('※ 편람 표준배치를 입력으로 AISC 360-16 전 한계상태(플랜지 FB/FP/FI/FM · 웨브 WB/WR/WP/WI/WM)를 검토 후, DCR>1.0 항목을 강재 중량 최소 방향(첨판두께·볼트·웨브첨판 표준증분)으로 자동 최소화한 결과. 블록전단은 요소별 Case A/B/C/D를 하중분담(tributary)으로 판정한 최소지배. 부재 F13·D2·전단항복 초과는 소요를 부재강도로 캡핑(부분강도접합).',
          '※ KBC standard layout is checked against all AISC 360-16 limit states (flange FB/FP/FI/FM, web WB/WR/WP/WI/WM), then DCR>1.0 items are auto-minimized toward least steel weight (plate-thickness / bolt increments). Block shear evaluates element cases A/B/C/D by tributary load. Member F13/D2/shear-yield overstress caps demand to member strength (partial-strength splice).')}</p>
      </div>
    </div>
  );
}
