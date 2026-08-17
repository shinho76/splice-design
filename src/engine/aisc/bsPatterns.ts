// ────────────────────────────────────────────────────────────────────────────
// 블록전단 파단선 패턴 — 단일 소스 (도해 + 면적 + φRn)
//   AISIsplice Appendix C. 확정 패턴(1열·2열·엇모·웨브)을 요소·배치별로 열거.
//   각 Path: 시각(shear/tension/tear) + 면적(Agv/Anv/Ant) + φRn 을 함께 산출.
//   좌표: x = 하중축(자유단 0 → 이음), y = 폭(웨브 CL 0). CheckFig (u,v)=(x,y) 직접 매핑.
//   면적 관행(기존 엔진 정합):
//     Agv=Σ전단선길이·t · Anv=Σ(길이−(rows−0.5)·dₕ)·t
//     Ant=Σ(폭 − holes·dₕ + Σs²/4g)·t,  holes=인장 y구간내 게이지선 − 양단 게이지선당 0.5
// ────────────────────────────────────────────────────────────────────────────
import { PHI } from './constants.ts';
import type { BlockCase } from './types.ts';

export type Pt = [number, number];
export interface ShearLine { y: number; x0: number; x1: number; }
export interface BsPath {
  id: string; label: string; ubs: number;
  shear: ShearLine[];       // 전단면(수평 ∥하중): y위치, x[0..1]
  tension: Pt[][];          // 인장면(⊥하중, 계단 폴리라인)
  tear: Pt[][];             // 탈락블록 다각형(들)
  Agv: number; Anv: number; Ant: number;   // mm²(요소 합산: 내부·웨브=2매 포함)
  Rn: number; phiRn: number;               // N
}

export interface BsInput {
  kind: 'outer' | 'inner' | 'girder' | 'web';
  lines: number[];      // 게이지선 y(부호). 1열=[±a], 2열/엇모=[±aIn,±aOut]. 웨브=축열(±c)
  n: number;            // 열당 볼트수(정렬 기준)
  pitch: number; edge: number;
  staggered?: boolean;  // 엇모: 외곽선 off0·내측선 off45, 피치 90
  nHi?: number; nLo?: number;      // 외곽·내측 행수(엇모). 기본 n
  ym: number;           // 판/부재 반폭(외부·부재·웨브). 인장 외측 연단
  innerEdge?: number; outerEdge?: number;  // 내부판 스트립 [끝선, 외측연단]
  webBar?: number;      // 웨브 바 반폭(내부·부재 도해). 없으면 미표기
  t: number; dh: number; Fy: number; Fu: number;
  plates: number;       // φRn 곱수 관행(외부·부재=1, 웨브=2). 내부는 상·하 스트립 기하에 2매 포함→1
}

const STAG_OFF = 45, STAG_PITCH = 90;
const NON = 0.5, UNI = 1.0;

// ── 기하 헬퍼 ────────────────────────────────────────────────────────────────
function geom(p: BsInput) {
  const mx = Math.max(...p.lines.map(Math.abs));
  const isOut = (y: number) => Math.abs(Math.abs(y) - mx) < 0.5;
  const off = (y: number) => (p.staggered && !isOut(y) ? STAG_OFF : 0);
  const pit = p.staggered ? STAG_PITCH : p.pitch;
  const rows = (y: number) => (p.staggered ? (isOut(y) ? (p.nHi ?? p.n) : (p.nLo ?? p.n)) : p.n);
  const last = (y: number) => p.edge + off(y) + Math.max(0, rows(y) - 1) * pit;
  const nj = (y: number): Pt => [last(y), y];
  const absP = p.lines.map(Math.abs).filter(v => v > 0.1);
  const aOut = Math.max(...p.lines.map(Math.abs));
  const aIn = absP.length ? Math.min(...absP) : aOut;
  return { isOut, off, pit, rows, last, nj, aOut, aIn };
}

