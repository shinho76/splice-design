import type { DesignCondition } from '../engine/types.ts';
import { SECTIONS } from '../engine/sections.ts';
import { designConnection } from '../engine/engine.ts';
import { quantityOf, aggregate, quantityCsv } from '../engine/quantity.ts';
import { downloadFile } from '../engine/dxf.ts';
import { downloadXlsx } from '../engine/xlsxOut.ts';

const nf = (v: number) => v.toLocaleString('en-US');
const plateStr = (q: ReturnType<typeof quantityOf>, role: string) => {
  const p = q.plates.find(x => x.role.includes(role));
  return p ? `${p.t}×${p.w}×${p.L} ×${p.count}` : '—';
};

export default function QuantityPanel({ cond, onClose }: { cond: DesignCondition; onClose: () => void }) {
  const qs = SECTIONS.map(s => quantityOf(designConnection(cond, s), cond));
  const agg = aggregate(qs);
  const stem = `물량_${cond.member}_${Math.round(cond.strengthRatio * 100)}_${cond.steel}_${cond.bolt}_${cond.jointType}`;
  const title = `물량산정 · ${cond.member} ${Math.round(cond.strengthRatio * 100)}% ${cond.steel} ${cond.bolt} ${cond.jointType}`;
  const csv = () => downloadFile(`${stem}.csv`, quantityCsv(qs, cond), 'text/csv;charset=utf-8');
  const xlsx = () => downloadXlsx(qs, title, `${stem}.xlsx`);

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card qty-card" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="tool-btn" onClick={xlsx}>⬇ Excel</button>
          <button className="tool-btn" onClick={csv}>⬇ CSV</button>
          <button className="tool-btn" onClick={() => window.print()}>🖨 인쇄</button>
          <button className="close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <h2>물량산정</h2>
        <p className="cond-line">
          {cond.member} · {cond.jointType}접합 · α = {Math.round(cond.strengthRatio * 100)}% · {cond.steel} · {cond.bolt}
          <span className="qty-badge">총 볼트 {nf(agg.totalBolts)}개 · 첨판 {nf(agg.totalWeightKg)} kg</span>
        </p>
        <div className="tablewrap">
          <table className="design-table qty-table">
            <thead>
              <tr>
                <th className="col-name gcol">단면치수</th>
                <th className="gcol">볼트</th>
                <th className="gcol">개수</th>
                <th>플랜지 외첨판</th>
                <th>플랜지 내첨판</th>
                <th className="gcol">웨브 첨판</th>
                <th>첨판중량(kg)</th>
              </tr>
            </thead>
            <tbody>
              {qs.map((q, i) => (
                <tr key={q.section} className={i > 0 && Math.floor(SECTIONS[i].H / 50) !== Math.floor(SECTIONS[i - 1].H / 50) ? 'series-top' : ''}>
                  <td className="col-name gcol">{q.section}</td>
                  <td className="gcol">{q.bolts[0].name}</td>
                  <td className="gcol">{q.boltCount}</td>
                  <td>{plateStr(q, '외첨판')}</td>
                  <td>{plateStr(q, '내첨판')}</td>
                  <td className="gcol">{plateStr(q, '웨브')}</td>
                  <td>{nf(q.plateWeightKg)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="qty-total">
                <td className="col-name gcol">합계 ({qs.length}종)</td>
                <td className="gcol" colSpan={2}>{Object.entries(agg.boltByName).map(([k, v]) => `${k} ${nf(v)}`).join(' / ')}</td>
                <td colSpan={3}></td>
                <td>{nf(agg.totalWeightKg)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="note">※ 첨판 중량 = 부피 × 7,850 kg/m³. 외첨판 2매·내첨판 4매·웨브첨판 2매/부재 기준. 볼트 = 플랜지(열×행×4) + 웨브(열×행×2).</p>
      </div>
    </div>
  );
}
