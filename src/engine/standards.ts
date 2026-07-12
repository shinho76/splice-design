// 표준화 규칙 — 제3장 (표 3.1, 3.2, 3.3, 5.1) + 배치 상수
// 근거: docs/01_설계조건_표준화방안_1-4장.md §3, docs/02 §5.4
import type { BoltName } from './types';

// [표 3.1] 플랜지 첨판 두께 표준 (mm)
export const FLANGE_PLATE_T = [9, 12, 16, 19, 22, 25, 28];
// [표 3.2] 웨브 첨판 두께 표준 (mm)
export const WEB_PLATE_T = [6, 9, 12, 14, 16, 19];

// 피치 (3.2.1 / 3.2.2)
export const PITCH_ALIGNED = 60; // 정렬배치 응력방향 피치
export const PITCH_STAGGERED = 45; // 엇모배치
export const WEB_PITCH_OPTIONS = [60, 90, 120]; // 웨브 상하방향 피치 Pc

/** 표준 공칭폭 집합 */
export const NOMINAL_WIDTHS = [100, 125, 150, 175, 200, 250, 300, 350, 400] as const;

/** 실제 플랜지폭 B → 표준 공칭폭 (최근접) */
export function nominalWidth(B: number): number {
  return NOMINAL_WIDTHS.reduce((best, w) =>
    Math.abs(w - B) < Math.abs(best - B) ? w : best, NOMINAL_WIDTHS[0]);
}

/**
 * [표 3.3 + 표 5.1] 플랜지 이음 표준: 공칭폭 → 볼트규격·열수·배치·게이지·첨판폭
 * outerW = 공칭폭. innerW = null 이면 외첨판만(폭이 좁은 경우).
 * 부록 I(보 100% SHN490 F10T 1/4·2/4)로 전 항목 교차검증 완료.
 */
export interface FlangeStd {
  bolt: BoltName;
  m: number;                  // 볼트 열수
  layout: '정렬' | '엇모';
  g1: number;
  g2: number | null;
  outerW: number;
  innerW: number | null;
}
export const FLANGE_STD: Record<number, FlangeStd> = {
  100: { bolt: 'M16', m: 2, layout: '정렬', g1: 56,  g2: null, outerW: 100, innerW: null },
  125: { bolt: 'M16', m: 2, layout: '정렬', g1: 75,  g2: null, outerW: 125, innerW: null },
  150: { bolt: 'M20', m: 2, layout: '정렬', g1: 90,  g2: null, outerW: 150, innerW: 60 },
  175: { bolt: 'M20', m: 2, layout: '정렬', g1: 105, g2: null, outerW: 175, innerW: 70 },
  200: { bolt: 'M20', m: 2, layout: '정렬', g1: 120, g2: null, outerW: 200, innerW: 80 },
  250: { bolt: 'M20', m: 2, layout: '정렬', g1: 150, g2: null, outerW: 250, innerW: 100 },
  300: { bolt: 'M22', m: 4, layout: '엇모', g1: 130, g2: 50,   outerW: 300, innerW: 120 },
  350: { bolt: 'M22', m: 4, layout: '정렬', g1: 140, g2: 70,   outerW: 350, innerW: 140 },
  400: { bolt: 'M22', m: 4, layout: '정렬', g1: 150, g2: 85,   outerW: 400, innerW: 165 },
};

/** 플랜지폭으로부터 표준 플랜지 이음 규칙 */
export function flangeStdFor(B: number): FlangeStd {
  return FLANGE_STD[nominalWidth(B)];
}

/** 표준 두께 series에서 값 이상인 최소 표준두께로 올림 */
export function roundUpThickness(t: number, series: number[]): number {
  for (const s of series) if (s >= t - 1e-9) return s;
  return series[series.length - 1];
}
