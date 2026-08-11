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
 * 엇모(staggered) 순단면적 (mm²) — AISC 360-16 B4.3b.
 *   순폭 = 총폭 − Σdₕ,eff + Σ(s²/4g)   (s=인접열 길이방향 엇갈림, g=열간 폭방향 게이지)
 * 지배(최소) 순단면 = 전 열을 관통하는 지그재그 경로. 정렬(off 동일)이면 s=0 → (w − n·dd)와 동일.
 * cols: 각 볼트열의 { x: 폭방향 좌표, off: 길이방향 오프셋 }. dd = 1구멍 공제폭.
 * 반환: {area, gain}(gain=Σs²/4g, 계산서 표기용).
 */
export function netAreaStag(width: number, t: number, cols: { x: number; off: number }[], dd: number): { area: number; gain: number } {
  if (cols.length === 0) return { area: width * t, gain: 0 };
  const xs = cols.slice().sort((a, b) => a.x - b.x);
  let gain = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const g = xs[i + 1].x - xs[i].x, s = Math.abs(xs[i + 1].off - xs[i].off);
    if (g > 0 && s > 0) gain += (s * s) / (4 * g);
  }
  const zig = width - xs.length * dd + gain;                 // 전열 지그재그(통상 지배)
  const perLine = new Map<number, number>();                 // 방어적: 한 종선상 최다열 직선경로
  for (const c of xs) perLine.set(c.off, (perLine.get(c.off) ?? 0) + 1);
  const straight = width - Math.max(...perLine.values()) * dd;
  return { area: Math.max(0, Math.min(zig, straight)) * t, gain: zig <= straight ? gain : 0 };
}

/** 열 x좌표 → 길이방향 오프셋(엇모: 최외곽열=0, 내측열=45mm 엇갈림). 정렬이면 전부 0. */
export function colOffsets(cols: number[], staggered: boolean): { x: number; off: number }[] {
  const maxAbs = Math.max(...cols.map(v => Math.abs(v)));
  return cols.map(x => ({ x, off: staggered && Math.abs(x) < maxAbs - 0.5 ? 45 : 0 }));
}

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
  halfWidth: number;     // 요소 반폭 (판 가장자리 = ±halfWidth)
  cols: number[];        // 폭방향 볼트열 x좌표(정렬, CL=0 대칭)
  edge: number;          // 자유단(단부) 연단거리(mm)
  pitch: number;         // 정렬 응력방향 피치(mm)
  nHi: number;           // 외측열 볼트수(=ceil(n)) — 정렬이면 전열 동일
  nLo: number;           // 내측열 볼트수(=floor(n), 엇모)
  staggered?: boolean;   // 엇모배치 — 내측열 off=45·전열 90피치(3D/DXF 정합), U블록 인장면 s²/4g
  gauge?: number;        // 인접열 게이지 g(mm)
}

// 엇모 3D/DXF 정합 상수(connParts stagOf): 내측열 응력방향 어긋남 45, 엇모 피치 90.
export const BS_STAG_OFF = 45, BS_STAG_PITCH = 90;
// 파단모드 병기(첨부 도판): A 외연L=Mode1 · B 중앙L=Mode1´ · C 전열U=Mode2 · D 내측페어=Mode3
const BS_MODE: Record<string, string> = { A: 'Mode 1', B: "Mode 1´", C: 'Mode 2', D: 'Mode 3' };

/** 열좌표 x → 그 열의 전단선 기하(외/내측 행수·오프셋, 3D/DXF stagOf 정합) */
export function bsColGeom(x: number, p: BlockShearParams) {
  const maxAbs = Math.max(...p.cols.map(v => Math.abs(v)));
  const isOut = Math.abs(x) >= maxAbs - 0.5;
  const rows = p.staggered ? (isOut ? p.nHi : p.nLo) : p.nHi;
  const off = (p.staggered && !isOut) ? BS_STAG_OFF : 0;
  const pit = p.staggered ? BS_STAG_PITCH : p.pitch;
  const Lv = p.edge + off + Math.max(0, rows - 1) * pit;   // 자유단→그 열 마지막 볼트
  return { isOut, rows, off, Lv };
}

/**
 * 요소별 블록전단 후보 케이스 열거.
 *   Case C  : 전열 U블록 — 최외곽 2전단면 + 전열간 인장 (Ubs=1.0, 전체볼트 분리 frac=1)
 *   Case A  : 외연 L블록 — 1전단면 + 최외곽열→판단 인장 (Ubs=0.5, 1열 분리 frac=1/m)
 *   Case B  : 중앙 L블록 — 1전단면 + 최내곽열→CL 인장 (Ubs=0.5, 1열 frac=1/m)
 *   Case D  : 내측 페어 U블록 — 내측 2전단면 + 내측쌍 인장 (Ubs=1.0, 2열 frac=2/m, m≥4)
 * 각 케이스는 분리 볼트수에 비례하는 하중분담 frac 을 가진다(부분블록은 tributary 하중과 비교).
 * 단일열(cols.length=1) 요소는 C(양연 U블록)만 산정.
 */
