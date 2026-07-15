import type { DesignCondition, DesignResult, Plate, BoltArray } from '../engine/types.ts';
import { SECTIONS } from '../engine/sections.ts';
import { designConnection } from '../engine/engine.ts';
import { aiscCheck } from '../engine/aiscCheck.ts';
import { nominalOf, unitWeightOf } from '../engine/hbeam_catalog.ts';
import { useLang } from '../i18n.ts';

const nf = (v?: number) => v == null ? '' : v.toLocaleString('en-US');   // 1000+ 콤마
const fmtPlate = (p?: Plate) => p ? `${p.t}×${nf(p.w)}×${nf(p.L)}` : null;
const fmtBolt = (b: BoltArray) => `${b.m}×${b.n % 1 ? b.n.toFixed(1) : b.n}`;
const fmtW = (w: number) => w.toLocaleString('en-US');                   // 단위무게

const DIAS = [16, 20, 22, 24];   // 사용 직경(표준구멍 d+2 자동 적용)

export default function ResultTable({ cond, onSelect, onView3D, custom, diaAt, onSetDia, selectedSection }: {
  cond: DesignCondition; onSelect: (r: DesignResult) => void; onView3D: (r: DesignResult) => void;
  custom?: boolean; diaAt?: (i: number) => number | undefined; onSetDia?: (i: number, d: number) => void;
  selectedSection?: string;
}) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const rows = SECTIONS.map((s, i) => ({ s, r: designConnection(cond, s, diaAt?.(i)) }));
  const isCol = cond.member === '기둥';
  const isAisc = cond.designStd === 'AISC';

  return (
    <div className="tablewrap">
      <table className="design-table">
        <colgroup>
          <col style={{ width: 158 }} /><col style={{ width: 46 }} /><col style={{ width: 78 }} />
          <col style={{ width: 84 }} /><col style={{ width: 84 }} />
          <col style={{ width: 54 }} />
          <col style={{ width: 64 }} /><col style={{ width: 50 }} /><col style={{ width: 50 }} />
          <col style={{ width: 130 }} /><col style={{ width: 130 }} />
          <col style={{ width: 64 }} /><col style={{ width: 50 }} /><col style={{ width: 130 }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2} className="col-name g-info">{L('단면치수', 'Section')}</th>
            <th rowSpan={2} className="g-info">r<br /><span className="unit">mm</span></th>
            <th rowSpan={2} className="gcol g-info">{L('단위중량', 'Unit wt')}<br /><span className="unit">kg/m</span></th>
            <th colSpan={2} className="gcol g-str">{L('설계강도', 'Design Strength')}</th>
            <th rowSpan={2} className="gcol g-bolt">{L('볼트', 'Bolt')}<br />d<sub>b</sub></th>
            <th colSpan={5} className="gcol g-fl">{L('플랜지', 'Flange')}</th>
            <th colSpan={3} className="gcol g-web">{L('웨브', 'Web')}</th>
          </tr>
          <tr>
            <th>{isCol ? L('압축강도', 'Compression') : L('휨모멘트', 'Moment')}<br />kN{isCol ? '' : '·m'}</th>
            <th className="gcol">{isCol ? L('웨브압축', 'Web comp.') : L('전단력', 'Shear')}<br />kN</th>
            <th>{L('볼트열', 'Bolts')}<br />m×n</th>
            <th>g₁</th>
            <th className="gcol">g₂</th>
            <th>{L('외첨판', 'Outer PL')}</th>
            <th className="gcol">{L('내첨판', 'Inner PL')}<br /><span className="unit">{L('t×폭×길이', 't×w×L')}</span></th>
            <th>{L('볼트열', 'Bolts')}<br />m×n</th>
            <th>P<sub>c</sub></th>
            <th>{L('첨판', 'Web PL')}<br /><span className="unit">{L('t×춤×너비', 't×d×w')}</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, r }, i) => {
            const nominal = nominalOf(s.H, s.B);
            const newSeries = i === 0 || nominal !== nominalOf(rows[i - 1].s.H, rows[i - 1].s.B);
            const inner = fmtPlate(r.flange.innerPlate);
            const aisc = isAisc ? aiscCheck(r, cond) : null;
            const ng = aisc ? !aisc.ok : r.steps.some(st => st.check === 'NG');
            const sel = r.section === selectedSection;
            return (
              <tr key={r.section} onClick={() => onSelect(r)} className={`${newSeries ? 'series-top' : ''}${sel ? ' row-sel' : ''}`}>
                <td className="col-name">
                  <span className={`st-dot${ng ? ' ng' : ''}`} title={ng ? '재검토' : '적합'} />
                  <span className="cn-txt">{r.section}</span>
                  {aisc && <span className={`ag-dcr${aisc.ok ? '' : ' ng'}`} title={L('AISC 지배 DCR(편람 배치)', 'AISC gov. DCR (KBC layout)')}>{aisc.govDcr.toFixed(2)}</span>}
                  <button className="t3d" title="3D 보기" onClick={e => { e.stopPropagation(); onView3D(r); }}>3D</button></td>
                <td>{s.r}</td>
                <td className="gcol">{fmtW(unitWeightOf(s))}</td>
                <td>{nf(isCol ? r.Puf_kN : r.Mu_kNm)}</td>
                <td className="gcol">{nf(r.Vu_kN)}</td>
                <td className="gcol">{custom
                  ? <select className="dia-sel" value={r.boltDia} onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); onSetDia?.(i, Number(e.target.value)); }}>
                      {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  : r.boltDia}</td>
                <td>{fmtBolt(r.flange.bolt)}</td>
                <td>{r.flange.gauge?.g1}</td>
                <td className="gcol">{r.flange.gauge?.g2 ?? <span className="dash">—</span>}</td>
                <td>{fmtPlate(r.flange.outerPlate)}</td>
                <td className="gcol">{inner ?? <span className="dash">—</span>}</td>
                <td>{fmtBolt(r.web.bolt)}</td>
                <td>{r.web.Pc ?? <span className="dash">—</span>}</td>
                <td>{fmtPlate(r.web.webPlate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