// ── 면적 산출(일반식) ────────────────────────────────────────────────────────
function areas(path: { shear: ShearLine[]; tension: Pt[][] }, p: BsInput) {
  const G = geom(p), dh = p.dh, gg = p.staggered ? p.pitch : 0; // 엇모 게이지 = 정렬피치(원 게이지)
  let Agv = 0, Anv = 0, Ant = 0;
  for (const s of path.shear) {
    const L = Math.abs(s.x1 - s.x0), r = G.rows(s.y);
    Agv += L * p.t;
    Anv += Math.max(0, L - (r - 0.5) * dh) * p.t;
  }
  const onLine = (y: number) => p.lines.some(l => Math.abs(l - y) < 0.5);
  for (const poly of path.tension) {
    if (poly.length < 2) continue;
    const ys = poly.map(q => q[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const width = y1 - y0;
    const linesIn = p.lines.filter(l => l > y0 - 0.5 && l < y1 + 0.5).length;
    const endAdj = (onLine(poly[0][1]) ? 0.5 : 0) + (onLine(poly[poly.length - 1][1]) ? 0.5 : 0);
    const holes = Math.max(0, linesIn - endAdj);
    let gain = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      const dx = Math.abs(poly[i + 1][0] - poly[i][0]), dy = Math.abs(poly[i + 1][1] - poly[i][1]);
      if (dx > 0.5 && dy > 0.5) gain += (dx * dx) / (4 * dy);
    }
    Ant += Math.max(0, width - holes * dh + gain) * p.t;
  }
  return { Agv, Anv, Ant };
}

function finalize(id: string, label: string, ubs: number, shear: ShearLine[], tension: Pt[][], tear: Pt[][], p: BsInput): BsPath {
  const { Agv, Anv, Ant } = areas({ shear, tension }, p);
  const Rn = Math.min(0.6 * p.Fu * Anv, 0.6 * p.Fy * Agv) + ubs * p.Fu * Ant;
  return { id, label, ubs, shear, tension, tear, Agv, Anv, Ant, Rn, phiRn: PHI.R * Rn * p.plates };
}

// ── 공통 조각 ────────────────────────────────────────────────────────────────
const rect = (x0: number, x1: number, y0: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const vseg = (x: number, y0: number, y1: number): Pt[] => [[x, y0], [x, y1]];

// ── 엔진 결선: 후보 Path 전체 → BlockCase[] (φRn·DCR·도해) ────────────────────
//   각 케이스를 소요(demandN) 대비 DCR 판정. 지배=최대 DCR. frac=1(각 후보 전 소요 저항).
export function bsCases(input: BsInput, demandN: number): { cases: BlockCase[]; gov: BlockCase } {
  const cases: BlockCase[] = blockShearPaths(input).map(p => ({
    key: p.id, path: p.label, Ubs: p.ubs, Agv: p.Agv, Anv: p.Anv, Ant: p.Ant,
    Rn: p.Rn * input.plates, phiRn: p.phiRn, frac: 1,
    dcr: p.phiRn > 0 ? +(demandN / p.phiRn).toFixed(3) : 0,
    viz: { shear: p.shear, tension: p.tension, tear: p.tear },
  }));
  const gov = cases.reduce((a, b) => ((b.dcr ?? 0) > (a.dcr ?? 0) ? b : a));
  gov.gov = true;
  return { cases, gov };
}

// ── 요소별 Path 열거 ─────────────────────────────────────────────────────────
export function blockShearPaths(p: BsInput): BsPath[] {
  const G = geom(p), { aOut, aIn, ym } = { aOut: G.aOut, aIn: G.aIn, ym: p.ym };
  const m = p.lines.length, S = (y: number): ShearLine => ({ y, x0: 0, x1: G.last(y) }), nj = G.nj;
  const XT = Math.max(...p.lines.map(G.last));
  const F = (id: string, l: string, u: number, sh: ShearLine[], te: Pt[][], tr: Pt[][]) => finalize(id, l, u, sh, te, tr, p);

  if (p.kind === 'web') {
    // 웨브: 수직전단 V, 이음면 한쪽 절반(축좌표 y=이음면0→외곽, 양수). 전단=외곽 볼트열만
    //   수직 1면(2·3열도 내부 전단면 제외), 인장=최하단행에서 외곽열→이음면 수평 1면,
    //   탈락블록=외곽열~이음면 블록(내부열 포함).
    const cOut = Math.max(...p.lines.map(Math.abs)), Lv = G.last(cOut);
    return [F('W1', 'Path 1', UNI,
      [{ y: cOut, x0: 0, x1: Lv }],
      [[[Lv, cOut], [Lv, 0]]],
      [rect(0, Lv, 0, cOut)])];
  }

  if (p.kind === 'inner') {
    // 내부판 상·하 2스트립. 게이지선: 상판(양수)·하판(음수). 끝선 iE, 외측연단 oE.
    const iE = p.innerEdge ?? aIn - 20, oE = p.outerEdge ?? aOut + 35;
    const up = p.lines.filter(y => y > 0).sort((a, b) => a - b), lo = p.lines.filter(y => y < 0).sort((a, b) => b - a);
    const hiU = up[up.length - 1], inU = up[0], hiL = lo[lo.length - 1], inL = lo[0]; // hi=외곽, in=내측
    if (m <= 2) { // 1열: 판당 1선 → Path 4
      return [F('I4', 'Path 4', NON, [S(hiU), S(hiL)],
        [vseg(G.last(hiU), hiU, oE), vseg(G.last(hiL), hiL, -oE)],
        [rect(0, G.last(hiU), hiU, oE), rect(0, G.last(hiL), hiL, -oE)])];
    }
    if (p.staggered) { // 엇모: 계단(경사) 인장 — Path 4a(직진)/4b(계단)/5a(밴드계단)/5b(2스트립)
      return [
        F('I4a', 'Path 4a', NON, [S(inU), S(inL)],
          [vseg(G.last(inU), inU, oE), vseg(G.last(inL), inL, -oE)],
          [rect(0, G.last(inU), inU, oE), rect(0, G.last(inL), inL, -oE)]),
        F('I4b', 'Path 4b', NON, [S(inU), S(inL)],
          [[nj(inU), nj(hiU), [G.last(hiU), oE]], [[G.last(hiL), -oE], nj(hiL), nj(inL)]],
          [[[0, inU], nj(inU), nj(hiU), [G.last(hiU), oE], [0, oE]], [[0, -oE], [G.last(hiL), -oE], nj(hiL), nj(inL), [0, inL]]]),
        F('I5a', 'Path 5a', UNI, [S(hiU), S(inU), S(inL), S(hiL)],
          [[nj(inU), nj(hiU)], [nj(hiL), nj(inL)]],
          [[[0, inU], nj(inU), nj(hiU), [0, hiU]], [[0, hiL], nj(hiL), nj(inL), [0, inL]]]),
        F('I5b', 'Path 5b', UNI, [S(hiU), S(inU), S(inL), S(hiL)],
          [[nj(hiU), [G.last(hiU), oE]], [[G.last(inU), iE], nj(inU)], [[G.last(inL), -iE], nj(inL)], [nj(hiL), [G.last(hiL), -oE]]],
          [[[0, hiU], nj(hiU), [G.last(hiU), oE], [0, oE]], [[0, iE], [G.last(inU), iE], nj(inU), [0, inU]], [[0, inL], nj(inL), [G.last(inL), -iE], [0, -iE]], [[0, -oE], [G.last(hiL), -oE], nj(hiL), [0, hiL]]]),
      ];
    }
    // 2열(정렬): Path 4(내측선·판연단) / 5a(4면·내측) / 5b(4면·2스트립)
    const r: BsPath[] = [];
    r.push(F('I4', 'Path 4', NON, [S(inU), S(inL)],
      [vseg(G.last(inU), inU, oE), vseg(G.last(inL), inL, -oE)],
      [rect(0, G.last(inU), inU, oE), rect(0, G.last(inL), inL, -oE)]));
    r.push(F('I5a', 'Path 5a', UNI, [S(hiU), S(inU), S(inL), S(hiL)],
      [vseg(G.last(hiU), inU, hiU), vseg(G.last(hiL), hiL, inL)],
      [rect(0, G.last(hiU), inU, hiU), rect(0, G.last(hiL), hiL, inL)]));
    r.push(F('I5b', 'Path 5b', UNI, [S(hiU), S(inU), S(inL), S(hiL)],
      [vseg(G.last(hiU), oE, hiU), vseg(G.last(inU), inU, iE), vseg(G.last(inL), -iE, inL), vseg(G.last(hiL), hiL, -oE)],
      [rect(0, G.last(hiU), hiU, oE), rect(0, G.last(inU), iE, inU), rect(0, G.last(inL), inL, -iE), rect(0, G.last(hiL), -oE, hiL)]));
    return r;
  }

  // ── 외부/부재 (전폭 1매, 부재는 웨브 바 표기만 다름) ──
  const isG = p.kind === 'girder';
  if (m <= 2) { // 1열
    const a = aOut;
    if (isG) return [ // 부재 Path 6 = 상·하선 전단 + 판 외측연단
      F('M6', 'Path 6', UNI, [S(a), S(-a)], [vseg(G.last(a), a, ym), vseg(G.last(-a), -a, -ym)], [rect(0, G.last(a), a, ym), rect(0, G.last(-a), -a, -ym)])];
    return [
      F('P1', 'Path 1', NON, [S(a)], [vseg(G.last(a), a, -ym)], [rect(0, G.last(a), a, -ym)]),
      F('P2a', 'Path 2a', UNI, [S(-a), S(a)], [vseg(G.last(a), -a, a)], [rect(0, G.last(a), -a, a)]),
      F('P2b', 'Path 2b', UNI, [S(-a), S(a)], [vseg(G.last(a), a, ym), vseg(G.last(-a), -a, -ym)], [rect(0, G.last(a), a, ym), rect(0, G.last(-a), -a, -ym)]),
    ];
  }
  // 2열/엇모 (m=4)
  const st = p.staggered;
  const stepAll: Pt[] = [nj(-aOut), nj(-aIn), nj(aIn), nj(aOut)];
  if (!st) { // 2열 (정렬)
    if (isG) return [
      F('M6', 'Path 6', UNI, [S(aIn), S(-aIn)], [vseg(XT, aIn, ym), vseg(XT, -ym, -aIn)], [rect(0, XT, aIn, ym), rect(0, XT, -ym, -aIn)]),
      F('M7', 'Path 7', UNI, [S(aOut), S(aIn), S(-aIn), S(-aOut)], [vseg(XT, aIn, aOut), vseg(XT, -aOut, -aIn)], [rect(0, XT, aIn, aOut), rect(0, XT, -aOut, -aIn)]),
    ];
    return [
      F('P1', 'Path 1', NON, [S(aOut)], [vseg(XT, aOut, -ym)], [rect(0, XT, aOut, -ym)]),
      F('P2a', 'Path 2a', UNI, [S(aOut), S(-aOut)], [vseg(XT, aOut, -aOut)], [rect(0, XT, aOut, -aOut)]),
      F('P2b', 'Path 2b', UNI, [S(aIn), S(-aIn)], [vseg(XT, aIn, ym), vseg(XT, -aIn, -ym)], [rect(0, XT, aIn, ym), rect(0, XT, -aIn, -ym)]),
      F('P3', 'Path 3', UNI, [S(aOut), S(aIn), S(-aIn), S(-aOut)], [vseg(XT, aIn, aOut), vseg(XT, -aOut, -aIn)], [rect(0, XT, aIn, aOut), rect(0, XT, -aOut, -aIn)]),
    ];
  }
  // 엇모 (m=4) — 경사(계단) 인장
  const bandTopStep: Pt[] = [nj(aIn), nj(aOut)], bandBotStep: Pt[] = [nj(-aOut), nj(-aIn)];
  if (isG) return [
    // ※ Path 8(=5b 등가, 2스트립)은 삭제: 부재 플랜지의 내측 스트립이 웨브와 일체(연결)라
    //    그 블록은 분리·탈락하지 않는다. 내부 이음판(FI5)의 5b와 달리 자유단이 없음.
    F('M6a', 'Path 6a', NON, [S(aIn), S(-aIn)], [[nj(aIn), [G.last(aIn), ym]], [[G.last(-aIn), -ym], nj(-aIn)]],
      [[[0, aIn], nj(aIn), [G.last(aIn), ym], [0, ym]], [[0, -ym], [G.last(-aIn), -ym], nj(-aIn), [0, -aIn]]]),
    F('M6b', 'Path 6b', NON, [S(aIn), S(-aIn)], [[nj(aIn), nj(aOut), [G.last(aOut), ym]], [[G.last(-aOut), -ym], nj(-aOut), nj(-aIn)]],
      [[[0, aIn], nj(aIn), nj(aOut), [G.last(aOut), ym], [0, ym]], [[0, -ym], [G.last(-aOut), -ym], nj(-aOut), nj(-aIn), [0, -aIn]]]),
    F('M7', 'Path 7', UNI, [S(aOut), S(aIn), S(-aIn), S(-aOut)], [bandTopStep, bandBotStep],
      [[[0, aIn], nj(aIn), nj(aOut), [0, aOut]], [[0, -aOut], nj(-aOut), nj(-aIn), [0, -aIn]]]),
  ];
  return [
    F('P1a', 'Path 1a', NON, [S(-aOut)], [[nj(-aOut), nj(-aIn), nj(aIn), nj(aOut), [G.last(aOut), ym]]],
      [[[0, -aOut], nj(-aOut), nj(-aIn), nj(aIn), nj(aOut), [G.last(aOut), ym], [0, ym]]]),
    F('P1b', 'Path 1b', NON, [S(-aOut)], [[nj(-aOut), nj(-aIn), nj(aIn), [G.last(aIn), ym]]],
      [[[0, -aOut], nj(-aOut), nj(-aIn), nj(aIn), [G.last(aIn), ym], [0, ym]]]),
    F('P2a', 'Path 2a', UNI, [S(-aOut), S(aOut)], [[nj(-aOut), nj(-aIn), nj(aIn), nj(aOut), [G.last(aOut), ym]]],
      [[[0, -aOut], nj(-aOut), nj(-aIn), nj(aIn), nj(aOut), [G.last(aOut), ym], [0, ym]]]),
    F('P2b', 'Path 2b', UNI, [S(aIn), S(-aIn)], [[nj(aIn), [G.last(aIn), ym]], [[G.last(-aIn), -ym], nj(-aIn)]],
      [[[0, aIn], nj(aIn), [G.last(aIn), ym], [0, ym]], [[0, -ym], [G.last(-aIn), -ym], nj(-aIn), [0, -aIn]]]),
    F('P2c', 'Path 2c', UNI, [S(aIn), S(-aIn)], [[nj(aIn), nj(aOut), [G.last(aOut), ym]], [[G.last(-aOut), -ym], nj(-aOut), nj(-aIn)]],
      [[[0, aIn], nj(aIn), nj(aOut), [G.last(aOut), ym], [0, ym]], [[0, -ym], [G.last(-aOut), -ym], nj(-aOut), nj(-aIn), [0, -aIn]]]),
    F('P3', 'Path 3', UNI, [S(aOut), S(aIn), S(-aIn), S(-aOut)], [bandTopStep, bandBotStep],
      [[[0, aIn], nj(aIn), nj(aOut), [0, aOut]], [[0, -aOut], nj(-aOut), nj(-aIn), [0, -aIn]]]),
  ];
}
