// ────────────────────────────────────────────────────────────────────────────
// 기하·단면 강도 헬퍼 (SI, 단위: mm / N / MPa)
//   - 총·순단면적, 지압·찢김(J3.10), 압축좌굴(J4.4→E3)
//   - 블록전단(J4.3) 요소별 케이스 A/B/C/D 열거기 (참고 엔진 케이스 라벨·Ubs 준수)
// 반환값은 별도 표기 없으면 N (힘) 단위.
// ────────────────────────────────────────────────────────────────────────────
import { PHI, E_STEEL, K_BUCKLE, UBS, holeDia, netDeductPerHole } from './constants.ts';
import type { BlockCase, BsRegion, NetPath } from './types.ts';

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
  const { cases, gov } = netSectionCases(width, t, cols, dd);
  void cases;
  return { area: gov.area, gain: gov.key === 'zig' ? gov.gain : 0 };
}

/**
 * 엇모(staggered) 순단면 후보 파단경로 열거 — AISC 360-16 B4.3b.
 *   폭방향으로 요소를 관통하는 모든 실질 후보 경로를 나열하고 최소 순단면(=지배)을 반환.
 *   ① 전열 지그재그: 모든 게이지선의 구멍 공제 + 인접 대각마다 s²/4g 회복 (통상 지배).
 *   ② 정렬 위상별 직선: 같은 길이방향 위상(off)에 놓인 열만 동시에 절단하는 수직 파단선.
 *   (정렬배치면 off 단일위상 → ①=② 로 축약, 후보 1개.)
 * cols: 각 볼트열의 {x: 폭방향 좌표, off: 길이방향 오프셋}. dd = 1구멍 공제폭.
 */
