import type { DesignCondition } from '../engine/types.ts';
import { catalogForCond, applyStdPlates, isStdMode } from '../engine/standard/schedule.ts';
import { ksClassOf, ksClassLabel, ksLabelOf } from '../engine/standard/ksData.ts';
import { usesLimitState } from '../engine/std.ts';
import { unitWeightOf } from '../engine/hbeam_catalog.ts';
import { designConnection } from '../engine/engine.ts';
import { quantityOf, aggregate, quantityCsv } from '../engine/quantity.ts';
import { downloadFile } from '../engine/dxf.ts';
import { downloadXlsx, type XlsxRow } from '../engine/xlsxOut.ts';
import { aiscCheck, aiscAutoCorrect } from '../engine/aisc/compat.ts';
import { kbcCheck } from '../engine/kbcCheck.ts';
import { useLang, tMember, tJoint } from '../i18n.ts';

const nf = (v: number) => v.toLocaleString('en-US');
const plateStr = (q: ReturnType<typeof quantityOf>, role: string) => {
  const p = q.plates.find(x => x.role.includes(role));
  return p ? `${p.t}×${p.w}×${p.L} ×${p.count}` : '—';
};
const fmtBolt = (b: { m: number; n: number }) => `${b.m}×${b.n % 1 ? b.n.toFixed(1) : b.n}`;

export default function QuantityPanel({ cond, onClose, diaAt, autoFix }: { cond: DesignCondition; onClose: () => void; diaAt?: (i: number) => number | undefined; autoFix?: boolean }) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const isAisc = usesLimitState(cond.designStd);
  const af = isAisc && !!autoFix;
  const isCol = cond.member === '기둥';
  const isK = cond.mode === 'K';
  const clsShort = (c?: 'WIDE' | 'MIDDLE' | 'NARROW') =>
    c === 'WIDE' ? L('광폭', 'Wide') : c === 'MIDDLE' ? L('중폭', 'Middle') : c === 'NARROW' ? L('세폭', 'Narrow') : undefined;
  // 메인 결과표(ResultTable)와 동일한 산정 로직 — 표준모드 판 고정·자동보정·DCR까지 일치시켜 XLS에 반영.
  const secs = catalogForCond(cond);
  const qs: XlsxRow[] = secs.map((s, i) => {
    let r = designConnection(cond, s, diaAt?.(i));
    if (isStdMode(cond.mode) && !af) r = applyStdPlates(r, cond);
    const ac = af ? aiscAutoCorrect(r, cond) : null;
    const dr = ac ? ac.result : r;
    const govDcr = ac ? ac.report.govDcr : (isAisc ? aiscCheck(r, cond).govDcr : kbcCheck(r, cond).govDcr);
    const partial = ac && ac.memberLimited ? Math.min(ac.flangeScale, ac.webScale) : null;
    const q = quantityOf(dr, cond);
    return {
      ...q,
      ksLabel: isK ? ksLabelOf(s.name) : undefined,
      clsLabel: isK ? clsShort(ksClassOf(s.name)) : undefined,
      dcr: govDcr,
      partialPct: partial != null ? Math.round(partial * 100) : undefined,
      rMm: s.r,
      unitWeightKgM: unitWeightOf(s),
      demand1: isCol ? dr.Puf_kN : dr.Mu_kNm,
      demand1Label: isCol ? L('압축강도(kN)', 'Compression (kN)') : L('휨모멘트(kN·m)', 'Moment (kN·m)'),
      demand2: dr.Vu_kN,
      demand2Label: isCol ? L('웨브압축(kN)', 'Web comp. (kN)') : L('전단력(kN)', 'Shear (kN)'),
      boltDia: dr.boltDia,
      flangeArr: fmtBolt(dr.flange.bolt),
      g1: dr.flange.gauge?.g1,
      g2: dr.flange.gauge?.g2,
      webArr: fmtBolt(dr.web.bolt),
      pc: dr.web.Pc,
    };
  });
  const agg = aggregate(qs);
  const stem = `${L('물량', 'qty')}_${cond.member}_${Math.round(cond.strengthRatio * 100)}_${cond.steel}_${cond.bolt}_${cond.jointType}`;
  const title = `${L('물량산정', 'Quantities')} · ${tMember(cond.member, lang)} ${Math.round(cond.strengthRatio * 100)}% ${cond.steel} ${cond.bolt} ${tJoint(cond.jointType, lang)}`;
  const csv = () => downloadFile(`${stem}.csv`, quantityCsv(qs, cond), 'text/csv;charset=utf-8');
  const xlsx = () => downloadXlsx(qs, title, `${stem}.xlsx`, isK);

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
          <span className="qty-badge">{L('볼트', 'Bolts')} {nf(agg.totalBolts)}{L('개', ' ea')} · {nf(agg.boltWeightKg)} kg · {L('이음판', 'Plates')} {nf(agg.plateWeightKg)} kg</span>
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
                <th>{L('플랜지 외부 이음판', 'Flange outer PL')}</th>
                <th>{L('플랜지 내부 이음판', 'Flange inner PL')}</th>
                <th className="gcol">{L('웨브 이음판', 'Web PL')}</th>
                <th>{L('이음판중량(kg)', 'Plate wt (kg)')}</th>
              </tr>
            </thead>
            <tbody>
              {qs.map((q, i) => (
                <tr key={q.section} className={i > 0 && Math.floor(secs[i].H / 50) !== Math.floor(secs[i - 1].H / 50) ? 'series-top' : ''}>
                  <td className="col-name gcol">{q.section}</td>
                  <td className="gcol">{q.bolts[0].name}</td>
                  <td className="gcol">{q.boltCount}</td>
                  <td>L{q.boltSpec.flange.length}/{q.boltSpec.web.length}</td>
                  <td className="gcol">{nf(q.boltWeightKg)}</td>
                  <td>{plateStr(q, '외부 이음판')}</td>
                  <td>{plateStr(q, '내부 이음판')}</td>
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
          : <>※ 이음판 중량 = 부피 × 7,850 kg/m³. 외부 이음판 2매·내부 이음판 4매·웨브 이음판 2매/부재 기준. 볼트 = 플랜지(열×행×4) + 웨브(열×행×2).
            볼트 표준길이 = 조임두께(그립) + 부가길이 → 5mm 올림, 세트중량(볼트+너트+와셔2매)은 <b>KS B 1010</b> 기반(F/W = 플랜지/웨브 길이).</>}</p>
      </div>
    </div>
  );
}