export function blockShear(p: BlockShearParams): { cases: BlockCase[]; gov?: BlockCase } {
  const { t, Fy, Fu, d, halfWidth, cols } = p;
  const dh = holeDia(d);
  // 열별 전단면(3D/DXF stagOf 정합): 외측열 nHi행·off0, 내측열 nLo행·off45.
  const g1 = (x: number) => { const g = bsColGeom(x, p); const nSh = g.rows - 0.5; return { Agv: g.Lv * t, Anv: Math.max(0, g.Lv - nSh * dh) * t }; };
  const xOut = Math.max(...cols.map(Math.abs));
  const xIn = Math.min(...cols.map(Math.abs));
  const outerG = g1(xOut), innerG = g1(xIn);
  // 엇모 순단면 보정(B4.3b): U블록 대각 인장면은 gap당 s²/4g 회복(s=45=내측 어긋남).
  const gg = p.gauge ?? 0;
  const stagAdd = (p.staggered && gg > 0) ? (BS_STAG_OFF * BS_STAG_OFF) / (4 * gg) : 0;
  const antLine = (w: number) => Math.max(0, w - 0.5 * dh) * t;                       // 단일 인장선(L블록)
  const antSpan = (w: number, nGap: number) => Math.max(0, w - nGap * dh + nGap * stagAdd) * t; // 열간 인장(U블록)

  const m = cols.length;
  const cs: BlockCase[] = [];
  const mk = (label: string, mode: string, Ubs: number, Agv: number, Anv: number, Ant: number, frac: number): BlockCase =>
    ({ label, mode, Ubs, Agv, Anv, Ant, frac, ...bsCapacity(Agv, Anv, Ant, Fu, Fy, Ubs) });

  if (m >= 2) {
    // Case C: 전열 U블록 (외측 2전단선)  = Mode 2
    cs.push(mk('C(전열 U블록)', BS_MODE.C, UBS.UNIFORM, 2 * outerG.Agv, 2 * outerG.Anv, antSpan(2 * xOut, m - 1), 1.0));
    // Case A: 외연 L블록 (외측 1열)  = Mode 1
    cs.push(mk('A(외연 L블록)', BS_MODE.A, UBS.NONUNIFORM, outerG.Agv, outerG.Anv, antLine(halfWidth - xOut), 1 / m));
    // Case B: 중앙 L블록 (내측 1열)  = Mode 1´
    if (xIn > 0.1) cs.push(mk('B(중앙 L블록)', BS_MODE.B, UBS.NONUNIFORM, innerG.Agv, innerG.Anv, antLine(xIn), 1 / m));
    // Case D: 내측 페어 U블록 (내측 2전단선, m≥4)  = Mode 3(split)
    if (m >= 4 && xIn > 0.1) cs.push(mk('D(내측 페어)', BS_MODE.D, UBS.UNIFORM, 2 * innerG.Agv, 2 * innerG.Anv, antSpan(2 * xIn, 1), 2 / m));
  } else {
    // 단일열(1열): 양연 U블록 = Mode 1
    cs.push(mk('C(양연 U블록)', BS_MODE.A, UBS.UNIFORM, 2 * outerG.Agv, 2 * outerG.Anv, antSpan(2 * xOut, 0), 1.0));
  }
  return { cases: cs };
}

/**
 * 블록전단 지배 케이스 판정 — 각 케이스를 tributary 하중(frac·demandN)과 비교,
 * 최대 DCR 케이스가 지배. 반환 phiRn/demand는 지배 케이스 기준.
 */
export function blockShearGovern(p: BlockShearParams, demandN: number, plates = 1):
  { cases: BlockCase[]; gov: BlockCase; phiRn: number; demand: number; dcr: number } {
  const { cases } = blockShear(p);
  for (const c of cases) {
    c.phiRn *= plates; c.Rn *= plates;                    // 다판(내부 이음판·웨브 이음판 ×2) 합산
    c.dcr = +((c.frac * demandN) / c.phiRn).toFixed(3);
  }
  const gov = cases.reduce((a, b) => (b.dcr! > a.dcr! ? b : a));
  gov.gov = true;
  return { cases, gov, phiRn: gov.phiRn, demand: gov.frac * demandN, dcr: gov.dcr! };
}
