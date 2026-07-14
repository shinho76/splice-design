// 재료 상수 — 제1장 재료 (표 1.2, 표 1.4)
// 근거: docs/01_설계조건_표준화방안_1-4장.md §1
import type { SteelGrade, BoltGrade } from './types';

export const E = 200_000; // 강재 탄성계수 (MPa)

/** 강종별 설계기준강도 (MPa). Fy는 판두께 구간별. */
interface SteelSpec {
  Fy_le40: number;  // 두께 ≤ 40mm
  Fy_gt40: number;  // 40 < 두께 ≤ 100mm
  Fu: number;       // 두께 ≤ 100mm
}

// [표 1.2] 주요 구조용 강재의 강도 (MPa)
export const STEEL: Record<SteelGrade, SteelSpec> = {
  SS400:  { Fy_le40: 235, Fy_gt40: 215, Fu: 400 },
  SM490:  { Fy_le40: 325, Fy_gt40: 295, Fu: 490 },
  SN490:  { Fy_le40: 325, Fy_gt40: 295, Fu: 490 }, // SN490B,C
  SHN490: { Fy_le40: 325, Fy_gt40: 295, Fu: 490 },
  SM520:  { Fy_le40: 355, Fy_gt40: 325, Fu: 520 },
  SM570:  { Fy_le40: 420, Fy_gt40: 420, Fu: 570 },
  // ASTM (MPa 환산): A36=36ksi/58ksi, A572-50·A992=50ksi/65ksi
  A36:    { Fy_le40: 250, Fy_gt40: 250, Fu: 400 },
  A572:   { Fy_le40: 345, Fy_gt40: 345, Fu: 450 }, // Gr.50
  A992:   { Fy_le40: 345, Fy_gt40: 345, Fu: 450 }, // W형강 표준
};

/** 판두께에 따른 설계기준항복강도 Fy (MPa) */
export function Fy(steel: SteelGrade, thickness_mm: number): number {
  const s = STEEL[steel];
  return thickness_mm <= 40 ? s.Fy_le40 : s.Fy_gt40;
}
export function Fu(steel: SteelGrade): number {
  return STEEL[steel].Fu;
}

// [표 1.4] 고력볼트 재료강도 (MPa)
export const BOLT_MAT: Record<BoltGrade, { Fy: number; Fu: number }> = {
  F10T: { Fy: 900,  Fu: 1000 },
  F13T: { Fy: 1170, Fu: 1300 },
  S10T: { Fy: 900,  Fu: 1000 }, // 국내 토크전단형(F10T 상당)
  A325: { Fy: 660,  Fu: 830 },  // ASTM A325(≈120ksi)
  A490: { Fy: 900,  Fu: 1040 }, // ASTM A490(≈150ksi)
};
