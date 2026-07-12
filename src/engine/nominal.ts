// 공칭 휨/압축강도 — 제5장 5.2 / 제7장 7.2·7.6
// engine.ts(설계)와 sections.ts(단면성능 캘리브레이션)가 공유.
import { E } from './materials.ts';

export interface SectionGeom {
  H: number; B: number; tw: number; tf: number; r: number; Sx: number; Zx: number;
}

/** 플랜지 국부좌굴 공칭휨강도 Mn (kN·m) — 5.2.1 */
export function flangeLB_Mn(s: SectionGeom, fy: number): number {
  const Mp = fy * s.Zx;
  const My07 = 0.7 * fy * s.Sx;
  const lf = s.B / (2 * s.tf);
  const lpf = 0.38 * Math.sqrt(E / fy);
  const lrf = 1.0 * Math.sqrt(E / fy);   // 편람 기준 (9.1 예제와 일치)
  let Mn: number;
  if (lf <= lpf) Mn = Mp;
  else if (lf <= lrf) Mn = Mp - (Mp - My07) * (lf - lpf) / (lrf - lpf);
  else Mn = My07;
  return Mn / 1e6;
}

/** 웨브 국부좌굴 공칭휨강도 Mn (kN·m) — 5.2.2 */
export function webLB_Mn(s: SectionGeom, fy: number): number {
  const Mp = fy * s.Zx;
  const lw = (s.H - 2 * s.tf - 2 * s.r) / s.tw;
  const lpw = 3.76 * Math.sqrt(E / fy);
  const lrw = 5.70 * Math.sqrt(E / fy);
  let Mn: number;
  if (lw <= lpw) Mn = Mp;
  else if (lw <= lrw) Mn = Mp - (Mp - 0.7 * fy * s.Sx) * (lw - lpw) / (lrw - lpw);
  else Mn = 0.7 * fy * s.Sx;
  return Mn / 1e6;
}

/** 접합부 설계용 공칭휨강도 = 국부좌굴 최솟값 (kN·m) */
export function flexuralMn(s: SectionGeom, fy: number): number {
  return Math.min(flangeLB_Mn(s, fy), webLB_Mn(s, fy));
}
