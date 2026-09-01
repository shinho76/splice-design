// SC(전단판) 요약계산서 — AiscCalcReport.tsx(GS)와 동일한 형식·포맷(그림+그룹별 표+메타).
import type { DesignCondition } from '../engine/types.ts';
import type { ShearResult } from '../engine/shear/singlePlate.ts';
import type { AiscCheck } from '../engine/aisc/types.ts';
import { sectionByName } from '../engine/sections.ts';
import { useLang, tJoint } from '../i18n.ts';
import { groupTS, labelTS, trS } from './shearI18n.ts';
import { stdLabel, stdLabelLong } from '../engine/std.ts';

// 검토 대상 부위 글리프(육안 확인용) — AiscCalcReport.tsx와 동일한 그림 소스, SC 조항으로 재매핑.
function glyphKey(c: AiscCheck): string {
  const q = c.clause;
  if (q === 'J3.6') return 'boltshear';
  if (q === 'J3.8') return 'slip';
  if (q === 'J3.10') return 'bearing';
  if (q === 'J4.3') return 'yield';       // 판 전단항복
  if (q === 'J4.4') return 'rupture';     // 판 전단파단
  if (q === 'F11') return 'yield';        // 판 휨항복
  if (q === 'J4.2') return 'rupture';     // 판 휨파단(순단면)
  if (q === 'J4.5') return 'block';       // 판 블록전단
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
      {k === 'block' && <><path d={P} className="ag-steel" /><path d="M8,10 L52,10 L52,30 L8,30" className="ag-b" fill="none" /><path d="M8,10 L52,10 M8,30 L52,30" className="ag-r" fill="none" /><line x1="8" y1="10" x2="8" y2="30" className="ag-b" />{holes}</>}
      {k === 'slip' && <><rect x="2" y="12" width="56" height="16" className="ag-steel" /><circle cx="20" cy="20" r="3.4" className="ag-hole" /><circle cx="40" cy="20" r="3.4" className="ag-hole" /></>}
    </svg>
  );
}

