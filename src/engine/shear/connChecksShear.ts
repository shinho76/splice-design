// SC(전단판) 접합부 계측·간섭 검토 — 3D 뷰어용. connChecks.ts(GS)와 동일한 목적·방식의 SC 전용판.
//   좌표계는 connPartsShear와 동일(X=웨브 관통축/판두께 방향, Y=춤(행), Z=지지면→열). 값은 최종 확정 수치에서 산출.
//   GS와 달리 SC는 플랜지 이음판이 없으므로 region은 'web' 하나뿐이다(플랜지 칩 없음 — 없는 부재를 만들지 않음).
import type { ShearResult } from './singlePlate.ts';
import { sectionByName } from '../sections.ts';

export type ShearDimRegion = 'web';
export interface ShearDimAnno { label: string; a: [number, number, number]; b: [number, number, number]; region: ShearDimRegion; }
export interface ShearCheckItem { label: string; value: string; limit: string; ok: boolean; note?: string; }
export interface ShearConnChecks { dims: ShearDimAnno[]; checks: ShearCheckItem[]; db: number; }

// AISC 기준(근사·호칭경 mm) — connChecks.ts(GS)와 동일 표
const AISC_EDGE: Record<number, number> = { 16: 22, 20: 26, 22: 28, 24: 30, 27: 34, 30: 38 };
const AISC_WRENCH: Record<number, number> = { 16: 30, 20: 35, 22: 38, 24: 42, 27: 47, 30: 52 };

export function connChecksShear(r: ShearResult): ShearConnChecks {
  const sec = sectionByName(r.section);
  const H = sec?.H ?? 0, tw = sec?.tw ?? 0, tf = sec?.tf ?? 0, fr = sec?.r ?? 0;
  const filletToe = sec?.k1 ?? (tw / 2 + fr);
  const db = r.boltDia;
  const { NC, NR, Pc, a, sh, Lev, Leh, plate } = r;

  const colZ = NC === 2 ? [a, a + sh] : [a];
  const rowY = Array.from({ length: NR }, (_, i) => (i - (NR - 1) / 2) * Pc);
  const rnd = (n: number) => Math.round(n);

  const dims: ShearDimAnno[] = [];
  const Wd = (o: Omit<ShearDimAnno, 'region'>): ShearDimAnno => ({ ...o, region: 'web' });
  const OUT = 15;
  const xP = tw / 2 + plate.t + OUT;              // 판 바깥면 살짝 띄운 치수선 X

  dims.push(Wd({ label: `전단판 L=${plate.L}`, a: [xP, -plate.L / 2, 0], b: [xP, plate.L / 2, 0] }));
  if (NR > 1) dims.push(Wd({ label: `Pc=${Pc}`, a: [xP, rowY[0], 0], b: [xP, rowY[1], 0] }));
  dims.push(Wd({ label: `연단 ${Lev}`, a: [xP, rowY[rowY.length - 1], 0], b: [xP, plate.L / 2, 0] }));
  dims.push(Wd({ label: `연단 ${Lev}`, a: [xP, rowY[0], 0], b: [xP, -plate.L / 2, 0] }));
  dims.push(Wd({ label: `전단판폭 ${plate.w}`, a: [xP, -plate.L / 2 - OUT, 0], b: [xP, -plate.L / 2 - OUT, plate.w] }));
  dims.push(Wd({ label: `a=${a}`, a: [xP, plate.L / 2 + OUT, 0], b: [xP, plate.L / 2 + OUT, a] }));
  if (NC === 2) dims.push(Wd({ label: `sh=${sh}`, a: [xP, plate.L / 2 + OUT, a], b: [xP, plate.L / 2 + OUT, a + sh] }));
  dims.push(Wd({ label: `연단(원단) ${Leh}`, a: [xP, plate.L / 2 + OUT, colZ[colZ.length - 1]], b: [xP, plate.L / 2 + OUT, plate.w] }));
  dims.push(Wd({ label: `판두께 ${plate.t}×2`, a: [tw / 2, -plate.L / 2 - OUT * 2, 0], b: [tw / 2 + plate.t, -plate.L / 2 - OUT * 2, 0] }));

  const checks: ShearCheckItem[] = [];
  const yn = (ok: boolean) => ok;
  // 1) 볼트 수직피치 ≥ AISC 최소(2.667·db)
  if (NR > 1) checks.push({ label: '전단판 볼트 피치', value: `${Pc}mm`, limit: `≥ ${(2.667 * db).toFixed(0)} (3d=${3 * db})`, ok: yn(Pc >= 2.667 * db) });
  // 2) 연단거리(상하) ≥ AISC J3.4M
  checks.push({ label: '연단거리(수직, 볼트→판끝)', value: `${Lev}mm`, limit: `≥ ${AISC_EDGE[db] ?? '—'}`, ok: yn(Lev >= (AISC_EDGE[db] ?? 0)) });
  // 3) 연단거리(수평, 원단열→판끝)
  checks.push({ label: '연단거리(수평, 원단열→판끝)', value: `${Leh}mm`, limit: `≥ ${AISC_EDGE[db] ?? '—'}`, ok: yn(Leh >= (AISC_EDGE[db] ?? 0)) });
  // 4) 최외곽 볼트열 ↔ 플랜지 필렛 여유(조임 소켓여유)
  const clearH = H - 2 * tf - 2 * fr;
  const rowMax = rowY.length ? Math.max(...rowY.map(v => Math.abs(v))) : 0;
  const wrenchClr = clearH / 2 - rowMax;
  checks.push({ label: '조임 소켓여유(최외곽볼트→플랜지 필렛)', value: `${wrenchClr.toFixed(1)}mm`, limit: `≥ ${AISC_WRENCH[db] ?? '—'} (AISC 7-16)`, ok: yn(wrenchClr >= (AISC_WRENCH[db] ?? 0)), note: wrenchClr < (AISC_WRENCH[db] ?? 0) ? '임팩트렌치 진입 간섭 우려' : '' });
  // 5) 필렛 끝단 ↔ 볼트(근접열) 여유(참고 — 웨브 폭 방향 간섭 없음, 판이 웨브면 부착이라 통상 여유 충분)
  checks.push({ label: '전단판 크기(참고)', value: `2-PL ${plate.t}×${plate.L}×${plate.w}`, limit: '참고', ok: true });

  return { dims, checks, db };
}
