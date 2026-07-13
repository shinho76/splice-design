// 물량산정 — 부재별 볼트 개수·중량(KS B 1010)·첨판 물량(중량). 강재비중 7,850 kg/m³.
import type { DesignResult, DesignCondition, Plate } from './types.ts';
import { boltSpecOf, type BoltSpec } from './bolt_spec.ts';

const RHO = 7.85e-6; // kg/mm³ (7,850 kg/m³)

export interface PlateItem { role: string; t: number; w: number; L: number; count: number; unitKg: number; weightKg: number; }
export interface BoltItem { name: string; count: number; }
export interface Quantity {
  section: string; plates: PlateItem[]; bolts: BoltItem[];
  plateWeightKg: number; boltCount: number;
  boltSpec: BoltSpec;      // 플랜지·웨브 표준길이·세트중량
  boltWeightKg: number;    // 볼트 총중량(볼트+너트+와셔2매)
}

function plateItem(role: string, p: Plate, count: number): PlateItem {
  const unitKg = p.t * p.w * p.L * RHO;
  return { role, t: p.t, w: p.w, L: p.L, count, unitKg: +unitKg.toFixed(2), weightKg: +(unitKg * count).toFixed(2) };
}

/** 부재 1개(이음 1개소)의 물량 */
export function quantityOf(r: DesignResult, cond: DesignCondition): Quantity {
  const plates: PlateItem[] = [];
  if (r.flange.outerPlate) plates.push(plateItem('플랜지 외첨판', r.flange.outerPlate, 2));       // 상·하 플랜지 2매
  if (r.flange.innerPlate) plates.push(plateItem('플랜지 내첨판', r.flange.innerPlate, 4));       // 상·하 × 좌우 4매
  if (r.web.webPlate) plates.push(plateItem('웨브 첨판', r.web.webPlate, 2));                     // 양면 2매

  const nF = Math.round(r.flange.bolt.n);
  const flangeBolts = r.flange.bolt.m * nF * 4;                 // 열×행 × (좌우2)×(상하플랜지2)
  const webBolts = r.web.bolt.m * r.web.bolt.n * 2;             // 열×행 × 좌우2
  const boltName = `${cond.bolt}-M${r.boltDia}`;
  const boltCount = flangeBolts + webBolts;
  const boltSpec = boltSpecOf(r);

  return {
    section: r.section,
    plates,
    bolts: [{ name: boltName, count: boltCount }],
    plateWeightKg: +plates.reduce((s, p) => s + p.weightKg, 0).toFixed(2),
    boltCount,
    boltSpec,
    boltWeightKg: boltSpec.totalKg,
  };
}

/** 여러 부재 집계 */
export function aggregate(qs: Quantity[]) {
  const boltByName: Record<string, number> = {};
  let totalWeightKg = 0, totalBolts = 0, boltWeightKg = 0;
  for (const q of qs) {
    for (const b of q.bolts) boltByName[b.name] = (boltByName[b.name] ?? 0) + b.count;
    totalWeightKg += q.plateWeightKg;
    totalBolts += q.boltCount;
    boltWeightKg += q.boltWeightKg;
  }
  return {
    boltByName, totalBolts,
    plateWeightKg: +totalWeightKg.toFixed(1),
    boltWeightKg: +boltWeightKg.toFixed(1),
    totalWeightKg: +(totalWeightKg + boltWeightKg).toFixed(1), // 첨판+볼트
  };
}

/** 물량표 CSV (부재별 볼트 본수·표준길이·중량 + 첨판중량) */
export function quantityCsv(qs: Quantity[], cond: DesignCondition): string {
  const head = ['단면치수', '볼트', '볼트개수', '플랜지볼트(L)', '웨브볼트(L)', '볼트중량(kg)', '외첨판', '내첨판', '웨브첨판', '첨판중량(kg)'];
  const rows = qs.map(q => {
    const f = (role: string) => { const p = q.plates.find(x => x.role.includes(role)); return p ? `${p.t}×${p.w}×${p.L}×${p.count}매` : '—'; };
    const bf = q.boltSpec.flange, bw = q.boltSpec.web;
    return [q.section, q.bolts[0].name, String(q.boltCount),
      `L${bf.length}×${bf.count}본`, `L${bw.length}×${bw.count}본`, String(q.boltWeightKg),
      f('외첨판'), f('내첨판'), f('웨브'), String(q.plateWeightKg)];
  });
  const agg = aggregate(qs);
  const bolts = Object.entries(agg.boltByName).map(([k, v]) => `${k}:${v}`).join(' / ');
  const footer = ['합계', bolts, String(agg.totalBolts), '', '', String(agg.boltWeightKg), '', '', '', String(agg.plateWeightKg)];
  const title = `# 물량산정 · ${cond.member} ${Math.round(cond.strengthRatio * 100)}% ${cond.steel} ${cond.bolt} ${cond.jointType}  (볼트중량 KS B 1010)`;
  return '﻿' + [title, head.join(','), ...rows.map(r => r.join(',')), footer.join(',')].join('\n');
}
