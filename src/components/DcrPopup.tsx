// DCR 팝업 — 테이블 DCR 클릭 시 검토항목별 DCR(소요/설계강도) 표시. 최고 DCR 시각 강조.
// KBC-09(kbcCheck)·AISC360-16(aiscCheck) 공용.
import type { DesignResult, DesignCondition } from '../engine/types.ts';
import { aiscRun } from '../engine/aisc/run.ts';
import { kbcCheck } from '../engine/kbcCheck.ts';
import { usesLimitState, stdLabel } from '../engine/std.ts';
import { useLang } from '../i18n.ts';

interface Row { id: string; group: string; label: string; demand: number; capacity: number; dcr: number; unit: string; ref: string; }

// fScale·wScale: 최적화(부분강도)가 소요에 적용한 캡핑 배율. 테이블과 동일 기준으로 표시(≤1.0).
export default function DcrPopup({ r, cond, fScale = 1, wScale = 1, onClose }: { r: DesignResult; cond: DesignCondition; fScale?: number; wScale?: number; onClose: () => void }) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const isAisc = usesLimitState(cond.designStd);   // AISC·KDS = 한계상태 엔진
  const partial = Math.min(fScale, wScale);        // 부분강도 발현비율(<1이면 부재지배)
  let rows: Row[] = [], govId = '', govDcr: number | null = null;
  if (isAisc) {
    // 테이블과 동일: 최적화 캡핑 소요 기준(전 항목 ≤1.0). 캡핑 없으면 전강도와 동일.
    const a = aiscRun(r, cond, { flangeScale: fScale, webScale: wScale });
    rows = a.checks.filter(c => c.dcr != null).map(c => ({ id: c.id, group: c.group, label: c.label, demand: c.demand ?? 0, capacity: c.phiRn ?? 0, dcr: c.dcr as number, unit: c.unit ?? 'kN', ref: c.clause }));
    govId = a.govId; govDcr = a.govDcr;
  } else {
    const k = kbcCheck(r, cond);
    rows = k.items.map(c => ({ id: c.id, group: c.group, label: c.label, demand: c.demand, capacity: c.capacity, dcr: c.dcr, unit: c.unit, ref: c.ref }));
    govId = k.govId ?? ''; govDcr = k.govDcr;
  }
  rows = rows.slice().sort((a, b) => b.dcr - a.dcr);   // DCR 내림차순
  const std = stdLabel(cond.designStd);

  return (
    <div className="dcr-back" onClick={onClose}>
      <div className="dcr-modal" onClick={e => e.stopPropagation()}>
        <div className="dcr-hd">
          <div>
            <b>{r.section}</b> · {std} · {L('검토항목별 DCR', 'DCR by limit state')}
            {govDcr != null && <span className={`dcr-gov-badge${govDcr > 1.0 ? ' ng' : ''}`}>{L('지배', 'Gov')} {govDcr.toFixed(2)}</span>}
            {partial < 0.999 && <span className="dcr-gov-badge partial" title={L('부재지배로 전강도의 이 비율만 발현 — 소요를 이 비율로 제한한 부분강도접합', 'member-governed: only this fraction of full strength develops — designed as partial strength')}>{L('부분강도', 'Partial')} {Math.round(partial * 100)}%</span>}
          </div>
          <button className="dcr-close" onClick={onClose} title={L('닫기', 'Close')}>✕</button>
        </div>
        <div className="dcr-bd">
          <table className="dcr-tbl">
            <thead>
              <tr>
                <th>{L('검토항목', 'Limit state')}</th>
                <th>{L('소요', 'Demand')}</th>
                <th>{L('설계강도', 'Capacity')}</th>
                <th>{L('조항', 'Ref')}</th>
                <th>DCR</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const gov = row.id === govId;
                const ng = row.dcr > 1.0;
                return (
                  <tr key={row.id} className={`${gov ? 'dcr-govrow' : ''}${ng ? ' dcr-ngrow' : ''}`}>
                    <td className="dcr-lab">{gov && <span className="dcr-star">▲</span>}{row.label}</td>
                    <td className="num">{row.demand.toLocaleString('en-US', { maximumFractionDigits: 1 })} {row.unit}</td>
                    <td className="num">{row.capacity.toLocaleString('en-US', { maximumFractionDigits: 1 })} {row.unit}</td>
                    <td className="dcr-ref">{row.ref}</td>
                    <td className={`num dcr-val${ng ? ' ng' : ''}${gov ? ' gov' : ''}`}>{row.dcr.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="dcr-note">{L('DCR = 소요강도 / 설계강도. 최고값(▲)이 접합부를 지배하며, 1.0 초과 시 재검토가 필요합니다.',
            'DCR = demand / design capacity. The maximum (▲) governs; values above 1.0 require review.')}
            {partial < 0.999 && L(` · 이 접합은 부재지배 부분강도(${Math.round(partial * 100)}%)로, 소요를 발현 가능 비율로 제한해 표시합니다(전강도 기준이면 1/비율≈${(1 / partial).toFixed(2)}배).`,
              ` · Partial-strength ${Math.round(partial * 100)}% (member-governed); demand shown is capped to the developable fraction.`)}</p>
        </div>
      </div>
    </div>
  );
}
