// 고력볼트 표준길이·세트중량 산정 — KS B 1010 / JIS B 1186 세트중량표(볼트+너트+와셔2매) 직접 적용.
// 표준길이 = 조임길이(그립) + 부가길이 → 5mm 올림. 세트중량 = 표값(길이별) 조회.
// 계산엔진(소요력·본수·첨판)은 무관 — 물량/사양 파생만 담당.
import type { DesignResult, BoltName } from './types.ts';
import { boltNameByDia } from './bolts.ts';
import { parseName } from './sections.ts';

// ── KS B 1010 / JIS B 1186 고장력 육각볼트 세트(BOLT_1·NUT_1·WASHER_2) 중량표 [단위 gr] ──
//   g[]  : 길이 L0(mm)부터 5mm 간격 세트질량(그램). 표 원본값 그대로.
//   nutG/washerG : 참고용(너트 1개·와셔 1매 질량). 세트질량에 이미 포함됨.
export interface KsSet { L0: number; step: 5; g: number[]; nutG: number; washerG: number; }
// 표에 없는 호칭(M18 등)은 공식 추정으로 대체(아래 boltSetWeight)
export const KS_B_1010_SET: Partial<Record<BoltName, KsSet>> = {
  // M16: 35~120mm
  M16: { L0: 35, step: 5, nutG: 57, washerG: 20,
    g: [194, 202, 210, 217, 225, 233, 241, 249, 257, 265, 273, 281, 289, 296, 304, 312, 320, 328] },
  // M20: 40~140mm
  M20: { L0: 40, step: 5, nutG: 97, washerG: 32,
    g: [335, 348, 361, 373, 386, 398, 410, 422, 435, 447, 459, 472, 484, 497, 510, 523, 536, 549, 562, 575, 588] },
  // M22: 50~160mm
  M22: { L0: 50, step: 5, nutG: 137, washerG: 52,
    g: [496, 510, 525, 540, 555, 570, 585, 600, 615, 630, 645, 660, 674, 689, 704, 719, 734, 749, 764, 779, 794, 809, 824] },
};

// ── 부가길이(그립에 더하는 길이: 너트+와셔2매+나사여장) mm ──  ※표준시방 관례값
const ADD_LEN: Record<BoltName, number> = { M16: 25, M18: 28, M20: 30, M22: 35, M24: 40 };

const ceil5 = (v: number) => Math.ceil(v / 5) * 5;

/** 플랜지 볼트 조임길이(그립) = 외첨판 + 플랜지 + 내첨판 */
export function gripFlange(r: DesignResult): number {
  const { tf } = parseName(r.section);
  return (r.flange.outerPlate?.t ?? 0) + tf + (r.flange.innerPlate?.t ?? 0);
}
/** 웨브 볼트 조임길이(그립) = 웨브첨판 2매(양면) + 웨브 */
export function gripWeb(r: DesignResult): number {
  const { tw } = parseName(r.section);
  return (r.web.webPlate?.t ?? 0) * 2 + tw;
}

/** 표준 제작길이 = 그립 + 부가길이 → 5mm 올림 */
export function standardLength(grip: number, name: BoltName): number {
  return ceil5(grip + ADD_LEN[name]);
}

/** 세트 1개 질량(kg) — KS B 1010 표값 조회(범위 밖은 선형 연장). 표에 없는 호칭은 공식 추정 */
export function boltSetWeight(name: BoltName, lengthMm: number): number {
  const t = KS_B_1010_SET[name];
  if (!t) {   // M18 등 표 미수록 → 기하 추정: 축부(π/4·d²·ρ) + 머리·너트·와셔2매(≈축부 2.2d)
    const d = parseInt(name.slice(1), 10);
    const perMm = Math.PI / 4 * d * d * 7.85e-6;   // kg/mm
    return +(perMm * lengthMm + perMm * d * 2.2).toFixed(4);
  }
  const idx = Math.round((lengthMm - t.L0) / t.step);
  let g: number;
  if (idx <= 0) g = t.g[0] - idx * (t.g[1] - t.g[0]);                    // 하한 미만: 첫 증분으로 연장
  else if (idx >= t.g.length) {                                         // 상한 초과: 마지막 증분으로 연장
    const last = t.g.length - 1;
    g = t.g[last] + (idx - last) * (t.g[last] - t.g[last - 1]);
  } else g = t.g[idx];                                                  // 표 범위 내: 표값
  return g / 1000;
}

export interface BoltGroupSpec {
  name: BoltName; grip: number; length: number; count: number; setKg: number; totalKg: number;
}
export interface BoltSpec {
  flange: BoltGroupSpec; web: BoltGroupSpec; totalCount: number; totalKg: number;
}

/** 부재 1개소의 볼트 사양(플랜지·웨브 표준길이·본수·세트중량) */
export function boltSpecOf(r: DesignResult): BoltSpec {
  const name = boltNameByDia[r.boltDia];
  const fCount = r.flange.bolt.m * Math.round(r.flange.bolt.n) * 4; // 좌우2 × 상하플랜지2
  const wCount = r.web.bolt.m * r.web.bolt.n * 2;                   // 좌우2
  const mk = (grip: number, count: number): BoltGroupSpec => {
    const length = standardLength(grip, name);
    const setKg = boltSetWeight(name, length);
    return { name, grip, length, count, setKg: +setKg.toFixed(3), totalKg: +(setKg * count).toFixed(2) };
  };
  const flange = mk(gripFlange(r), fCount);
  const web = mk(gripWeb(r), wCount);
  return { flange, web, totalCount: fCount + wCount, totalKg: +(flange.totalKg + web.totalKg).toFixed(2) };
}
