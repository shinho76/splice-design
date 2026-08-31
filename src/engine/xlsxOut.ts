// Excel(.xlsx) 물량 출력 — SheetJS. 부재별 물량표 + 집계 + 메인 결과표 정보(KS라벨·계열·DCR 등).
import * as XLSX from 'xlsx';
import type { Quantity } from './quantity.ts';
import { aggregate } from './quantity.ts';

export interface XlsxRow extends Quantity {
  ksLabel?: string; clsLabel?: string;                 // K모드: KS 호칭·계열(광폭/중폭/세폭)
  dcr?: number | null; partialPct?: number; rMm?: number; unitWeightKgM?: number;
  demand1?: number; demand1Label?: string;              // 모멘트/압축강도
  demand2?: number; demand2Label?: string;              // 전단력/웨브압축
  boltDia?: number;
  flangeArr?: string; g1?: number; g2?: number;
  webArr?: string; pc?: number;
}

const plateCell = (q: Quantity, role: string) => {
  const p = q.plates.find(x => x.role.includes(role));
  return p ? `${p.t}×${p.w}×${p.L} ×${p.count}매` : '';
};

export function downloadXlsx(rows: XlsxRow[], title: string, filename: string, isK: boolean) {
  const head = [
    ...(isK ? ['KS라벨', '계열'] : []),
    '단면치수', 'DCR', 'r(mm)', '단위중량(kg/m)', '최대강도비',
    rows[0]?.demand1Label ?? '설계강도', rows[0]?.demand2Label ?? '설계강도',
    '볼트', '볼트개수', '플랜지 볼트열(m×n)', 'g1', 'g2',
    '플랜지 외부 이음판', '플랜지 내부 이음판',
    '웨브 볼트열(m×n)', 'Pc', '웨브 이음판',
    '플랜지볼트 L', '웨브볼트 L', '볼트중량(kg)', '이음판중량(kg)',
  ];
  const rowsOut: (string | number)[][] = rows.map(q => [
    ...(isK ? [q.ksLabel ?? '', q.clsLabel ?? ''] : []),
    q.section,
    q.dcr != null ? +q.dcr.toFixed(2) : '',
    q.rMm ?? '',
    q.unitWeightKgM ?? '',
    q.partialPct != null ? `${q.partialPct}%` : '',
    q.demand1 ?? '', q.demand2 ?? '',
    q.bolts[0].name, q.boltCount,
    q.flangeArr ?? '', q.g1 ?? '', q.g2 ?? '',
    plateCell(q, '외부 이음판'), plateCell(q, '내부 이음판'),
    q.webArr ?? '', q.pc ?? '', plateCell(q, '웨브'),
    `L${q.boltSpec.flange.length}×${q.boltSpec.flange.count}`, `L${q.boltSpec.web.length}×${q.boltSpec.web.count}`,
    q.boltWeightKg, q.plateWeightKg,
  ]);
  const agg = aggregate(rows);
  const boltSummary = Object.entries(agg.boltByName).map(([k, v]) => `${k}:${v}`).join(' / ');
  const off = isK ? 2 : 0;
  const nCols = off + 21;
  const footer: (string | number)[] = new Array(nCols).fill('');
  footer[off + 0] = '합계';
  footer[off + 7] = boltSummary;
  footer[off + 8] = agg.totalBolts;
  footer[off + 19] = agg.boltWeightKg;
  footer[off + 20] = agg.plateWeightKg;

  const aoa: (string | number)[][] = [
    [title + '  (볼트중량 KS B 1010)'], [], head, ...rowsOut, [], footer,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wch = [
    ...(isK ? [10, 12] : []),
    20, 7, 6, 12, 10, 14, 14, 14, 9, 15, 6, 6, 18, 18, 15, 6, 16, 14, 14, 12, 12,
  ];
  ws['!cols'] = wch.map(w => ({ wch: w }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: nCols - 1 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '물량산정');
  XLSX.writeFile(wb, filename);
}
