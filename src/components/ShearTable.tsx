import { useMemo } from 'react';
import type { DesignCondition } from '../engine/types.ts';
import { sectionByName } from '../engine/sections.ts';
import { catalogForCond } from '../engine/standard/schedule.ts';
import { designSinglePlate, type ShearResult } from '../engine/shear/singlePlate.ts';
import { useLang } from '../i18n.ts';

const nf = (v: number) => v.toLocaleString('en-US');

export default function ShearTable({ cond, onSelect, selectedSection }: {
  cond: DesignCondition;
  onSelect: (r: ShearResult) => void;
  selectedSection?: string;
}) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);

  const results = useMemo(() => {
    const secs = catalogForCond(cond);
    return secs.map(s => designSinglePlate(cond, s));
  }, [cond]);

  const ok = results.filter(r => r.ok).length;

  return (
    <>
      <div className="kpi-strip">
        <div className="kpi k1"><span className="k">{L('검토 부재', 'Members')}</span> <span className="v num">{results.length}</span> <span className="d">{L('단일판 전단접합', 'Single-plate shear')}</span></div>
        <div className="kpi k2"><span className="k">{L('적합', 'Pass')}</span> <span className="v num ok">{ok}</span> <span className="d ok">{results.length ? Math.round(ok / results.length * 100) : 0}%</span> <span className="k">{L('부적합', 'Fail')}</span> <span className="v num ng">{results.length - ok}</span></div>
        <div className="kpi k3"><span className="k">{L('볼트', 'Bolts')}</span> <span className="v num">{cond.bolt}</span> <span className="d">{L('편심 볼트군', 'Eccentric group')}</span></div>
        <div className="kpi k4"><span className="k">{L('기준', 'Std')}</span> <span className="v num">AISC 360-16</span></div>
      </div>

      <div className="cgrid">
        <div className="dt-wrap">
          <table className="design-table shear-table">
            <thead>
              <tr>
                <th className="col-name">{L('단면', 'Section')}</th>
                <th>{L('소요전단 V', 'Vu')}<br /><small>kN</small></th>
                <th>{L('볼트', 'Bolt')}</th>
                <th>{L('열×행', 'NC×NR')}</th>
                <th>{L('전단판 PL', 'Plate')}<br /><small>t×L×w</small></th>
                <th>{L('지배', 'Gov')}</th>
                <th>MAX<br />DCR</th>
                <th>{L('판정', 'Check')}</th>
                <th>{L('구분', 'Config')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => {
                const sel = r.section === selectedSection;
                return (
                  <tr key={r.section} className={sel ? 'row-sel' : ''} onClick={() => onSelect(r)} style={{ cursor: 'pointer' }}>
                    <td className="col-name">{sectionByName(r.section)?.label ?? r.section}</td>
                    <td className="num">{nf(r.V_kN)}</td>
                    <td>{r.boltName}</td>
                    <td className="num">{r.NC}×{r.NR}</td>
                    <td className="num">PL-{r.plate.t}×{r.plate.L}×{r.plate.w}{!r.fitsWeb && <span className="sc-flag" title={`판 춤 ${r.plate.L} > 웨브 T ${r.clearH}`}>▲</span>}</td>
                    <td><span className="gov-id">{r.govId}</span></td>
                    <td className={'num dcr ' + (r.govDcr <= 1 ? 'ok' : 'ng')}>{r.govDcr.toFixed(2)}</td>
                    <td className={r.ok ? 'ok' : 'ng'}>{r.ok ? 'OK' : (r.fitsWeb ? 'NG' : L('판>T', 'PL>T'))}</td>
                    <td><small>{r.config === 'Extended' ? L('확장', 'Ext') : L('일반', 'Conv')}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="sc-legend">{L(
        '▲ 판>T = 소요전단(웨브전단 85% 발현, 기존 splice와 동일 기준)이 커서 전단판 춤이 보 웨브 순높이(T)를 초과 → 단일판 전단탭으로는 부적합, 대체접합(양면앵글·모멘트접합) 또는 α 하향 검토. 소요를 실제 반력으로 낮추려면 좌측 α(강도비)를 조정하세요.',
        '▲ PL>T = required shear (85% web-shear, same basis as the splice app) is large enough that the plate depth exceeds the beam web clear height T → not suitable as a single-plate shear tab; consider an alternative (double angle / moment) or lower α. Reduce demand to the real reaction via the α (strength ratio) on the left.')}</p>
    </>
  );
}
