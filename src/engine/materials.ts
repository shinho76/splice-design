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
  // KS D (현행 명칭 — 항복강도 기준): SS275·SM275·SM355·SN355
  SS275:  { Fy_le40: 275, Fy_gt40: 255, Fu: 410 }, // 일반구조용(구 SS400)
  SM275:  { Fy_le40: 275, Fy_gt40: 255, Fu: 410 }, // 용접구조용(구 SM400) — KS D 3515
  SM355:  { Fy_le40: 355, Fy_gt40: 335, Fu: 490 }, // 용접구조용(구 SM490)
  SM420:  { Fy_le40: 420, Fy_gt40: 400, Fu: 520 }, // KS D 3515 — Fy: ≤16=420 / 40<t≤75=400, Fu min 520
  SM460:  { Fy_le40: 460, Fy_gt40: 430, Fu: 570 }, // KS D 3515 — Fy: ≤16=460 / 40<t≤75=430, Fu min 570
  // KS D 3861 건축구조용 압연강재(SN) — 이음판용
  SN275:  { Fy_le40: 275, Fy_gt40: 255, Fu: 410 },
  SN355:  { Fy_le40: 355, Fy_gt40: 335, Fu: 490 },
  SN400:  { Fy_le40: 235, Fy_gt40: 215, Fu: 400 }, // 구 명칭(인장 400급)
  SN490:  { Fy_le40: 325, Fy_gt40: 295, Fu: 490 }, // 구 명칭(SN490B,C)
  // KS D 3866 건축구조용 열간압연 H형강(SHN)
  SHN275: { Fy_le40: 275, Fy_gt40: 255, Fu: 410 },
  SHN355: { Fy_le40: 355, Fy_gt40: 335, Fu: 490 },
  SHN400: { Fy_le40: 235, Fy_gt40: 215, Fu: 400 }, // 구 명칭(인장 400급)
  SHN490: { Fy_le40: 325, Fy_gt40: 295, Fu: 490 }, // 구 명칭(인장 490급)
  // KS D (구 명칭 — 호환 유지)
  SS400:  { Fy_le40: 235, Fy_gt40: 215, Fu: 400 },
  SM490:  { Fy_le40: 325, Fy_gt40: 295, Fu: 490 },
  SM520:  { Fy_le40: 355, Fy_gt40: 325, Fu: 520 },
  SM570:  { Fy_le40: 420, Fy_gt40: 420, Fu: 570 },
  // ASTM (MPa 환산): A36=36ksi/58ksi, A572-50·A992=50ksi/65ksi, A588=50ksi/70ksi(내후성)
  A36:    { Fy_le40: 250, Fy_gt40: 250, Fu: 400 },
  A572:   { Fy_le40: 345, Fy_gt40: 345, Fu: 450 }, // Gr.50
  A992:   { Fy_le40: 345, Fy_gt40: 345, Fu: 450 }, // W형강 표준(Fy 상한 65ksi·Fy/Fu≤0.85)
  A588:   { Fy_le40: 345, Fy_gt40: 345, Fu: 485 }, // 내후성 강판
  // ASTM A913 — QST(열간압연 후 담금질·자기뜨임). 두께 저감 없는 단일 Fy. ksi→MPa(AISC 관용 반올림)
  A913_50: { Fy_le40: 345, Fy_gt40: 345, Fu: 450 }, // Gr.50: 50ksi / 65ksi
};

/** 판두께에 따른 설계기준항복강도 Fy (MPa) */
export function Fy(steel: SteelGrade, thickness_mm: number): number {
  const s = STEEL[steel];
  return thickness_mm <= 40 ? s.Fy_le40 : s.Fy_gt40;
}
export function Fu(steel: SteelGrade): number {
  return STEEL[steel].Fu;
}

/** 강종 표기 라벨 — 콤보 value(예 'A572','A913_50') → 사람이 읽는 표기('A572 Gr.50','A913 Gr.50'). */
const STEEL_LABEL: Partial<Record<SteelGrade, string>> = {
  A572: 'A572 Gr.50', A913_50: 'A913 Gr.50',
};
export const steelLabel = (s: string): string => STEEL_LABEL[s as SteelGrade] ?? s;

/** 이음판 후보(설계 dropdown) — 자동선택 시 유사재질 우선, 없으면 Fy 최근접. */
export const PLATE_GRADES: SteelGrade[] = ['A36', 'A572', 'SS275', 'SM275', 'SM355', 'SM420', 'SM460', 'SN275', 'SN355', 'SN400', 'SN490'];
// H형강 → 이음판 유사재질(동일 계열 우선) 지정. 미지정 강종은 nearestPlate가 Fy 최근접으로 처리.
const PLATE_SIMILAR: Partial<Record<SteelGrade, SteelGrade>> = {
  SS275: 'SS275', SM275: 'SM275', SM355: 'SM355', SM420: 'SM420', SM460: 'SM460',
  SHN275: 'SN275', SHN355: 'SN355', SHN400: 'SN400', SHN490: 'SN490',   // 건축구조용 SHN(H형강) → SN(이음판) 대응
  A36: 'A36', A572: 'A572', A992: 'A572', A913_50: 'A572',              // A992·A913Gr50 = Fy345/Fu450 → A572 Gr.50 일치
};
/** H형강 강종 → 이음판 기본 강종: 유사재질 우선, 없으면 항복강도(Fy_le40) 최근접 후보. */
export function nearestPlate(steel: SteelGrade): SteelGrade {
  const sim = PLATE_SIMILAR[steel];
  if (sim) return sim;
  const target = STEEL[steel].Fy_le40;
  return PLATE_GRADES.reduce((best, g) =>
    Math.abs(STEEL[g].Fy_le40 - target) < Math.abs(STEEL[best].Fy_le40 - target) ? g : best, PLATE_GRADES[0]);
}

// [표 1.4] 고력볼트 재료강도 (MPa)
export const BOLT_MAT: Record<BoltGrade, { Fy: number; Fu: number }> = {
  F10T: { Fy: 900,  Fu: 1000 },
  F13T: { Fy: 1170, Fu: 1300 },
  S10T: { Fy: 900,  Fu: 1000 }, // 국내 토크전단형(F10T 상당)
  A325: { Fy: 660,  Fu: 830 },  // ASTM A325(≈120ksi)
  F1852:{ Fy: 660,  Fu: 830 },  // ASTM F1852 인장제어형(TC) — A325 상당(Group A)
  A490: { Fy: 900,  Fu: 1040 }, // ASTM A490(≈150ksi)
  F2280:{ Fy: 900,  Fu: 1040 }, // ASTM F2280 인장제어형(TC) — A490 상당(Group B)
};
