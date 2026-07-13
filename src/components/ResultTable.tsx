import type { DesignCondition, DesignResult, Plate, BoltArray } from '../engine/types.ts';
import { SECTIONS } from '../engine/sections.ts';
import { designConnection } from '../engine/engine.ts';
import { nominalOf, unitWeightOf } from '../engine/hbeam_catalog.ts';

const nf = (v?: number) => v == null ? '' : v.toLocaleString('en-US');   // 1000+ 콤마
const fmtPlate = (p?: Plate) => p ? `${p.t}×${nf(p.w)}×${nf(p.L)}` : null;
const fmtBolt = (b: BoltArray) => `${b.m}×${b.n % 1 ? b.n.toFixed(1) : b.n}`;
const fmtW = (w: number) => w.toLocaleString('en-US');                   // 단위무게

export default function ResultTable({ cond, onSelect }: {
  cond: DesignCondition; onSelect: (r: DesignResult) => void;
}) {
  const rows = SECTIONS.map(s => ({ s, r: designConnection(cond, s) }));
  const isCol = cond.member === '기둥';

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
            <th rowSpan={2} className="col-name g-info">단면치수</th>
            <th rowSpan={2} className="g-info">r<br /><span className="unit">mm</span></th>
            <th rowSpan={2} className="gcol g-info">단위중량<br /><span className="unit">kg/m</span></th>
            <th colSpan={2} className="gcol g-str">설계강도</th>
            <th rowSpan={2} className="gcol g-bolt">볼트<br />d<sub>b</sub></th>
            <th colSpan={5} className="gcol g-fl">플랜지</th>
            <th colSpan={3} className="gcol g-web">웨브</th>
          </tr>
          <tr>
            <th>{isCol ? '압축강도' : '휨모멘트'}<br />kN{isCol ? '' : '·m'}</th>
            <th className="gcol">{isCol ? '웨브압축' : '전단력'}<br />kN</th>
            <th>볼트열<br />m×n</th>
            <th>g₁</th>
            <th className="gcol">g₂</th>
            <th>외첨판</th>
            <th className="gcol">내첨판<br /><span className="unit">t×폭×길이</span></th>
            <th>볼트열<br />m×n</th>
            <th>P<sub>c</sub></th>
            <th>첨판<br /><span className="unit">t×춤×너비</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, r }, i) => {
            const nominal = nominalOf(s.H, s.B);
            const newSeries = i === 0 || nominal !== nominalOf(rows[i - 1].s.H, rows[i - 1].s.B);
            const inner = fmtPlate(r.flange.innerPlate);
            return (
              <tr key={r.section} onClick={() => onSelect(r)} className={newSeries ? 'series-top' : ''}>
                <td className="col-name">{r.section}</td>
                <td>{s.r}</td>
                <td className="gcol">{fmtW(unitWeightOf(s))}</td>
                <td>{nf(isCol ? r.Puf_kN : r.Mu_kNm)}</td>
                <td className="gcol">{nf(r.Vu_kN)}</td>
                <td className="gcol">{r.boltDia}</td>
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
