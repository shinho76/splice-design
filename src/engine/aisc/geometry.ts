// ────────────────────────────────────────────────────────────────────────────
// 기하·단면 강도 헬퍼 (SI, 단위: mm / N / MPa)
//   - 총·순단면적, 지압·찢김(J3.10), 압축좌굴(J4.4→E3)
//   - 블록전단(J4.3) 요소별 케이스 A/B/C/D 열거기 (참고 엔진 케이스 라벨·Ubs 준수)
// 반환값은 별도 표기 없으면 N (힘) 단위.
// ────────────────────────────────────────────────────────────────────────────
import { PHI, E_STEEL, K_BUCKLE, UBS, holeDia, netDeductPerHole } from './constants.ts';
import type { BlockCase } from './types.ts';

/** 총단면적 (mm²) */
export const grossArea = (width: number, t: number): number => width * t;

/** 순단면적 (mm²) — 폭방향 nHoles개 구멍 공제 (B4.3b: dh + 손상여유) */
export const netArea = (width: number, t: number, nHoles: number, d: number): number =>
  Math.max(0, width - nHoles * netDeductPerHole(d)) * t;

/**
 * 플랜지 볼트열 x좌표(폭방향, CL=0 대칭). 앱 게이지 규칙:
 *   m=2 → ±g1/2,  m=4 → ±g1/2, ±(g1/2+g2)
 */
export function flangeColumns(m: number, g1: number, g2: number): number[] {
  if (m <= 2) return [-g1 / 2, g1 / 2];
  const half = g1 / 2;
  return [-(half + g2), -half, half, half + g2].slice(0, m).sort((a, b) => a - b);
}

// ── 지압·찢김 (J3.10) — 변형 고려식 Rn=min(2.4dtFu, 1.2·Lc·t·Fu), 볼트당 ──
export interface BearingResult {
  edge: number;    // 연단볼트 1개 설계강도 (N)
  spaced: number;  // 간격볼트 1개 설계강도 (N)
  total: number;   // 편측 전체 설계강도 (N)
  nEdge: number; nSpaced: number;
  detail: string;
}
export function bearing(
  t: number, Fu: number, d: number, m: number, nrow: number,
  edgeDist: number, pitch: number,
): BearingResult {
  const dh = holeDia(d);
  const upper = 2.4 * d * t * Fu;
  const LcEdge = edgeDist - dh / 2;      // 연단 순거리
  const LcPitch = pitch - dh;            // 간격 순거리
  const edge = PHI.V * Math.min(upper, 1.2 * Math.max(0, LcEdge) * t * Fu);
  const spaced = PHI.V * Math.min(upper, 1.2 * Math.max(0, LcPitch) * t * Fu);
  const nEdge = m, nSpaced = m * (nrow - 1);
  return {
    edge, spaced, total: nEdge * edge + nSpaced * spaced, nEdge, nSpaced,
    detail: `연단 ${(edge / 1e3).toFixed(1)}×${nEdge} + 간격 ${(spaced / 1e3).toFixed(1)}×${nSpaced} kN`,
  };
}

// ── 압축좌굴 (J4.4 → E3) ──
export interface BuckleResult { Pn: number; phiPn: number; slr: number; Fcr: number; }
export function buckling(t: number, Ag: number, Fy: number, unbraced: number): BuckleResult {
  const rgy = t / Math.sqrt(12);            // 판 약축 회전반경
  const slr = (K_BUCKLE * unbraced) / rgy;  // KL/r
  if (slr <= 25) {                          // J4.4: KL/r≤25 → 항복지배
    const Pn = Fy * Ag;
    return { Pn, phiPn: PHI.C * Pn, slr, Fcr: Fy };
  }
  const Fe = (Math.PI ** 2 * E_STEEL) / slr ** 2;
  const Fcr = Fy / Fe <= 2.25 ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe;
  const Pn = Fcr * Ag;
  return { Pn, phiPn: PHI.C * Pn, slr, Fcr };
}

// ── 블록전단 (J4.3): φRn = φ·[ min(0.6FuAnv, 0.6FyAgv) + Ubs·Fu·Ant ], φ=0.75 ──
function bsCapacity(Agv: number, Anv: number, Ant: number, Fu: number, Fy: number, ubs: number) {
  const Rn = Math.min(0.6 * Fu * Anv, 0.6 * Fy * Agv) + ubs * Fu * Ant;
  return { Rn, phiRn: PHI.R * Rn };
}