export default function ShearCalcReport({ r, cond, onClose }: { r: ShearResult; cond: DesignCondition; onClose: () => void }) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const pct = Math.round(cond.strengthRatio * 100);

  const order: string[] = [];
  const groups: Record<string, AiscCheck[]> = {};
  for (const c of r.checks) { if (!groups[c.group]) order.push(c.group); (groups[c.group] ??= []).push(c); }

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card doc aisc" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="tool-btn" onClick={() => window.print()}>🖨 {L('PDF 저장', 'Save PDF')}</button>
          <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
        </div>

        <div className="doc-head">
          <div className="doc-kicker">{stdLabelLong(cond.designStd)} · LRFD · {L('전단판 접합 전 한계상태 검토(2면전단)', 'SHEAR TAB — ALL LIMIT STATES (DOUBLE SHEAR)')}</div>
          <h2>{stdLabel(cond.designStd)} {L('전단판 접합 계산서', 'Shear Tab Calculation')}</h2>
          <table className="doc-meta"><tbody>
            <tr><th>{L('부재 / 접합', 'Member / Joint')}</th><td>{r.section} · {tJoint(cond.jointType, lang)} · α{pct}%</td><th>{L('나사조건', 'Thread')}</th><td>{cond.threadCond ?? 'N'}</td></tr>
            <tr><th>{L('강종(H/판)', 'Steel H/PL')}</th><td>{cond.steel} / {cond.plateSteel ?? cond.steel} · {L('볼트', 'Bolt')} {cond.bolt}</td><th>{L('소요전단 Vu', 'Shear Vu')}</th><td>{r.V_kN.toLocaleString()} kN</td></tr>
            <tr><th>{L('설계기준', 'Basis')}</th><td colSpan={3}>{stdLabelLong(cond.designStd)} · {L('φ(항복1.0·파단/전단/지압0.75)', 'φ (yield 1.0, rupture/shear/bearing 0.75)')} · {L('2면전단(양측판)·편심 볼트군(탄성벡터법)', 'double shear (2 plates) · eccentric bolt group (elastic-vector)')}</td></tr>
          </tbody></table>
        </div>

        <div className="doc-body">
        {/* 배치 요약 */}
        <section className="doc-sec">
          <h3><span className="sec-no">1.</span>{L('배치 요약', 'Layout summary')}</h3>
          <table className="result-table2"><tbody>
            <tr><th>{L('전단판(양측)', 'Plate (both sides)')}</th><td>2-PL {r.plate.t}×{r.plate.L}×{r.plate.w} · {L('볼트', 'Bolt')} {r.NC}×{r.NR}-M{r.boltDia} ({r.boltCount}{L('본', 'ea')})</td></tr>
            <tr><th>{L('편심', 'Eccentricity')}</th><td>e,bolt={r.eBolt}mm(C계수용) · e,plate={r.ePlate}mm(M=V·e) · {r.config}</td></tr>
            <tr><th>{L('웨브 순높이', 'Web clear height')}</th><td>T={r.clearH}mm{!r.fitsWeb && <span className="ag-ng"> · {L('판 춤 초과 — 부적합', 'plate exceeds T — not fitting')}</span>}</td></tr>
            <tr><th>{L('고력볼트', 'H.S. bolts')}</th><td>M{r.boltDia} L{r.boltLen}({L('그립', 'grip')} {r.boltGrip}mm) · {r.boltCount}{L('본', 'ea')} · {r.boltTotalKg} kg</td></tr>
            <tr><th>{L('지배 검토', 'Governing')}</th><td>{r.govId} · DCR <b className={r.ok ? 'ag-ok' : 'ag-ng'}>{r.govDcr.toFixed(2)}</b> {r.ok ? 'OK' : 'NG'}</td></tr>
          </tbody></table>
        </section>

        {/* 검토 항목 (그룹별, 그림 포함) */}
        {order.map((g, gi) => (
          <section key={g} className="doc-sec">
            <h3><span className="sec-no">{gi + 2}.</span>{groupTS(g, lang).replace(/^[A-Z]\.\s*/, '')}</h3>
            <table className="ag-table">
              <thead><tr>
                <th>{L('그림', 'Fig')}</th><th>{L('검토', 'Check')}</th><th>{L('조항', 'Clause')}</th><th>{L('식·치수', 'Detail')}</th>
                <th>φRn</th><th>{L('소요', 'Dem.')}</th><th>DCR</th><th>{L('판정', 'Res.')}</th>
              </tr></thead>
              <tbody>
                {groups[g].map((c, i) => (
                  <tr key={i} className={c.ok === false ? 'ag-row-ng' : ''}>
                    <td><Glyph k={glyphKey(c)} /></td>
                    <td className="ag-lb">{labelTS(c.id, c.label, lang)}{c.note ? <em> · {trS(c.note, lang)}</em> : ''}</td>
                    <td className="ag-cl">{c.clause}</td>
                    <td className="ag-dt">{trS(c.detail, lang)}</td>
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
        <p className="note">{L('※ 전단판(양측 2매, 2면전단) 기준으로 AISC 360-16 전 한계상태(볼트 A·지압찢김 B·전단판 C·보 웨브 D)를 검토한 결과. 볼트군은 지지면 편심 offset(a)에 따른 편심 볼트군(탄성벡터법 C계수)으로 산정. 원자료(Thornton Tomasetti "Single Plate Capacity")의 단전단(1매) 검토항목을 2면전단(양측판)으로 확장.',
          '※ Checked against all AISC 360-16 limit states (bolts A, bearing/tear-out B, plate C, beam web D) for a double-shear (2-plate) shear tab. The bolt group is eccentric (elastic-vector C-factor) due to the support-face offset (a). Extends the source sheet\'s (Thornton Tomasetti "Single Plate Capacity") single-shear items to double shear (2 plates).')}</p>
        </div>
      </div>
    </div>
  );
}
