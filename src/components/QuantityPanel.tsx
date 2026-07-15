import type { DesignCondition } from '../engine/types.ts';
import { SECTIONS } from '../engine/sections.ts';
import { designConnection } from '../engine/engine.ts';
import { quantityOf, aggregate, quantityCsv } from '../engine/quantity.ts';
import { downloadFile } from '../engine/dxf.ts';
import { downloadXlsx } from '../engine/xlsxOut.ts';
import { useLang, tMember, tJoint } from '../i18n.ts';

const nf = (v: number) => v.toLocaleString('en-US');
const plateStr = (q: ReturnType<typeof quantityOf>, role: string) => {
  const p = q.plates.find(x => x.role.includes(role));
  return p ? `${p.t}×${p.w}×${p.L} ×${p.count}` : '—';
};

export default function QuantityPanel({ cond, onClose, diaAt }: { cond: DesignCondition; onClose: () => void; diaAt?: (i: number) => number | undefined }) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const qs = SECTIONS.map((s, i) => quantityOf(designConnection(cond, s, diaAt?.(i)), cond));
  const agg = aggregate(qs);
  const stem = `${L('물량', 'qty')}_${cond.member}_${Math.round(cond.strengthRatio * 100)}_${cond.steel}_${cond.bolt}_${cond.jointType}`;
  const title = `${L('물량산정', 'Quantities')} · ${tMember(cond.member, lang)} ${Math.round(cond.strengthRatio * 100)}% ${cond.steel} ${cond.bolt} ${tJoint(cond.jointType, lang)}`;
  const csv = () => downloadFile(`${stem}.csv`, quantityCsv(qs, cond), 'text/csv;charset=utf-8');
  const xlsx = () => downloadXlsx(qs, title, `${stem}.xlsx`);

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card qty-card" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="tool-btn" onClick={xlsx}>⬇ Excel</button>
          <button className="tool-btn" onClick={csv}>⬇ CSV</button>
          <button className="tool-btn" onClick={() => window.print()}>🖨 {L('인쇄', 'Print')}</button>
          <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
        </div>
        <h2>{L('물량산정', 'Quantity Takeoff')}</h2>
        <p className="cond-line">
          {tMember(cond.member, lang)} · {tJoint(cond.jointType, lang)} · α = {Math.round(cond.strengthRatio * 100)}% · {cond.steel} · {cond.bolt}
          <span className="qty-badge">{L('볼트', 'Bolts')} {nf(agg.totalBolts)}{L('개', ' ea')} · {nf(agg.boltWeightKg)} kg · {L('첨판', 'Plates')} {nf(agg.plateWeightKg)} kg</span>
        </p>
        <div className="tablewrap">
          <table className="design-table qty-table">
            <thead>
              <tr>
                <th className="col-name gcol">{L('단면치수', 'Section')}</th>
                <th className="gcol">{L('볼트', 'Bolt')}</th>
                <th className="gcol">{L('개수', 'Qty')}</th>
                <th>{L('볼트길이 F/W', 'Bolt L F/W')}</th>
                <th className="gcol">{L('볼트중량(kg)', 'Bolt wt (kg)')}</th>
                <th>{L('플랜지 외첨판', 'Flange outer PL')}</th>
                <th>{L('플랜지 내첨판', 'Flange inner PL')}</th>
                <th className="gcol">{L('웨브 첨판', 'Web PL')}</th>
                <th>{L('첨판중량(kg)', 'Plate wt (kg)')}</th>
              </tr>
            </thead>
            <tbody>
              {qs.map((q, i) => (
                <tr key={q.section} className={i > 0 && Math.floor(SECTIONS[i].H / 50) !== Math.floor(SECTIONS[i - 1].H / 50) ? 'series-top' : ''}>
                  <td className="col-name gcol">{q.section}</td>
                  <td className="gcol">{q.bolts[0].name}</td>
                  <td className="gcol">{q.boltCount}</td>
                  <td>L{q.boltSpec.flange.length}/{q.boltSpec.web.length}</td>
                  <td className="gcol">{nf(q.boltWeightKg)}</td>
                  <td>{plateStr(q, '외첨판')}</td>
                  <td>{plateStr(q, '내첨판')}</td>
                  <td className="gcol">{plateStr(q, '웨브')}</td>
                  <td>{nf(q.plateWeightKg)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="qty-total">
                <td className="col-name gcol">{L('합계', 'Total')} ({qs.length}{L('종', '')})</td>
                <td className="gcol" colSpan={2}>{Object.entries(agg.boltByName).map(([k, v]) => `${k} ${nf(v)}`).join(' / ')}</td>
                <td></td>
                <td className="gcol">{nf(agg.boltWeightKg)}</td>
                <td colSpan={3}></td>
                <td>{nf(agg.plateWeightKg)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="note">{lang === 'en'
          ? <>※ Plate weight = volume × 7,850 kg/m³. Per member: outer PL ×2, inner PL ×4, web PL ×2. Bolts = flange(cols×rows×4) + web(cols×rows×2).
            Standard bolt length = grip + add-on → rounded up to 5mm; set weight (bolt+nut+2 washers) per <b>KS B 1010</b> (F/W = flange/web length).</>
          : <>※ 첨판 중량 = 부피 × 7,850 kg/m³. 외첨판 2매·내첨판 4매·웨브첨판 2매/부재 기준. 볼트 = 플랜지(열×행×4) + 웨브(열×행×2).
            볼트 표준길이 = 조임두께(그립) + 부가길이 → 5mm 올림, 세트중량(볼트+너트+와셔2매)은 <b>KS B 1010</b> 기반(F/W = 플랜지/웨브 길이).</>}</p>
      </div>
    </div>
  );
}