export interface BlockShearParams {
  t: number; Fy: number; Fu: number; d: number;
  nrow: number;          // 응력방향 볼트열수
  Lv: number;            // 전단선 길이 = 연단(단부) + (nrow−1)·pitch
  halfWidth: number;     // 요소 반폭 (판 가장자리 = ±halfWidth)
  cols: number[];        // 폭방향 볼트열 x좌표(정렬, CL=0 대칭)
}

/**
 * 요소별 블록전단 후보 케이스 열거 후 최소 지배.
 *   Case C  : U블록 — 최외곽 2전단면 + 전열간 인장 (Ubs=1.0)
 *   Case A  : 외연 L블록 — 1전단면 + 최외곽열→판단 인장 (Ubs=0.5)
 *   Case B  : 중앙 L블록 — 1전단면 + 최내곽열→CL 인장 (Ubs=0.5)
 *   Case D  : 내측 페어 U블록 — 내측 2전단면 + 내측쌍 인장 (Ubs=1.0, m≥4)
 * 단일열(cols.length=1) 요소는 A(양연 L) 만 산정.
 */
export function blockShear(p: BlockShearParams): { cases: BlockCase[]; gov: BlockCase } {
  const { t, Fy, Fu, d, nrow, Lv, halfWidth, cols } = p;
  const dh = holeDia(d);
  const nShear = nrow - 0.5;               // 전단선 구멍수(코너 반개 공유)
  const AgvOne = Lv * t;
  const AnvOne = Math.max(0, Lv - nShear * dh) * t;
  const antLine = (w: number) => Math.max(0, w - 0.5 * dh) * t;         // 단일 인장선(L블록)
  const antSpan = (w: number, nGap: number) => Math.max(0, w - nGap * dh) * t; // 열간 인장(U블록)

  const m = cols.length;
  const xOut = Math.max(...cols.map(Math.abs));
  const xIn = Math.min(...cols.map(Math.abs));
  const cs: BlockCase[] = [];

  // Case A: 외연 L블록 (항상)
  cs.push({
    label: 'A(외연 L블록)', Ubs: UBS.NONUNIFORM,
    Agv: AgvOne, Anv: AnvOne, Ant: antLine(halfWidth - xOut),
    ...bsCapacity(AgvOne, AnvOne, antLine(halfWidth - xOut), Fu, Fy, UBS.NONUNIFORM),
  });

  if (m >= 2) {
    // Case C: 전열 U블록
    const spanC = xOut - Math.min(...cols); // 최외곽 좌우 간격
    cs.push({
      label: 'C(전열 U블록)', Ubs: UBS.UNIFORM,
      Agv: 2 * AgvOne, Anv: 2 * AnvOne, Ant: antSpan(spanC, m - 1),
      ...bsCapacity(2 * AgvOne, 2 * AnvOne, antSpan(spanC, m - 1), Fu, Fy, UBS.UNIFORM),
    });
    // Case B: 중앙 L블록 (내측열→CL)
    if (xIn > 0.1) {
      cs.push({
        label: 'B(중앙 L블록)', Ubs: UBS.NONUNIFORM,
        Agv: AgvOne, Anv: AnvOne, Ant: antLine(xIn),
        ...bsCapacity(AgvOne, AnvOne, antLine(xIn), Fu, Fy, UBS.NONUNIFORM),
      });
    }
  }
  // Case D: 내측 페어 U블록 (m≥4)
  if (m >= 4 && xIn > 0.1) {
    cs.push({
      label: 'D(내측 페어)', Ubs: UBS.UNIFORM,
      Agv: 2 * AgvOne, Anv: 2 * AnvOne, Ant: antSpan(2 * xIn, 1),
      ...bsCapacity(2 * AgvOne, 2 * AnvOne, antSpan(2 * xIn, 1), Fu, Fy, UBS.UNIFORM),
    });
  }

  const gov = cs.reduce((a, b) => (b.phiRn < a.phiRn ? b : a));
  gov.gov = true;
  return { cases: cs, gov };
}
