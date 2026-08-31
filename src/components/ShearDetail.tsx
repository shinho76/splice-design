import type { DesignCondition } from '../engine/types.ts';
import { sectionByName } from '../engine/sections.ts';
import type { ShearResult, ScSubtype } from '../engine/shear/singlePlate.ts';
import { useLang } from '../i18n.ts';

const SUBTYPE_LABEL: Record<ScSubtype, [string, string]> = {
  'beam-beam': ['보-보', 'Beam-Beam'],
  'beam-col-strong': ['보-기둥 강축', 'Beam-Col (Strong Axis)'],
  'beam-col-weak': ['보-기둥 약축', 'Beam-Col (Weak Axis)'],
};

export default function ShearDetail({ r, cond, onClose }: {
  r: ShearResult; cond: DesignCondition; onClose: () => void;
}) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const label = sectionByName(r.section)?.label ?? r.section;
  const [subKo, subEn] = SUBTYPE_LABEL[r.subtype];

  // 그룹별 묶기
  const groups = [...new Set(r.checks.map(c => c.group))];

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card sd-card" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
        </div>
        <h2>{L('단일판 전단접합 검토', 'Single-Plate Shear Connection')} — {label} <span className="qty-badge">{L(subKo, subEn)}</span></h2>
        <p className="cond-line">
          {L('소요전단', 'Vu')} <b>{r.V_kN} kN</b>
          <span className="qty-badge">
            {r.boltName} · NR={r.NR} · PL-{r.plate.t}×{r.plate.L}×{r.plate.w} · e,bolt={r.eBolt}mm · e,plate={r.ePlate}mm · {r.config} · MAX DCR {r.govDcr.toFixed(2)} ({r.govId})
          </span>
        </p>
        <p className="sd-warn">{L(
          `▲ 용접설계(지지부 필릿용접) 및 컬럼측 면외 항복선 검토는 본 버전에 미포함 — 원자료(Thornton Tomasetti "Single Plate Capacity" 시트)에도 해당 항목이 없어 근거 없이 추가하지 않았다. 판 중심선-웨브 중심선 편심에 의한 지지 요소 면외 우력은 별도 검토 필요.`,
          `▲ Weld design (support-side fillet weld) and column-side out-of-plane yield-line checks are not included in this version — the source sheet (Thornton Tomasetti "Single Plate Capacity") does not cover them either, so nothing was added without a verified basis. The out-of-plane couple from the plate/web centerline offset on the supporting element still needs separate review.`)}</p>

        {!r.fitsWeb && (
          <p className="sd-warn">{L(
            `▲ 판 춤 ${r.plate.L}mm > 보 웨브 순높이 T ${r.clearH}mm — 소요(웨브전단 85% 발현)가 커서 단일판 전단탭 부적합. 대체접합 또는 α 하향 검토.`,
            `▲ Plate depth ${r.plate.L} mm > beam web clear height T ${r.clearH} mm — required shear too large for a single-plate tab. Use an alternative connection or lower α.`)}</p>
        )}
        {groups.map(g => (
          <div key={g} className="sd-group">
            <div className="sd-gh">{g}</div>
            <table className="design-table sd-table">
              <thead>
                <tr>
                  <th>ID</th><th>{L('한계상태', 'Limit state')}</th><th>{L('조항', 'Clause')}</th>
                  <th>φRn</th><th>{L('소요', 'Demand')}</th><th>DCR</th><th></th>
                </tr>
              </thead>
              <tbody>
                {r.checks.filter(c => c.group === g).map(c => (
                  <tr key={c.id} className={(c.dcr ?? 0) > 1 ? 'sd-ng' : ''}>
                    <td><b>{c.id}</b></td>
                    <td>{c.label}<div className="sd-detail">{c.detail}</div></td>
                    <td>{c.clause}</td>
                    <td className="num">{c.phiRn}<small> {c.unit}</small></td>
                    <td className="num">{c.demand}<small> {c.unit}</small></td>
                    <td className={'num dcr ' + ((c.dcr ?? 0) <= 1 ? 'ok' : 'ng')}>{(c.dcr ?? 0).toFixed(2)}</td>
                    <td className={(c.dcr ?? 0) <= 1 ? 'ok' : 'ng'}>{(c.dcr ?? 0) <= 1 ? 'OK' : 'NG'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <p className="sd-note">{L(
          '※ 소요전단 V = α·φv·0.6·Fy·(H·tw) — 보 웨브 전단강도의 α배 발현(기존 splice 앱과 동일 기준). 판두께는 볼트 연성지배 확보를 위해 db/2+1.6mm 이하로 고정, 볼트 행수(NR)를 자동 증가시켜 전 한계상태 DCR≤1을 만족.',
          '※ Vu = α·φv·0.6·Fy·(H·tw) — develops α× beam web shear (same basis as the splice app). Plate thickness capped at db/2+1.6 mm for bolt ductility; bolt rows (NR) auto-increased until all DCR ≤ 1.')}</p>
      </div>
    </div>
  );
}