export function netSectionCases(width: number, t: number, cols: { x: number; off: number }[], dd: number): { cases: NetPath[]; gov: NetPath } {
  const xs = cols.slice().sort((a, b) => a.x - b.x);
  if (xs.length === 0) {
    const c: NetPath = { key: 'gross', label: '무공제', nHoles: 0, gain: 0, netWidth: width, area: width * t };
    return { cases: [c], gov: c };
  }
  const cases: NetPath[] = [];
  // ① 전열 지그재그
  let gain = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const g = xs[i + 1].x - xs[i].x, s = Math.abs(xs[i + 1].off - xs[i].off);
    if (g > 0 && s > 0) gain += (s * s) / (4 * g);
  }
  const zigW = Math.max(0, width - xs.length * dd + gain);
  cases.push({ key: 'zig', label: `전열 지그재그(${xs.length}공, +Σs²/4g)`, nHoles: xs.length, gain, netWidth: zigW, area: zigW * t });
  // ② 정렬 위상(off)별 직선 절단
  const byOff = new Map<number, number>();
  for (const c of xs) byOff.set(c.off, (byOff.get(c.off) ?? 0) + 1);
  const offs = [...byOff.keys()].sort((a, b) => a - b);
  if (offs.length > 1) for (const off of offs) {
    const n = byOff.get(off)!;
    const w = Math.max(0, width - n * dd);
    cases.push({ key: `s${off}`, label: `직선(${off === 0 ? '외측정렬' : `엇모 +${off}`}열, ${n}공)`, nHoles: n, gain: 0, netWidth: w, area: w * t });
  }
  const gov = cases.reduce((a, b) => (b.area < a.area ? b : a));
  return { cases, gov };
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
  // ── 항별 값(계산서 표기용, 모두 설계값=φ·항) ──
  brg: number;         // 지압항 φ·2.4·d·t·Fu (N) — 연단·간격 공통 상한
  tearEdge: number;    // 찢김항 φ·1.2·Lc,edge·t·Fu (N)
  tearPitch: number;   // 찢김항 φ·1.2·Lc,pitch·t·Fu (N)
  LcEdge: number; LcPitch: number; dh: number;
  govEdge: 'bearing' | 'tearout'; govPitch: 'bearing' | 'tearout';
}
export function bearing(
  t: number, Fu: number, d: number, m: number, nrow: number,
  edgeDist: number, pitch: number,
): BearingResult {
  const dh = holeDia(d);
  const LcEdge = edgeDist - dh / 2;      // 연단 순거리
  const LcPitch = pitch - dh;            // 간격 순거리
  const brg = PHI.V * 2.4 * d * t * Fu;                                  // 지압 상한(φ·2.4dtFu)
  const tearEdge = PHI.V * 1.2 * Math.max(0, LcEdge) * t * Fu;           // 찢김(φ·1.2·Lc,e·t·Fu)
  const tearPitch = PHI.V * 1.2 * Math.max(0, LcPitch) * t * Fu;         // 찢김(φ·1.2·Lc,p·t·Fu)
  const edge = Math.min(brg, tearEdge);
  const spaced = Math.min(brg, tearPitch);
  const nEdge = m, nSpaced = m * (nrow - 1);
  return {
    edge, spaced, total: nEdge * edge + nSpaced * spaced, nEdge, nSpaced,
    brg, tearEdge, tearPitch, LcEdge, LcPitch, dh,
    govEdge: brg <= tearEdge ? 'bearing' : 'tearout', govPitch: brg <= tearPitch ? 'bearing' : 'tearout',
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
  region?: BsRegion;     // 요소 컨텍스트 — Path 명명(AISIsplice Appendix C)용
  fullShare?: boolean;   // 분담식: true=전 Path 요소 전체력(1.0), false=단일 L블록만 tributary(1/m)
}

// 엇모 3D/DXF 정합 상수(connParts stagOf): 내측열 응력방향 어긋남 45, 엇모 피치 90.
export const BS_STAG_OFF = 45, BS_STAG_PITCH = 90;
// ── AISIsplice Appendix C 파단경로(Path) 명명 — 요소×기하키 → Path 라벨 ──
//   기하키(BlockCase.key):
//     L1  외연 L블록  : 최외곽 게이지선 1전단면 + 그 선→연단 인장 (Ubs 0.5)
//     U2a 전열 U블록  : 최외곽 2게이지선 전단(2면) + 두 선 사이 전폭 인장 (Ubs 1.0)
//     U2b 외측 U블록  : 내측(m=2면 외측과 동일) 2게이지선 전단 + 각 선→외측 연단 인장 (Ubs 1.0)
//     B3  밴드분할 U  : m≥4, 상·하 2밴드(각 [xIn,xOut]) U블록 ×2 (Ubs 1.0)
//     webV 웨브 V블록 : 수직전단(볼트열 방향) + 최하단 수평 인장 (Ubs 0.5)
//   (엇모는 Path를 바꾸지 않고 인장 순단면만 s²/4g 보정 — §계획서 §3)
//   빈 문자열('') 매핑은 그 요소에서 해당 Path 미검토(첨부 도해에 없음).
const PATH_OF: Record<BsRegion, Record<string, string>> = {
  'outer':         { L1: 'Path 1', U2a: 'Path 2a', U2b: 'Path 2b', B3: 'Path 3' },
  'inner':         { L1: 'Path 4', U2a: 'Path 5a', U2b: 'Path 5b', B3: '' },
  'member-flange': { L1: '', U2a: 'Path 6·7', U2b: '', B3: 'Path 8·9' },
  'web-plate':     { webV: 'Path 1' },
  'member-web':    { webV: 'Path 4·5' },
};
const pathOf = (region: BsRegion | undefined, key: string): string => (PATH_OF[region ?? 'outer']?.[key]) ?? '';

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
 * 요소별 블록전단 후보 Path 열거 (AISIsplice Appendix C).
 *   플랜지(outer/inner/member-flange): 축력 인장 — 전단면 ∥ 하중, 인장면 ⊥ 하중.
 *     L1  외연 L블록  — 최외곽선 1전단 + 그 선→연단 인장           (Ubs 0.5)
 *     U2a 전열 U블록  — 최외곽 2전단 + 두 선 사이 전폭 인장         (Ubs 1.0)
 *     U2b 외측 U블록  — 내측(m=2면 외측=내측) 2전단 + 각 선→외측연단 인장 (Ubs 1.0)
 *     B3  밴드분할 U  — m≥4, 상·하 2밴드 각 [xIn,xOut] U ×2         (Ubs 1.0)
 *   웨브(web-plate/member-web): 수직전단 V — 전단면 = 볼트열(수직), 인장면 = 최하단행(수평).
 *     webV  cols≥2 → U(2전단+하단인장) · cols=1 → 전체볼트군 (Ubs 1.0, frac 1.0)
 *   분담(frac): U블록(양측 파단선)=1.0(요소 전체 소요력), 단일 파단선 L블록(Path 1·4)=그 열 tributary(1/m).
 *   미검토 Path(요소 도해에 없음)는 PATH_OF에서 ''로 매핑되어 자동 제외.
 */
export function blockShear(p: BlockShearParams): { cases: BlockCase[]; gov?: BlockCase } {
  const { t, Fy, Fu, d, halfWidth, cols, region } = p;
  const dh = holeDia(d);
  const web = region === 'web-plate' || region === 'member-web';
  // 열별 전단면(3D/DXF stagOf 정합): 외측열 nHi행·off0, 내측열 nLo행·off45.
  const gLine = (x: number) => { const g = bsColGeom(x, p); const nSh = g.rows - 0.5; return { Agv: g.Lv * t, Anv: Math.max(0, g.Lv - nSh * dh) * t }; };
  const absC = cols.map(Math.abs);
  const xOut = Math.max(...absC);
  const posAbs = absC.filter(v => v > 0.1);
  const xIn = posAbs.length ? Math.min(...posAbs) : xOut;
  const hasInner = xOut - xIn > 0.5;                                 // 실질 내측열 존재(=m≥4)
  const outerG = gLine(xOut), innerG = gLine(xIn);
  // 엇모 순단면 보정(B4.3b): U블록 대각 인장면은 gap당 s²/4g 회복(s=45=내측 어긋남).
  const gg = p.gauge ?? 0;
  const stagAdd = (p.staggered && gg > 0) ? (BS_STAG_OFF * BS_STAG_OFF) / (4 * gg) : 0;
  const antAcross = (w: number, nGap: number) => Math.max(0, w - nGap * dh + nGap * stagAdd) * t;  // 열간 전폭 인장(U)
  const antEdge = (w: number, nCross: number) => Math.max(0, w - nCross * 0.5 * dh) * t;           // 연단측 인장(nCross 게이지선 반홀)

  const m = cols.length;
  const cs: BlockCase[] = [];
  // key → Path(요소별, PATH_OF). path=''(미검토)면 생략.
  // 분담(frac): U블록(양측 파단선)=1.0(전체 소요력), 단일 파단선 L블록=그 열 tributary(1/m).
  const mk = (key: string, Ubs: number, Agv: number, Anv: number, Ant: number, frac: number): void => {
    const path = pathOf(region, key);
    if (!path) return;
    cs.push({ key, path, Ubs, Agv, Anv, Ant, frac, ...bsCapacity(Agv, Anv, Ant, Fu, Fy, Ubs) });
  };

  if (web) {
    // 웨브 V 블록(수직 전단) — 대칭 양면 이음판·동심 볼트군 → 인장 균등(Ubs 1.0). 블록=전체 볼트군 → frac 1.0.
    if (cols.length >= 2) mk('webV', UBS.UNIFORM, 2 * outerG.Agv, 2 * outerG.Anv, antAcross(2 * xOut, cols.length - 1), 1.0);
    else mk('webV', UBS.UNIFORM, outerG.Agv, outerG.Anv, antEdge(halfWidth - xOut, 1), 1.0);
    return { cases: cs };
  }
  // 플랜지 요소 — Path 1 / 2a / 2b / 3.  L1 분담: 균형=1/m(외측열 tributary), 전체력=1.0.
  mk('L1', UBS.NONUNIFORM, outerG.Agv, outerG.Anv, antEdge(halfWidth - xOut, 1), p.fullShare ? 1.0 : 1 / m);
  mk('U2a', UBS.UNIFORM, 2 * outerG.Agv, 2 * outerG.Anv, antAcross(2 * xOut, m - 1), 1.0);          // Path 2a (U 내부인장)
  mk('U2b', UBS.UNIFORM, 2 * innerG.Agv, 2 * innerG.Anv, 2 * antEdge(halfWidth - xIn, hasInner ? 2 : 1), 1.0); // Path 2b (U 외측인장 ×2)
  if (hasInner) {                                                                                   // Path 3 (밴드분할 U, m≥4)
    const bandAgv = outerG.Agv + innerG.Agv, bandAnv = outerG.Anv + innerG.Anv;                     // 밴드 2전단선(xIn,xOut)
    mk('B3', UBS.UNIFORM, 2 * bandAgv, 2 * bandAnv, 2 * antAcross(xOut - xIn, 1), 1.0);
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
