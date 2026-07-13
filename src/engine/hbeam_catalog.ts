// KS D 3502 압연 H형강 호칭치수·단위무게 카탈로그 (Metric Series, KS/JIS'90)
// 출처: Hyundai Steel Products Guide — WideFlangeShapes(H빔).pdf 1~3p 표.
// 용도: 결과표를 '호칭치수'로 분류(그룹 테두리) + 단면치수 열의 단위무게(kg/m) 표기.
// 필드: nominal 호칭(춤×폭) · W 단위무게(kg/m) · 실치수 H,B,t1(웨브),t2(플랜지),r

export interface CatalogRow { nominal: string; W: number; H: number; B: number; t1: number; t2: number; r: number; }

export const HBEAM_CATALOG: CatalogRow[] = [
  { nominal: '100×100', W: 17.2, H: 100, B: 100, t1: 6, t2: 8, r: 10 },
  { nominal: '125×125', W: 23.8, H: 125, B: 125, t1: 6.5, t2: 9, r: 10 },
  { nominal: '150×75', W: 14.0, H: 150, B: 75, t1: 5, t2: 7, r: 8 },
  { nominal: '150×100', W: 21.1, H: 148, B: 100, t1: 6, t2: 9, r: 11 },
  { nominal: '150×150', W: 31.5, H: 150, B: 150, t1: 7, t2: 10, r: 11 },
  { nominal: '200×100', W: 18.2, H: 198, B: 99, t1: 4.5, t2: 7, r: 11 },
  { nominal: '200×100', W: 21.3, H: 200, B: 100, t1: 5.5, t2: 8, r: 11 },
  { nominal: '200×150', W: 30.6, H: 194, B: 150, t1: 6, t2: 9, r: 13 },
  { nominal: '200×200', W: 49.9, H: 200, B: 200, t1: 8, t2: 12, r: 13 },
  { nominal: '200×200', W: 56.2, H: 200, B: 204, t1: 12, t2: 12, r: 13 },
  { nominal: '250×125', W: 25.7, H: 248, B: 124, t1: 5, t2: 8, r: 12 },
  { nominal: '250×125', W: 29.6, H: 250, B: 125, t1: 6, t2: 9, r: 12 },
  { nominal: '250×175', W: 44.1, H: 244, B: 175, t1: 7, t2: 11, r: 16 },
  { nominal: '250×250', W: 64.4, H: 244, B: 252, t1: 11, t2: 11, r: 16 },
  { nominal: '250×250', W: 66.5, H: 248, B: 249, t1: 8, t2: 13, r: 16 },
  { nominal: '300×150', W: 32.0, H: 298, B: 149, t1: 5.5, t2: 8, r: 13 },
  { nominal: '300×150', W: 36.7, H: 300, B: 150, t1: 6.5, t2: 9, r: 13 },
  { nominal: '300×200', W: 56.8, H: 294, B: 200, t1: 8, t2: 12, r: 18 },
  { nominal: '300×200', W: 65.4, H: 298, B: 201, t1: 9, t2: 14, r: 18 },
  { nominal: '300×300', W: 84.5, H: 294, B: 302, t1: 12, t2: 12, r: 18 },
  { nominal: '300×300', W: 87.0, H: 298, B: 299, t1: 9, t2: 14, r: 18 },
  { nominal: '350×175', W: 41.4, H: 346, B: 174, t1: 6, t2: 9, r: 14 },
  { nominal: '350×175', W: 49.6, H: 350, B: 175, t1: 7, t2: 11, r: 14 },
  { nominal: '350×250', W: 69.2, H: 336, B: 249, t1: 8, t2: 12, r: 20 },
  { nominal: '340×250', W: 79.7, H: 340, B: 250, t1: 9, t2: 14, r: 20 },
  { nominal: '350×350', W: 106, H: 338, B: 351, t1: 13, t2: 13, r: 20 },
  { nominal: '350×350', W: 115, H: 344, B: 348, t1: 10, t2: 16, r: 20 },
  { nominal: '400×200', W: 56.6, H: 396, B: 199, t1: 7, t2: 11, r: 16 },
  { nominal: '400×200', W: 66.0, H: 400, B: 200, t1: 8, t2: 13, r: 16 },
  { nominal: '400×300', W: 94.3, H: 386, B: 299, t1: 9, t2: 14, r: 22 },
  { nominal: '400×300', W: 107, H: 390, B: 300, t1: 10, t2: 16, r: 22 },
  { nominal: '400×400', W: 140, H: 388, B: 402, t1: 15, t2: 15, r: 22 },
  { nominal: '400×400', W: 147, H: 394, B: 398, t1: 11, t2: 18, r: 22 },
  { nominal: '450×200', W: 66.2, H: 446, B: 199, t1: 8, t2: 12, r: 18 },
  { nominal: '450×200', W: 76.0, H: 450, B: 200, t1: 9, t2: 14, r: 18 },
  { nominal: '450×300', W: 106, H: 434, B: 299, t1: 10, t2: 15, r: 24 },
  { nominal: '450×300', W: 124, H: 440, B: 300, t1: 11, t2: 18, r: 24 },
  { nominal: '500×200', W: 79.5, H: 496, B: 199, t1: 9, t2: 14, r: 20 },
  { nominal: '500×200', W: 89.6, H: 500, B: 200, t1: 10, t2: 16, r: 20 },
  { nominal: '500×300', W: 114, H: 482, B: 300, t1: 11, t2: 15, r: 26 },
  { nominal: '500×300', W: 128, H: 488, B: 300, t1: 11, t2: 18, r: 26 },
  { nominal: '600×200', W: 94.6, H: 596, B: 199, t1: 10, t2: 15, r: 22 },
  { nominal: '600×200', W: 106, H: 600, B: 200, t1: 11, t2: 17, r: 22 },
  { nominal: '600×300', W: 137, H: 582, B: 300, t1: 12, t2: 17, r: 28 },
  { nominal: '600×300', W: 151, H: 588, B: 300, t1: 12, t2: 20, r: 28 },
  { nominal: '700×300', W: 166, H: 692, B: 300, t1: 13, t2: 20, r: 28 },
  { nominal: '700×300', W: 185, H: 700, B: 300, t1: 13, t2: 24, r: 28 },
  { nominal: '800×300', W: 191, H: 792, B: 300, t1: 14, t2: 22, r: 28 },
  { nominal: '800×300', W: 210, H: 800, B: 300, t1: 14, t2: 26, r: 28 },
  { nominal: '900×300', W: 213, H: 890, B: 299, t1: 15, t2: 23, r: 28 },
  { nominal: '900×300', W: 243, H: 900, B: 300, t1: 16, t2: 28, r: 28 },
];

const STEEL_RHO = 7.85e-3; // kg/m per mm² (강재 7,850 kg/m³)

/** 실치수(H,B)에 가장 가까운 카탈로그 호칭치수 반환 (그룹 분류용). 예: (386,299)→"400×300" */
export function nominalOf(H: number, B: number): string {
  let best = HBEAM_CATALOG[0], bd = Infinity;
  for (const c of HBEAM_CATALOG) {
    const d = Math.abs(c.H - H) * 2 + Math.abs(c.B - B); // 춤(H)에 가중
    if (d < bd) { bd = d; best = c; }
  }
  return best.nominal;
}

/** 단위무게(kg/m): 실치수 정확일치 시 카탈로그값, 없으면(보강단면 등) 단면적 환산 */
export function unitWeightOf(sec: { H: number; B: number; tw: number; tf: number; Ag: number }): number {
  const hit = HBEAM_CATALOG.find(c => c.H === sec.H && c.B === sec.B && c.t1 === sec.tw && c.t2 === sec.tf);
  if (hit) return hit.W;
  return Math.round(sec.Ag * STEEL_RHO * 10) / 10;
}
