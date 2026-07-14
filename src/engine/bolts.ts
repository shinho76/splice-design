// 볼트 상수 — 제2장 (표 1.5, 1.6, 1.7, 1.8)
// 근거: docs/01_설계조건_표준화방안_1-4장.md §2
import type { BoltGrade, BoltName, BoltDia } from './types';

// 강도저감계수
export const PHI_SLIP = 0.85;   // 마찰 미끄럼 (2.4)
export const PHI_BEAR = 0.75;   // 지압 볼트전단·구멍지압 (2.5, 2.6)
export const PHI_FLEX = 0.9;    // 휨 (5장)
export const PHI_COMP = 0.9;    // 압축 (7장)
export const PHI_SHEAR = 0.9;   // 전단 (5.6)

// 마찰접합 상수 (2.2, 2.4)
export const MU = 0.5;          // 미끄럼계수 (블라스트+무도장)
export const HSC = 1.0;         // 구멍계수 (표준구멍)

// [표 1.5] 볼트 구멍 지름 & 응력방향 중심거리  (M18·M24는 KS 공식 도출: hole=d+2)
export const BOLT_HOLE: Record<BoltName, { dia: number; hole: number; pitchStress: 60 }> = {
  M16: { dia: 16, hole: 18, pitchStress: 60 },
  M18: { dia: 18, hole: 20, pitchStress: 60 },
  M20: { dia: 20, hole: 22, pitchStress: 60 },
  M22: { dia: 22, hole: 24, pitchStress: 60 },
  M24: { dia: 24, hole: 26, pitchStress: 60 },
};
export const boltNameByDia: Record<BoltDia, BoltName> = { 16: 'M16', 18: 'M18', 20: 'M20', 22: 'M22', 24: 'M24' };

// 공칭단면적 Ab (mm²) = π/4·d²
export const Ab: Record<BoltName, number> = { M16: 201, M18: 254, M20: 314, M22: 380, M24: 452 };

// [표 1.6] 설계볼트장력 To (kN) = 0.7·Fu·0.75·Ab  (F10T 0.525·Ab / F13T 0.6825·Ab)  ※M18·M24 도출
export const To_kN: Record<BoltGrade, Record<BoltName, number>> = {
  F10T: { M16: 106, M18: 133, M20: 165, M22: 200, M24: 237 },
  F13T: { M16: 137, M18: 173, M20: 214, M22: 259, M24: 308 },
};
// 표준볼트장력 (kN) = To × 1.1
export const Tstd_kN: Record<BoltGrade, Record<BoltName, number>> = {
  F10T: { M16: 117, M18: 146, M20: 182, M22: 220, M24: 261 },
  F13T: { M16: 151, M18: 190, M20: 235, M22: 285, M24: 339 },
};

// [표 1.7] 1면전단 공칭미끄럼강도 Rn (kN) = μ·To(=0.5·To)  (설계 = ×0.85)  ※M18·M24 도출
export const Rn_slip_kN: Record<BoltGrade, Record<BoltName, number>> = {
  F10T: { M16: 52.8, M18: 66.7, M20: 82.4, M22: 99.7, M24: 118.7 },
  F13T: { M16: 68.6, M18: 86.7, M20: 107.0, M22: 130.0, M24: 154.2 },
};

// [표 1.8] 지압접합 축부 공칭전단강도 Fnv (MPa) = 0.5·Fu
export const Fnv_MPa: Record<BoltGrade, number> = { F10T: 500, F13T: 650 };

/**
 * 1면전단 설계미끄럼강도 φRn (kN)  — 2.4절
 * φRn = φ · μ · hsc · To · Ns
 */
export function designSlipStrength_kN(bolt: BoltGrade, name: BoltName, Ns: number): number {
  const To = To_kN[bolt][name];
  return PHI_SLIP * MU * HSC * To * Ns;
}

/** 지압접합 볼트 축부 공칭전단강도 Rn (N) — 2.5절.  Rn = Fnv·Ab·Ns */
export function boltShearBearing_N(bolt: BoltGrade, name: BoltName, Ns: number): number {
  return Fnv_MPa[bolt] * Ab[name] * Ns;
}

export const EDGE_DIST = 40;  // 종연단거리 (mm) — 2.7절
export const GAP_BEAM = 10;   // 보 이음 이격 (mm)
export const GAP_COL_METAL = 0; // 기둥 밀착접합 이격 (mm)
