// KBC-09 한계상태별 DCR(소요/설계강도 비) — 최종 설계결과에서 역산.
// engine.ts의 수용력 공식(boltCap·boltStrength·플랜지첨판 항복·웨브첨판)과 동일하게 재현하여
// 설계가 만족시킨 각 한계상태의 여유(DCR≤1)를 정량화한다. AISC의 aiscCheck와 대응.
import type { DesignCondition, DesignResult, BoltName } from './types.ts';
import { Fy, BOLT_MAT, Fu as FuSteel } from './materials.ts';
import { PHI_FLEX, PHI_BEAR, designSlipStrength_kN, BOLT_HOLE, Ab } from './bolts.ts';
import { sectionByName } from './sections.ts';

export interface KbcCheckItem {
  id: string; group: string; label: string;
  demand: number; capacity: number; dcr: number; unit: string; ref: string;
}
export interface KbcCheckResult { govDcr: number | null; items: KbcCheckItem[]; govId?: string; }

const boltNameOf = (d: number) => ('M' + d) as BoltName;

// boltCap(engine) 재현 — 플랜지 볼트 연단부 rn1 / 중간부 rn2 (kN)
function flangeBoltCap(cond: DesignCondition, bolt: BoltName, Ns: number, tMember: number, tPlate: number, fuM: number, fuP: number, pitch: number) {
  if (cond.jointType === '마찰') {
    const s = designSlipStrength_kN(cond.bolt, bolt, Ns);
    return { rn1: s, rn2: s, uniform: true };
  }
  const d = BOLT_HOLE[bolt].dia, hole = BOLT_HOLE[bolt].hole;
  const boltShear = 0.5 * BOLT_MAT[cond.bolt].Fu * Ab[bolt] * Ns;
  const Lc1 = 40 - hole / 2, Lc2 = pitch - hole;
  const bear = (t: number, Lc: number, fu: number) => Math.min(1.2 * Lc * t * fu, 2.4 * d * t * fu);
  const rn1 = Math.min(boltShear, bear(tMember, Lc1, fuM), bear(tPlate, Lc1, fuP));
  const rn2 = Math.min(boltShear, bear(tMember, Lc2, fuM), bear(tPlate, Lc2, fuP));
  return { rn1: PHI_BEAR * rn1 / 1e3, rn2: PHI_BEAR * rn2 / 1e3, uniform: false };
}
// boltStrength(engine) 재현 — 웨브 볼트 1개(2면) 설계강도 (kN)
function webBoltCap(cond: DesignCondition, bolt: BoltName, tw: number, fu: number): number {
  if (cond.jointType === '마찰') return designSlipStrength_kN(cond.bolt, bolt, 2);
  const d = BOLT_HOLE[bolt].dia, hole = BOLT_HOLE[bolt].hole;
  const boltShear = 0.5 * BOLT_MAT[cond.bolt].Fu * Ab[bolt] * 2;
  const bearing = Math.min(1.2 * (60 - hole) * tw * fu, 2.4 * d * tw * fu);
  return PHI_BEAR * Math.min(boltShear, bearing) / 1e3;
}

/** KBC-09 최종설계의 검토항목별 DCR. AISC가 아닐 때 사용. */
export function kbcCheck(r: DesignResult, cond: DesignCondition): KbcCheckResult {
  const sec = sectionByName(r.section);
  if (!sec) return { govDcr: null, items: [] };
  const fy = Fy(cond.steel, sec.tf), fu = FuSteel(cond.steel);
  const pGrade = cond.plateSteel ?? cond.steel;
  const pfy = Fy(pGrade, sec.tf), pfu = FuSteel(pGrade);
  const bearing = cond.jointType === '지압';
  const bolt = boltNameOf(r.boltDia);
  const outer = r.flange.outerPlate, inner = r.flange.innerPlate, webPl = r.web.webPlate;
  const fB = r.flange.bolt, wB = r.web.bolt;
  const Puf = r.Puf_kN, Vw = r.Vu_kN;   // 웨브 소요력(보=Vu·기둥=Pauw)은 Vu_kN에 저장
  const isCol = cond.member === '기둥';

  const items: KbcCheckItem[] = [];
  const add = (id: string, group: string, label: string, demand: number, capacity: number, ref: string, unit = 'kN') =>
    capacity > 0 && items.push({ id, group, label, demand, capacity, dcr: demand / capacity, unit, ref });

  // 다) 플랜지 볼트
  const Ns = inner ? 2 : 1;
  const pitchEff = r.flange.staggered ? 90 : (r.flange.pitch ?? 60);
  const tPlate = (outer?.t ?? 0) + (inner?.t ?? 0);
  const cap = flangeBoltCap(cond, bolt, Ns, sec.tf, tPlate, fu, pfu, pitchEff);
  const nBoltCap = cap.uniform ? fB.m * fB.n * cap.rn1 : fB.m * (cap.rn1 + (fB.n - 1) * cap.rn2);
  add('KFB', '플랜지 볼트', bearing ? '플랜지 볼트 지압·전단' : '플랜지 볼트 미끄럼', Puf, nBoltCap, bearing ? '6.4' : '5.4');

  // 나) 플랜지 첨판 항복(외/내) — 내첨판 유무에 따라 소요 분담(외 50% / 내측 페어 50%)
  const shareOuter = inner ? 0.5 : 1.0;
  if (outer) add('KOP', '외첨판', '외첨판 인장항복', shareOuter * Puf, PHI_FLEX * pfy * outer.t * outer.w / 1e3, '5.3');
  if (inner) add('KIP', '내첨판', '내첨판 인장항복(2장)', 0.5 * Puf, PHI_FLEX * pfy * 2 * inner.t * inner.w / 1e3, '5.3');

  // 바) 웨브 볼트
  const phiRnW = webBoltCap(cond, bolt, sec.tw, fu);
  add('KWB', '웨브 볼트', bearing ? '웨브 볼트 지압·전단' : '웨브 볼트 미끄럼', Vw, wB.m * wB.n * phiRnW, bearing ? '6.8' : '5.7');

  // 바) 웨브 첨판(2장) — 보=전단항복(0.6Fy)·기둥=압축항복(Fy)
  const nomFactor = isCol ? 1.0 : 0.6;
  if (webPl) add('KWP', '웨브 첨판', isCol ? '웨브 첨판 압축항복(2장)' : '웨브 첨판 전단항복(2장)', Vw, 2 * PHI_FLEX * nomFactor * pfy * webPl.t * webPl.w / 1e3, isCol ? '7.6' : '5.6');

  if (!items.length) return { govDcr: null, items: [] };
  const gov = items.reduce((a, b) => (b.dcr > a.dcr ? b : a));
  return { govDcr: gov.dcr, govId: gov.id, items };
}
