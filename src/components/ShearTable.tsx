import { useMemo, Fragment } from 'react';
import type { DesignCondition } from '../engine/types.ts';
import { catalogForCond, ksUsedHB } from '../engine/standard/schedule.ts';
import { ksClassOf, ksClassLabel, ksLabelOf } from '../engine/standard/ksData.ts';
import { nominalOf, unitWeightOf } from '../engine/hbeam_catalog.ts';
import { designSinglePlate, type ShearResult } from '../engine/shear/singlePlate.ts';
import { useLang } from '../i18n.ts';

const nf = (v: number) => v.toLocaleString('en-US');
const fmtW = (w: number) => w.toLocaleString('en-US');

export default function ShearTable({ cond, onSelect, onView3D, selectedSection }: {
  cond: DesignCondition;
  onSelect: (r: ShearResult) => void;
  onView3D: (r: ShearResult) => void;
  selectedSection?: string;
}) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const isK = cond.mode === 'K';   // SC는 항상 K모드 고정 — KS 라벨·계열 밴드 표시

  const rows = useMemo(() => {
    const secs = catalogForCond(cond);
    return secs.map((s, i) => ({ s, i, r: designSinglePlate(cond, s) }));
  }, [cond]);

  const results = rows.map(x => x.r);
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
        <div className="tablewrap">
          <table className="design-table shear-table">
            <colgroup>
              {isK && <col style={{ width: 78 }} />}
              <col style={{ width: 150 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 60 }} />
              <col style={{ width: 44 }} />
              <col style={{ width: 44 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 44 }} />
              <col style={{ width: 44 }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <thead>
              <tr>
                {isK && <th rowSpan={2} className="g-info" style={{ textAlign: 'center' }}>KS<br /><span className="unit">LABEL</span></th>}
                <th rowSpan={2} className="col-name g-info">{L('단면치수', 'Section')}</th>
                <th rowSpan={2} className="gcol g-info">{L('단위중량', 'Unit wt')}<br /><span className="unit">kg/m</span></th>
                <th rowSpan={2} className="gcol g-str">{L('설계강도', 'Design Strength')}<br />{L('전단력', 'Shear')} <span className="unit">kN</span></th>
                <th rowSpan={2} className="gcol g-info">{L('볼트재질', 'Bolt Grade')}</th>
                <th rowSpan={2} className="gcol g-bolt">{L('볼트', 'Bolt')}<br />d<sub>b</sub></th>
                <th rowSpan={2} className="g-info dcr-h">DCR</th>
                <th colSpan={3} className="gcol g-web">{L('웨브', 'Web')}</th>
                <th rowSpan={2}>{L('지배', 'Gov')}</th>
                <th rowSpan={2} className="gcol">{L('판정', 'Check')}</th>
                <th rowSpan={2}>{L('구분', 'Config')}</th>
              </tr>
              <tr>
                <th>{L('볼트열', 'Bolts')}<br />m×n</th>
                <th>P<sub>c</sub></th>
                <th className="gcol">{L('이음판', 'Plate')}<br /><span className="unit">{L('t×춤×너비', 't×d×w')}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ s, r }, idx) => {
                const nominal = nominalOf(s.H, s.B);
                const newSeries = idx === 0 || nominal !== nominalOf(rows[idx - 1].s.H, rows[idx - 1].s.B);
                const sel = r.section === selectedSection;
                const cls = isK ? ksClassOf(s.name) : undefined;
                const prevCls = isK && idx > 0 ? ksClassOf(rows[idx - 1].s.name) : undefined;
                const showBand = !!cls && cls !== prevCls;
                const ksLabel = isK ? ksLabelOf(s.name) : undefined;
                const labelFirst = isK && ksLabel !== (idx > 0 ? ksLabelOf(rows[idx - 1].s.name) : undefined);
                let labelSpan = 1;
                if (labelFirst) for (let j = idx + 1; j < rows.length && ksLabelOf(rows[j].s.name) === ksLabel; j++) labelSpan++;
                return (
                  <Fragment key={r.section}>
                  {showBand && (
                    <tr className="cls-band">
                      <td colSpan={isK ? 13 : 12} style={{ fontWeight: 800, textAlign: 'left', padding: '5px 10px', fontSize: '11.5px', letterSpacing: '0.4px', background: 'rgba(127,127,127,0.16)' }}>
                        {ksClassLabel(cls!)}
                      </td>
                    </tr>
                  )}
                  <tr onClick={() => onSelect(r)} className={`${newSeries ? 'series-top' : ''}${sel ? ' row-sel' : ''}`} style={{ cursor: 'pointer' }}>
                    {isK && labelFirst && (
                      <td rowSpan={labelSpan} className="ks-label" style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 500, background: 'rgba(127,127,127,0.06)', borderRight: '0.5px solid var(--border, #ccc)' }}>
                        {ksLabel}
                      </td>
                    )}
                    <td className="col-name">
                      <span className={`st-dot${!r.ok ? ' ng' : ''}`} title={r.ok ? L('적합', 'OK') : L('재검토', 'Review')} />
                      <button className="cn-txt" style={{ fontWeight: ksUsedHB(s.H, s.B) ? 800 : 400 }}
                        title={ksUsedHB(s.H, s.B) ? `${r.section} · S·H 표준 채택단면` : (s.label ? `${s.label} · ${r.section}` : L('선택 + 3D 형상 보기', 'Select + view 3D shape'))}
                        onClick={e => { e.stopPropagation(); onSelect(r); onView3D(r); }}>
                        {s.label
                          ? <span className="cn-two"><span className="cn-nom">{s.label}</span><span className="cn-mm">{r.section}</span></span>
                          : r.section}
                      </button>
                    </td>
                    <td className="gcol">{fmtW(unitWeightOf(s))}</td>
                    <td className="gcol">{nf(r.V_kN)}</td>
                    <td className="gcol">{cond.bolt}</td>
                    <td className="gcol">{r.boltName}</td>
                    <td className={`dcr-cell${r.govDcr > 1.0 ? ' ng' : ''}`}>{r.govDcr.toFixed(2)}</td>
                    <td>{r.NC}×{r.NR}</td>
                    <td>{r.Pc}</td>
                    <td className="gcol">{r.plate.t}×{r.plate.L}×{r.plate.w}{!r.fitsWeb && <span className="sc-flag" title={`판 춤 ${r.plate.L} > 웨브 T ${r.clearH}`}>▲</span>}</td>
                    <td><span className="gov-id">{r.govId}</span></td>
                    <td className={'gcol' + (r.ok ? ' ok' : ' ng')}>{r.ok ? 'OK' : (r.fitsWeb ? 'NG' : L('판>T', 'PL>T'))}</td>
                    <td><small>{r.config === 'Extended' ? L('확장', 'Ext') : L('일반', 'Conv')}</small></td>
                  </tr>
                  </Fragment>
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
