// Excel(.xlsx) 물량 출력 — SheetJS. 부재별 물량표 + 집계.
import * as XLSX from 'xlsx';
import type { Quantity } from './quantity.ts';
import { aggregate } from './quantity.ts';

const plateCell = (q: Quantity, role: string) => {
  const p = q.plates.find(x => x.role.includes(role));
  return p ? `${p.t}×${p.w}×${p.L} ×${p.count}매` : '';
};

export function downloadXlsx(qs: Quantity[], title: string, filename: string) {
  const head = ['단면치수', '볼트', '볼트개수', '플랜지볼트 L', '웨브볼트 L', '볼트중량(kg)', '플랜지 외첨판', '플랜지 내첨판', '웨브 첨판', '첨판중량(kg)'];
  const rows = qs.map(q => [q.section, q.bolts[0].name, q.boltCount,
    `L${q.boltSpec.flange.length}×${q.boltSpec.flange.count}`, `L${q.boltSpec.web.length}×${q.boltSpec.web.count}`, q.boltWeightKg,
    plateCell(q, '외첨판'), plateCell(q, '내첨판'), plateCell(q, '웨브'), q.plateWeightKg]);
  const agg = aggregate(qs);
  const boltSummary = Object.entries(agg.boltByName).map(([k, v]) => `${k}:${v}`).join(' / ');
  const aoa: (string | number)[][] = [
    [title + '  (볼트중량 KS B 1010)'], [], head, ...rows, [],
    ['합계', boltSummary, agg.totalBolts, '', '', agg.boltWeightKg, '', '', '', agg.plateWeightKg],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 9 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 12 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '물량산정');
  XLSX.writeFile(wb, filename);
}
