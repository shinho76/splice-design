// DXF 생성기 — JointDetailDWG.exe(12=보이음/13=기둥이음) 도면 표현 규약 재현. 계산엔진 무관(결과만 소비).
// 정식 DIMENSION(+지오메트리 블록)·이중치수·지시선(원형머리)·romans 스타일·레이어(MAIN/FLG_PL/WEB_PL/BOLT/VER_BOLT/DIM/MINI_BOX)
// ·부재연장+파단선·외곽테두리·MINI_BOX 정보표. 보=가로배치, 기둥=세로배치(90° 회전). 단위 mm.
import type { DesignResult, DesignCondition, Plate } from './types.ts';
import { parseName, sectionByName } from './sections.ts';
import { BOLT_HOLE, boltNameByDia } from './bolts.ts';
import { standardLength, gripFlange, gripWeb } from './bolt_spec.ts';
import { Fy } from './materials.ts';
import { nominalOf } from './hbeam_catalog.ts';

/** 시리즈 키 — W형강: 호칭 접두(W12 등) / H형강: 공칭치수(400×300 등). 전체도면 그룹핑용. */
function seriesKey(r: DesignResult): string {
  const sec = sectionByName(r.section);
  if (sec?.label) { const m = sec.label.match(/^W\d+/i); return m ? m[0].toUpperCase() : sec.label; }
  const { H, B } = parseName(r.section);
  return nominalOf(H, B);
}
/** 카탈로그 순서를 유지하며 시리즈별로 묶기(연속 동일키 그룹). */
function groupBySeries(rows: DesignResult[]): { key: string; items: DesignResult[] }[] {
  const groups: { key: string; items: DesignResult[] }[] = [];
  for (const r of rows) {
    const key = seriesKey(r);
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.items.push(r); else groups.push({ key, items: [r] });
  }
  return groups;
}

const round = Math.round;
const TH = 20;   // 도면 문자높이
const TB = 24;   // 정보표 문자높이(셀폭 150 내 라벨 수용 — 겹침 방지)
const FONT = 'Cell Body';  // 라벨/주기 문자 스타일 — 참조도면 맑은고딕(malgun) TrueType, 한글 렌더. 치수문자는 STANDARD.
const ARROW = 5.0;                        // exe DIMSTYLE dimasz(41) = _ARCHTICK INSERT scale
const PW = 1.6;                           // 입면 첨판 선 폭(POLYLINE width) — 녹색/시안 얇게

// ── 좌표 변환(회전+평행이동) : 보 deg=0, 기둥 deg=90 ──
interface Xf { c: number; s: number; ox: number; oy: number; deg: number; }
const mkXf = (ox: number, oy: number, deg: number): Xf =>
  ({ c: Math.cos(deg * Math.PI / 180), s: Math.sin(deg * Math.PI / 180), ox, oy, deg });
const Tx = (t: Xf, x: number, y: number) => x * t.c - y * t.s + t.ox;
const Ty = (t: Xf, x: number, y: number) => x * t.s + y * t.c + t.oy;
const pt = (t: Xf, x: number, y: number): [number, number] => [Tx(t, x, y), Ty(t, x, y)];
const ff = (n: number) => n.toFixed(2);

export interface Doc { e: string[]; blk: string[]; n: number; }
export const newDoc = (): Doc => ({ e: [], blk: [], n: 0 });

/** 통일 도곽(전 단면 중 최대 크기) — 전체 DXF 출력 시 모든 상세에 동일 테두리 적용 */
export interface UniFrame { frameL: number; frameRC: number; frameR: number; frameTop: number; frameBot: number; }

// 채운 원형 치수머리(DOT_FILLED): CIRCLE 외곽 + 정사각·마름모 SOLID 채움 (변환 적용)
function roundDot(t: Xf, x: number, y: number, lay = 'DIM'): string[] {
  const r = 2.6, s = 1.85, d = 2.6;
  const P = (a: number, b: number) => [ff(Tx(t, a, b)), ff(Ty(t, a, b))];
  const c0 = P(x, y);
  const sq = [P(x - s, y - s), P(x + s, y - s), P(x - s, y + s), P(x + s, y + s)];
  const dm = [P(x, y - d), P(x + d, y), P(x - d, y), P(x, y + d)];
  return [
    '0', 'CIRCLE', '8', lay, '10', c0[0], '20', c0[1], '30', '0', '40', ff(r),
    '0', 'SOLID', '8', lay, '10', sq[0][0], '20', sq[0][1], '30', '0', '11', sq[1][0], '21', sq[1][1], '31', '0', '12', sq[2][0], '22', sq[2][1], '32', '0', '13', sq[3][0], '23', sq[3][1], '33', '0',
    '0', 'SOLID', '8', lay, '10', dm[0][0], '20', dm[0][1], '30', '0', '11', dm[1][0], '21', dm[1][1], '31', '0', '12', dm[2][0], '22', dm[2][1], '32', '0', '13', dm[3][0], '23', dm[3][1], '33', '0',
  ];
}

// 치수 화살촉(_ARCHTICK) : 45° 건축 틱을 INSERT. exe 규약(scale 5.0, 치수선 방향 정렬)
function archtick(t: Xf, x: number, y: number, rotLocal: number): string[] {
  const px = ff(Tx(t, x, y)), py = ff(Ty(t, x, y));
  const rot = rotLocal + t.deg;
  const tags = ['0', 'INSERT', '8', 'DIM', '2', '_ARCHTICK', '10', px, '20', py, '30', '0', '41', ff(ARROW), '42', ff(ARROW), '43', '1.0'];
  if (rot) tags.push('50', ff(rot));
  return tags;
}

function pen(doc: Doc, t: Xf) {
  const PX = (x: number, y: number) => ff(Tx(t, x, y)), PY = (x: number, y: number) => ff(Ty(t, x, y));
  const line = (x1: number, y1: number, x2: number, y2: number, lay: string) =>
    doc.e.push('0', 'LINE', '8', lay, '10', PX(x1, y1), '20', PY(x1, y1), '30', '0', '11', PX(x2, y2), '21', PY(x2, y2), '31', '0');
  // 점선(HIDDEN 선타입 오버라이드) — 내첨판 안쪽선·필렛
  const dline = (x1: number, y1: number, x2: number, y2: number, lay: string) =>
    doc.e.push('0', 'LINE', '8', lay, '6', 'HIDDEN', '10', PX(x1, y1), '20', PY(x1, y1), '30', '0', '11', PX(x2, y2), '21', PY(x2, y2), '31', '0');
  return {
    line, dline,
    dot: (cx: number, cy: number, lay: string) => doc.e.push(...roundDot(t, cx, cy, lay)),
    // 두꺼운 닫힌 폴리라인(POLYLINE 폭) — 첨판을 두꺼운 선으로
    prect: (x: number, y: number, w: number, h: number, lay: string, width: number) => {
      const pts: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      doc.e.push('0', 'POLYLINE', '8', lay, '66', '1', '70', '1', '40', ff(width), '41', ff(width));
      for (const [px, py] of pts) doc.e.push('0', 'VERTEX', '8', lay, '10', PX(px, py), '20', PY(px, py), '30', '0');
      doc.e.push('0', 'SEQEND', '8', lay);
    },
    // 점선 사각형(내첨판 외곽)
    drect: (x: number, y: number, w: number, h: number, lay: string) => {
      dline(x, y, x + w, y, lay); dline(x + w, y, x + w, y + h, lay);
      dline(x + w, y + h, x, y + h, lay); dline(x, y + h, x, y, lay);
    },
    circle: (cx: number, cy: number, r: number, lay: string) =>
      doc.e.push('0', 'CIRCLE', '8', lay, '10', PX(cx, cy), '20', PY(cx, cy), '30', '0', '40', ff(r)),
    arc: (cx: number, cy: number, rad: number, a0: number, a1: number, lay: string) =>
      doc.e.push('0', 'ARC', '8', lay, '10', PX(cx, cy), '20', PY(cx, cy), '30', '0', '40', ff(rad), '50', ff(a0 + t.deg), '51', ff(a1 + t.deg)),
    text: (x: number, y: number, h: number, s: string, lay: string, opt: { rot?: number; align?: 'l' | 'c' | 'r' } = {}) => {
      const tags = ['0', 'TEXT', '8', lay, '7', FONT, '10', PX(x, y), '20', PY(x, y), '30', '0', '40', ff(h), '1', s];
      const rot = (opt.rot ?? 0) + t.deg;
      if (rot) tags.push('50', ff(rot));
      if (opt.align === 'c') tags.push('72', '1', '11', PX(x, y), '21', PY(x, y), '31', '0');
      else if (opt.align === 'r') tags.push('72', '2', '11', PX(x, y), '21', PY(x, y), '31', '0');
      doc.e.push(...tags);
    },
    rect: (x: number, y: number, w: number, h: number, lay: string) => {
      line(x, y, x + w, y, lay); line(x + w, y, x + w, y + h, lay);
      line(x + w, y + h, x, y + h, lay); line(x, y + h, x, y, lay);
    },
  };
}
type Pen = ReturnType<typeof pen>;

// ── 분해치수(선+문자+틱 지오메트리를 직접 엔티티로) ──
// 연관 DIMENSION/DIMSTYLE을 쓰지 않아 DIMSTYLE 필수변수 누락 오류·엄격파서 폐기를 원천 차단.
function bl(t: Xf, a: number, b: number, c: number, d: number): string[] {
  return ['0', 'LINE', '8', 'DIM', '10', ff(Tx(t, a, b)), '20', ff(Ty(t, a, b)), '30', '0', '11', ff(Tx(t, c, d)), '21', ff(Ty(t, c, d)), '31', '0'];
}
function btext(t: Xf, x: number, y: number, s: string, rot: number): string[] {
  const r = rot + t.deg;
  const base = ['0', 'TEXT', '8', 'DIM', '7', 'STANDARD', '10', ff(Tx(t, x, y)), '20', ff(Ty(t, x, y)), '30', '0', '40', String(TH), '1', s];
  if (r) base.push('50', ff(r));
  base.push('72', '1', '11', ff(Tx(t, x, y)), '21', ff(Ty(t, x, y)), '31', '0');
  return base;
}
function emitDim(doc: Doc, t: Xf, p1: [number, number], p2: [number, number], dl: [number, number], txt: string, vertical: boolean) {
  const [x1, y1] = p1, [x2, y2] = p2, [dlx, dly] = dl;
  const geo: string[] = [];
  if (vertical) {
    const dir = Math.sign(dlx - x1) || 1;
    geo.push(...bl(t, dlx, y1, dlx, y2));                                   // 치수선
    geo.push(...bl(t, x1 + dir * 2, y1, dlx + dir * 5, y1), ...bl(t, x2 + dir * 2, y2, dlx + dir * 5, y2)); // 치수보조선
    geo.push(...archtick(t, dlx, y1, 90), ...archtick(t, dlx, y2, 90));     // 틱
    geo.push(...btext(t, dlx + dir * (TH * 0.62), (y1 + y2) / 2, txt, 90)); // 치수문자
  } else {
    const dir = Math.sign(dly - y1) || -1;
    geo.push(...bl(t, x1, dly, x2, dly));
    geo.push(...bl(t, x1, y1 + dir * 2, x1, dly + dir * 5), ...bl(t, x2, y2 + dir * 2, x2, dly + dir * 5));
    geo.push(...archtick(t, x1, dly, 0), ...archtick(t, x2, dly, 0));
    geo.push(...btext(t, (x1 + x2) / 2, dly - dir * (TH * 0.62), txt, 0));
  }
  doc.e.push(...geo);   // 엔티티로 직접 출력(블록·DIMENSION 미사용)
}
function dimChainH(doc: Doc, t: Xf, xs: number[], fy: number, y1: number, y2: number) {
  for (let i = 0; i < xs.length - 1; i++)
    emitDim(doc, t, [xs[i], fy], [xs[i + 1], fy], [(xs[i] + xs[i + 1]) / 2, y1], `${round(xs[i + 1] - xs[i])}`, false);
  emitDim(doc, t, [xs[0], fy], [xs[xs.length - 1], fy], [0, y2], `${round(xs[xs.length - 1] - xs[0])}`, false);
}
function dimChainV(doc: Doc, t: Xf, ys: number[], fx: number, x1: number, x2: number) {
  for (let i = 0; i < ys.length - 1; i++)
    emitDim(doc, t, [fx, ys[i]], [fx, ys[i + 1]], [x1, (ys[i] + ys[i + 1]) / 2], `${round(Math.abs(ys[i] - ys[i + 1]))}`, true);
  emitDim(doc, t, [fx, ys[0]], [fx, ys[ys.length - 1]], [x2, 0], `${round(Math.abs(ys[0] - ys[ys.length - 1]))}`, true);
}
// 지시선 : (px,py)=display 판점 → 텍스트(tx,ty)=display. side>0 우측(좌측정렬)/side<0 좌측(우측정렬)
function leader(p: Pen, px: number, py: number, tx: number, ty: number, txt: string) {
  const side = tx >= px ? 1 : -1;
  const knee = tx - side * 24;                        // 수평 착지선(참고 도면처럼 길게)
  p.dot(px, py, 'DIM');
  p.line(px, py, knee, ty, 'DIM'); p.line(knee, ty, tx, ty, 'DIM');
  p.text(tx + side * 8, ty - TH / 2, TH, txt, 'DIM', { align: side > 0 ? 'l' : 'r' });
}

function breakV(p: Pen, x: number, cy: number, half: number) {
  const z = 16;
  p.line(x, cy - half, x, cy - 10, 'MAIN'); p.line(x, cy + 10, x, cy + half, 'MAIN');
  p.line(x - z, cy, x, cy - 10, 'MAIN'); p.line(x, cy + 10, x + z, cy, 'MAIN'); p.line(x - z, cy, x + z, cy, 'MAIN');
}
// 볼트 입면(⊕): 구멍 원 + 관통 크로스헤어(원 밖으로 약간 연장) — 참고 도면 규약
function boltPlan(p: Pen, x: number, y: number, rad: number) {
  p.circle(x, y, rad, 'BOLT');
  const m = rad * 1.45;                                   // 크로스헤어 팔(원보다 확장)
  p.line(x - m, y, x + m, y, 'BOLT'); p.line(x, y - m, x, y + m, 'BOLT');
}
// 볼트 측면(단면·입면): 축(2선) + 머리(head)·너트(nut) 사각 — 참조도면 육각볼트 표기.
// (cx,cy)=그립 중심, half=그립 반길이(체결 판두께합/2). vertical=true 수직(플랜지볼트)/false 수평(웨브볼트).
function boltSide(p: Pen, cx: number, cy: number, half: number, vertical: boolean, dia: number) {
  const sh = dia * 0.42, hh = dia * 0.62, hl = dia * 0.50;   // 축반폭·머리반폭·머리길이
  if (vertical) {
    p.line(cx - sh, cy - half, cx - sh, cy + half, 'BOLT');
    p.line(cx + sh, cy - half, cx + sh, cy + half, 'BOLT');
    p.rect(cx - hh, cy + half, 2 * hh, hl, 'BOLT');          // 머리(상)
    p.rect(cx - hh, cy - half - hl, 2 * hh, hl, 'BOLT');     // 너트(하)
    p.line(cx - hh, cy + half + hl / 2, cx + hh, cy + half + hl / 2, 'BOLT');   // 육각 표시선
    p.line(cx - hh, cy - half - hl / 2, cx + hh, cy - half - hl / 2, 'BOLT');
  } else {
    p.line(cx - half, cy - sh, cx + half, cy - sh, 'BOLT');
    p.line(cx - half, cy + sh, cx + half, cy + sh, 'BOLT');
    p.rect(cx + half, cy - hh, hl, 2 * hh, 'BOLT');          // 머리(우)
    p.rect(cx - half - hl, cy - hh, hl, 2 * hh, 'BOLT');     // 너트(좌)
    p.line(cx + half + hl / 2, cy - hh, cx + half + hl / 2, cy + hh, 'BOLT');
    p.line(cx - half - hl / 2, cy - hh, cx - half - hl / 2, cy + hh, 'BOLT');
  }
}
// ── 단면(斷面) 뷰 : H형강 단면 + 외/내첨판 + 웨브첨판 + 볼트 측면. 부재 우측에 배치(참조도면 우하). ──
interface SecDims {
  H: number; B: number; tw: number; tf: number; oT: number; outerW: number; chum: number;
  colY: number[]; webRowY: number[]; innerCxAbs: number; dia: number; inner?: Plate;
}
function drawSection(doc: Doc, t: Xf, cx: number, cy: number, r: DesignResult, d: SecDims) {
  const p = pen(doc, t);
  const { H, B, tw, tf, oT, outerW, chum, colY, webRowY, innerCxAbs, dia, inner } = d;
  const tpw = r.web.webPlate?.t ?? 9, iT = inner?.t ?? 0, iw = inner?.w ?? 0;
  // 부재 단면(플랜지 2 + 웨브)
  p.rect(cx - B / 2, cy + H / 2 - tf, B, tf, 'MAIN');
  p.rect(cx - B / 2, cy - H / 2, B, tf, 'MAIN');
  p.rect(cx - tw / 2, cy - H / 2 + tf, tw, H - 2 * tf, 'MAIN');
  // 외첨판(상·하)
  p.prect(cx - outerW / 2, cy + H / 2, outerW, oT, 'FLG_PL', PW);
  p.prect(cx - outerW / 2, cy - H / 2 - oT, outerW, oT, 'FLG_PL', PW);
  // 내첨판(4매: 웨브 양측 × 상·하)
  if (inner) ([1, -1] as const).forEach(sx => {
    const xc = sx * innerCxAbs;
    p.prect(cx + xc - iw / 2, cy + H / 2 - tf - iT, iw, iT, 'FLG_PL', PW);
    p.prect(cx + xc - iw / 2, cy - H / 2 + tf, iw, iT, 'FLG_PL', PW);
  });
  // 웨브첨판(양면 2매)
  p.prect(cx + tw / 2, cy - chum / 2, tpw, chum, 'WEB_PL', PW);
  p.prect(cx - tw / 2 - tpw, cy - chum / 2, tpw, chum, 'WEB_PL', PW);
  // 플랜지볼트(수직) — 열 x=colY, 상·하 플랜지 관통(외판+플랜지+내판)
  const fHalf = (oT + tf + iT) / 2;
  colY.forEach(xw => ([1, -1] as const).forEach(sy => {
    const fc = cy + sy * (H / 2 + (oT - tf - iT) / 2);
    boltSide(p, cx + xw, fc, fHalf, true, dia);
  }));
  // 웨브볼트(수평) — 행 y=webRowY, 웨브+양면 웨브첨판 관통
  const wHalf = (tw + 2 * tpw) / 2;
  webRowY.forEach(yw => boltSide(p, cx, cy + yw, wHalf, false, dia));
  // 주요 치수: 게이지(상단 내측) + 폭 B(상단) · 웨브피치(우측 내측) + 춤 H(우측 외측) · 뷰 라벨
  const fyTop = cy + H / 2 + oT, exR = cx + Math.max(B, outerW) / 2;
  // 플랜지 볼트 게이지(열간 간격) — 최상단 플랜지 위
  const gxs = [...colY].sort((a, b) => a - b);
  for (let i = 0; i < gxs.length - 1; i++)
    emitDim(doc, t, [cx + gxs[i], fyTop], [cx + gxs[i + 1], fyTop], [cx + (gxs[i] + gxs[i + 1]) / 2, fyTop + 34], `${round(gxs[i + 1] - gxs[i])}`, false);
  emitDim(doc, t, [cx - B / 2, fyTop], [cx + B / 2, fyTop], [cx, fyTop + 96], `${round(B)}`, false);   // 폭 B(게이지 위)
  // 웨브 볼트 피치(우측 내측) — 2행 이상일 때. 지시선 라벨이 있는 좌측을 피해 우측에 배치.
  if (webRowY.length > 1) {
    const wys = [...webRowY].map(y => cy + y).sort((a, b) => b - a);
    for (let i = 0; i < wys.length - 1; i++)
      emitDim(doc, t, [exR, wys[i]], [exR, wys[i + 1]], [exR + 48, (wys[i] + wys[i + 1]) / 2], `${round(Math.abs(wys[i] - wys[i + 1]))}`, true);
  }
  emitDim(doc, t, [exR, fyTop], [exR, cy - H / 2 - oT], [exR + 108, 0], `${round(H)}`, true);            // 춤 H(우측 외측)
  p.text(cx, cy - H / 2 - oT - 80, TH * 1.05, 'SECTION', 'DIM', { align: 'c' });
}
const gpl = (pl: Plate | undefined, n: number) => pl ? `G.PL. ${pl.t}x${pl.w}x${pl.L}x${n}EA` : '-';

export function layout(r: DesignResult, isCol: boolean) {
  const { H, B, tw, tf } = parseName(r.section);
  const csStrip = 0;                              // 단면도(SECTION) 제거 — 우측 스트립 없음(참고 도면 규약)
  const oT = r.flange.outerPlate?.t ?? 9;
  const Lpf = r.flange.outerPlate?.L ?? 300, outerW = r.flange.outerPlate?.w ?? 200;
  const wB = r.web.bolt;
  const gap = r.flange.gap ?? 10, base = gap / 2 + 40;
  const webWid = r.web.webPlate?.L ?? 170;
  const webL = Math.max(webWid, 2 * (base + (wB.n - 1) * 60) + 40) + 40;
  const contentHalf = Math.max(Lpf, webL) / 2;
  const hf = outerW / 2, hw = H / 2 + oT;
  const ext = Math.max(H, 300), memHalf = Lpf / 2 + ext;
  const boxRow = 54;
  const yF = 0;                                   // 평면(하단·기둥은 좌) 기준
  if (!isCol) {
    // 보: 평면(하단) → 규격표(중단) → 입면+단면(상단). 참조도면 [나의아저씨] 3밴드 배치.
    const rowH = 125, nRows = 4;                  // 표: 제목 + WEB + FLG(EXT.) + FLG(INT.)
    const boxHalf = Math.max(memHalf, 500) + 20;
    const secB = Math.max(B, outerW);
    const tableBot = yF + hf + 40;                // 표 하단(평면 위 여백)
    const tableTop = tableBot + rowH * nRows;
    const yW = tableTop + 80 + hw;                // 입면 중심(표 위)
    const secCx = boxHalf + 40 + secB / 2 + 60;   // 입면 우측 단면
    const frameRC = secCx + secB / 2 + 150;
    const frameTop = yW + hw + 170;               // 입면 상단 치수 여백
    const frameBot = yF - hf - 150;               // 평면 하단 치수 여백
    return {
      H, B, tw, tf, oT, Lpf, outerW, webWid, contentHalf, hf, hw, gap, base, yF, yW, memHalf, boxRow, secCx,
      rowH, nRows, tableBot, tableTop,
      mOx: 0, mOy: 0, deg: 0,
      boxTop: frameBot, boxBot: frameBot,
      frameL: -boxHalf - 10, frameRC, frameR: frameRC, frameTop, frameBot,
      csCx: frameRC, csCy: (frameTop + frameBot) / 2,
    };
  }
  // 기둥: 세로부재(90° 회전). 기존 배치 유지.
  const yW = hf + 120 + 90 + hw;
  const locYmax = yW + hw + 30, locYmin = yF - hf - 120;
  const halfLen = memHalf + 20;
  const halfView = (locYmax - locYmin) / 2;
  const mOx = (locYmax + locYmin) / 2;
  const dispHW = halfView + 40;
  const boxTop = -halfLen - 40, boxBot = boxTop - boxRow * 4;
  const frameRC = dispHW + 10, frameTop = halfLen + 40, frameBot = boxBot - 16;
  return {
    H, B, tw, tf, oT, Lpf, outerW, webWid, contentHalf, hf, hw, gap, base, yF, yW, memHalf, boxRow, secCx: 0,
    rowH: 0, nRows: 0, tableBot: 0, tableTop: 0,
    mOx, mOy: 0, deg: 90,
    boxTop, boxBot, frameL: -dispHW - 10, frameRC, frameR: frameRC, frameTop, frameBot,
    csCx: frameRC, csCy: (frameTop + frameBot) / 2,
  };
}

// ── 사무소 종합도 셀 주기 : 좌상단 타이틀("BEAM SPLICE DETAIL"/"S=1/20"/"*.섹션") + 우측 콜아웃 블록 ──
// 참조도면(BEAM-SPLICE.dwg) 규약. 테두리·표제란 없음. 값은 현 앱 계산(오버행 캡 반영) 그대로.
function drawSheetCell(p: Pen, F: UniFrame, secLbl: string, outerLbl: string, innerLbl: string, webLbl: string, flBolt: string, wBolt: string) {
  const TT = TH * 1.4;                                   // 타이틀 문자높이
  const tx = F.frameL + 12;
  let ty = F.frameTop - TT - 6;
  p.text(tx, ty, TT, 'BEAM SPLICE DETAIL', 'FLG_PL', { align: 'l' });      // 녹색 타이틀
  p.text(tx + 'BEAM SPLICE DETAIL'.length * TT * 0.62 + 40, ty + (TT - TH) / 2, TH, 'S=1/20', 'WEB_PL', { align: 'l' });  // 시안 축척
  ty -= TT * 1.5;
  p.text(tx, ty, TH * 1.05, '*. ' + secLbl, 'FLG_PL', { align: 'l' });      // 녹색 섹션라벨
  // 우측 콜아웃 블록(FLANGE PLATE SIZE / ExT / INT / BOLT / WEB PLATE SIZE / W / BOLT)
  const cox = F.frameRC + 40;
  let cy = F.frameTop - TH - 24;
  const put = (s: string, lay: string) => { p.text(cox, cy, TH, s, lay, { align: 'l' }); cy -= TH * 1.7; };
  const bolt = (s: string) => { p.text(cox, cy, TH, 'BOLT', 'WEB_PL', { align: 'l' }); p.text(cox + TH * 3.4, cy, TH, s, 'MAIN', { align: 'l' }); cy -= TH * 1.9; };
  put('FLANGE PLATE SIZE', 'WEB_PL');
  put(outerLbl, 'MAIN');
  if (innerLbl && innerLbl !== '-') put(innerLbl, 'MAIN');
  bolt(flBolt);
  put('WEB PLATE SIZE', 'WEB_PL');
  put(webLbl, 'MAIN');
  bolt(wBolt);
}

// ── 규격표(중단 밴드) : 참조도면 [나의아저씨] 셀. 제목행(전폭) + WEB/FLG(EXT.)/FLG(INT.) 3행(라벨|값). ──
function drawSpecTable(p: Pen, x0: number, x1: number, tableBot: number, rowH: number,
  title: string, webS: string, flgExtS: string, flgIntS: string) {
  const TT = 50;                                         // 표 문자높이(참조도면 Cell Head=50)
  const rows = [0, 1, 2, 3, 4].map(i => tableBot + i * rowH);   // 하→상, rows[4]=상단
  p.rect(x0, tableBot, x1 - x0, rowH * 4, 'MINI_BOX');
  for (let i = 1; i < 4; i++) p.line(x0, rows[i], x1, rows[i], 'MINI_BOX');   // 행 구분선
  const lw = Math.min(360, (x1 - x0) * 0.2);             // 라벨열 폭
  p.line(x0 + lw, rows[0], x0 + lw, rows[3], 'MINI_BOX'); // 라벨|값 구분(하위 3행)
  const midY = (i: number) => (rows[i] + rows[i + 1]) / 2 - TT / 2;
  p.text((x0 + x1) / 2, midY(3), TT, title, 'MINI_HEAD', { align: 'c' });     // 제목(최상단 전폭)
  const labels = ['FLG(INT.)', 'FLG(EXT.)', 'WEB'];      // rows 0·1·2 (하→상)
  const vals = [flgIntS, flgExtS, webS];
  for (let i = 0; i < 3; i++) {
    p.text(x0 + lw / 2, midY(i), TT, labels[i], 'TEXT', { align: 'c' });
    p.text(x0 + lw + 40, midY(i), TT, vals[i], 'TEXT', { align: 'l' });
  }
}

export function emitMember(doc: Doc, r: DesignResult, cond: DesignCondition, ox: number, oy: number, uni?: UniFrame, office = false, sheet = false) {
  const isCol = cond.member === '기둥';
  const L = layout(r, isCol);
  // 통일 도곽(uni) 사용 시: 테두리·표제·단면도는 도곽(F) 좌표, 콘텐츠는 도곽 중앙에 오도록 cd만큼 이동.
  const F: UniFrame = uni ?? { frameL: L.frameL, frameRC: L.frameRC, frameR: L.frameR, frameTop: L.frameTop, frameBot: L.frameBot };
  const cdx = uni ? ((F.frameL + F.frameRC) / 2 - (L.frameL + L.frameRC) / 2) : 0;
  const cdy = uni ? ((F.frameTop + F.frameBot) / 2 - (L.frameTop + L.frameBot) / 2) : 0;
  const boxTopE = uni ? F.frameBot + 4 * L.boxRow + 16 : L.boxTop;   // 표제란을 도곽 하단에 고정
  const tM = mkXf(ox + cdx + L.mOx, oy + cdy + L.mOy, L.deg);        // 부재·치수(회전·콘텐츠 중앙이동)
  const tFc = mkXf(ox + cdx, oy + cdy, 0);                           // 지시선(콘텐츠 앵커)
  const tFf = mkXf(ox, oy, 0);                                       // 테두리·표제·단면도(도곽 좌표)
  const p = pen(doc, tM), pfc = pen(doc, tFc), pff = pen(doc, tFf);
  const { H, tw, tf, oT, Lpf, outerW, webWid, contentHalf, yF, yW, gap, base, memHalf } = L;
  const fB = r.flange.bolt, wB = r.web.bolt, dia = r.boltDia;
  const g1 = r.flange.gauge?.g1 ?? 90, g2 = r.flange.gauge?.g2 ?? 0;
  const stag = r.flange.staggered ?? false;
  const inner = r.flange.innerPlate;
  const hole = BOLT_HOLE[boltNameByDia[dia]].hole, rad = hole / 2;
  const btb = (n: number) => `${n}-M${dia} H.T.B`;           // 지시선 볼트 콜아웃(기본)
  const flCount = fB.m * round(fB.n) * 4, wCount = wB.m * wB.n * 2;
  const B = parseName(r.section).B;
  const secLbl = `H-${H}x${B}x${tw}x${tf}`;
  // ── 참조도면 [나의아저씨] 규격표 문자열 : "{n}-M{d}(등급) / {L}x{w}x{t}t(재질, nEA)" (값은 현 앱 계산) ──
  const mat = cond.plateSteel ?? cond.steel;
  const plRef = (pl: Plate | undefined) => pl ? `${pl.L}x${pl.w}x${pl.t}t` : '';
  const titleS = `보-H ${H}x${B}x${tw}/${tf} (GIRDER SPLICE)`;
  const webS = r.web.webPlate ? `${wCount}-M${dia}(${cond.bolt}) / ${plRef(r.web.webPlate)}(${mat}, 2EA)` : '-';
  const flgExtS = r.flange.outerPlate ? `${flCount}-M${dia}(${cond.bolt}) / ${plRef(r.flange.outerPlate)}(${mat}, 2EA)` : '-';
  const flgIntS = r.flange.innerPlate ? `${plRef(r.flange.innerPlate)}(${mat}, 4EA)` : '-';
  // ── 사무소 포맷(office) 라벨: ExT/INT/W-PL + 볼트길이. 값은 현 앱 계산 그대로 ──
  const bName = boltNameByDia[dia];
  const flLen = standardLength(gripFlange(r), bName), wLen = standardLength(gripWeb(r), bName);
  const plO = (pl: Plate | undefined, pre: string) => pl ? `${pre}-${pl.t}x${pl.w}x${pl.L}` : '-';
  const outerLbl = office ? plO(r.flange.outerPlate, 'ExT.2PL') : gpl(r.flange.outerPlate, 2);
  const innerLbl = office ? plO(inner, 'INT.4PL') : gpl(inner, 4);
  const webLbl = office ? plO(r.web.webPlate, 'W.2PL') : gpl(r.web.webPlate, 2);
  const flBoltLbl = office ? `${flCount}-M${dia}x${flLen}` : btb(flCount);
  const wBoltLbl = office ? `${wCount}-M${dia}x${wLen}` : btb(wCount);
  // 사무소 종합도(sheet) 콜아웃용 플랜지 볼트 표기: {열수}x{한쪽플랜지 총본수}-M…  (참조도면 "2x32-M20x110" 문법)
  const flBoltSheet = `${fB.m}x${fB.m * round(fB.n) * 2}-M${dia}x${flLen}`;
  // 정보표 영문화(exe 폰트 OpenSansCondensed엔 한글 글리프 없음 → CAD 깨짐 방지)
  const jointLbl = `${cond.member === '기둥' ? 'Column' : 'Beam'} ${cond.jointType === '지압' ? 'Bearing' : 'Friction'}`;

  const colY = fB.m === 2 ? [-g1 / 2, g1 / 2] : [-(g1 / 2 + g2), -g1 / 2, g1 / 2, g1 / 2 + g2];
  const nHi = Math.ceil(fB.n), nLo = Math.floor(fB.n);
  const fp = r.flange.pitch ?? 60, wp = r.web.pitch ?? 60;   // 엔진 피치(Custom 대구경 상향)
  const fBolts: { x: number; y: number }[] = [];
  const maxAbsCy = Math.max(...colY.map(v => Math.abs(v)));   // 엇모: 외측 게이지선이 이음부 첫 볼트(웨브 대칭)
  const stagOf = (cy: number) => { const isOut = Math.abs(cy) >= maxAbsCy - 0.5; return { off: isOut ? 0 : 45, rows: isOut ? nHi : nLo }; };
  ([1, -1] as const).forEach(s => colY.forEach((cy) => {
    if (!stag) for (let i = 0; i < nHi; i++) fBolts.push({ x: s * (base + i * fp), y: cy });
    else { const { off, rows } = stagOf(cy); for (let j = 0; j < rows; j++) fBolts.push({ x: s * (base + off + j * 90), y: cy }); }
  }));
  const fPosX = [...new Set(fBolts.filter(b => b.x > 0).map(b => b.x))].sort((a, b) => a - b);
  const chum = r.web.webPlate?.w ?? 140, Pc = r.web.Pc ?? 60;
  const webOff = 0;   // 웨브볼트 이음부 연단 40(플랜지와 동일) — 절반피치 엇갈림 제거
  const webPosX = Array.from({ length: wB.n }, (_, i) => base + webOff + i * wp);
  const webRowY = Array.from({ length: wB.m }, (_, i) => (i - (wB.m - 1) / 2) * Pc);

  // ── 웨브 입면도 (yW) : 부재 연장 + 파단선 ──
  ([1, -1] as const).forEach(s => {
    [H / 2, H / 2 - tf].forEach(off => {
      const y = yW + s * off;
      p.line(-memHalf, y, -gap / 2, y, 'MAIN'); p.line(gap / 2, y, memHalf, y, 'MAIN');
    });
  });
  breakV(p, -memHalf, yW, H / 2); breakV(p, memHalf, yW, H / 2);
  // 플랜지 첨판(외·내) = green 두꺼운 선 / 웨브 첨판 = cyan 두꺼운 선
  p.prect(-Lpf / 2, yW + H / 2, Lpf, oT, 'FLG_PL', PW); p.prect(-Lpf / 2, yW - H / 2 - oT, Lpf, oT, 'FLG_PL', PW);
  if (inner) { p.prect(-inner.L / 2, yW + H / 2 - tf - inner.t, inner.L, inner.t, 'FLG_PL', PW); p.prect(-inner.L / 2, yW - H / 2 + tf, inner.L, inner.t, 'FLG_PL', PW); }
  p.prect(-webWid / 2, yW - chum / 2, webWid, chum, 'WEB_PL', PW);
  // 플랜지 볼트 입면 = 측면 육각볼트(머리·너트) — 참조도면 표기
  const iTe = inner?.t ?? 0, fHalfE = (oT + tf + iTe) / 2;
  fPosX.flatMap(x => [x, -x]).forEach(x => {
    boltSide(p, x, yW + H / 2 + (oT - tf - iTe) / 2, fHalfE, true, dia);
    boltSide(p, x, yW - H / 2 - (oT - tf - iTe) / 2, fHalfE, true, dia);
  });
  ([1, -1] as const).forEach(s => webPosX.forEach(wx => webRowY.forEach(wy => boltPlan(p, s * wx, yW + wy, rad))));
  p.line(0, yW - H / 2 - 20, 0, yW + H / 2 + 20, 'MAIN');
  const webYs = [yW + H / 2, yW + chum / 2, ...webRowY.slice().sort((a, b) => b - a).map(y => yW + y), yW - chum / 2, yW - H / 2];
  const DS = isCol ? 1 : -1;   // 세로 치수 배치측: 기둥=우(+) / 보=좌(−) — 지시선(우측)과 좌우 역할 분리
  dimChainV(doc, tM, [...new Set(webYs)].sort((a, b) => b - a), DS * contentHalf, DS * (contentHalf + 46), DS * (contentHalf + 120));
  const webXs = [-webWid / 2, ...webPosX.map(x => -x).sort((a, b) => a - b), -gap / 2, gap / 2, ...webPosX, webWid / 2];
  // 보: 입면 수평치수는 상단(표와 겹침 방지) / 기둥: 기존 하단
  if (isCol) dimChainH(doc, tM, [...new Set(webXs)].sort((a, b) => a - b), yW - H / 2 - oT, yW - H / 2 - oT - 46, yW - H / 2 - oT - 100);
  else dimChainH(doc, tM, [...new Set(webXs)].sort((a, b) => a - b), yW + H / 2 + oT, yW + H / 2 + oT + 46, yW + H / 2 + oT + 100);

  // ── 플랜지 평면도 (yF) : 부재 연장 + 파단선 ──
  ([1, -1] as const).forEach(s => {
    const y = yF + s * outerW / 2;
    p.line(-memHalf, y, -gap / 2, y, 'MAIN'); p.line(gap / 2, y, memHalf, y, 'MAIN');
  });
  breakV(p, -memHalf, yF, outerW / 2); breakV(p, memHalf, yF, outerW / 2);
  p.rect(-Lpf / 2, yF - outerW / 2, Lpf, outerW, 'FLG_PL');
  p.line(-Lpf / 2, yF - tw / 2, Lpf / 2, yF - tw / 2, 'MAIN'); p.line(-Lpf / 2, yF + tw / 2, Lpf / 2, yF + tw / 2, 'MAIN');
  // 필렛(r) 위치 점선
  const fr = sectionByName(r.section)?.r ?? 0;
  if (fr) { p.dline(-Lpf / 2, yF - tw / 2 - fr, Lpf / 2, yF - tw / 2 - fr, 'MAIN'); p.dline(-Lpf / 2, yF + tw / 2 + fr, Lpf / 2, yF + tw / 2 + fr, 'MAIN'); }
  // 내첨판 외곽(점선·안쪽선 포함) — 웨브 양측당 1장, 그 측 볼트열 중심에 폭 inner.w
  const innerCy = [colY.filter(c => c < 0), colY.filter(c => c > 0)].map(a => a.reduce((x, y) => x + y, 0) / a.length);
  if (inner) innerCy.forEach(cy => p.drect(-inner.L / 2, yF + cy - inner.w / 2, inner.L, inner.w, 'FLG_PL'));
  ([1, -1] as const).forEach(s => colY.forEach((cy) => {
    if (!stag) for (let i = 0; i < nHi; i++) boltPlan(p, s * (base + i * fp), yF + cy, rad);
    else { const { off, rows } = stagOf(cy); for (let j = 0; j < rows; j++) boltPlan(p, s * (base + off + j * 90), yF + cy, rad); }
  }));
  const flYs = [outerW / 2, ...[...colY].sort((a, b) => b - a), -outerW / 2].map(y => yF + y);
  dimChainV(doc, tM, [...new Set(flYs)].sort((a, b) => b - a), DS * Lpf / 2, DS * (Lpf / 2 + 46), DS * (Lpf / 2 + 120));
  const flXs = [-Lpf / 2, ...fPosX.map(x => -x).sort((a, b) => a - b), -gap / 2, gap / 2, ...fPosX, Lpf / 2];
  dimChainH(doc, tM, [...new Set(flXs)].sort((a, b) => a - b), yF - outerW / 2, yF - outerW / 2 - 46, yF - outerW / 2 - 100);
  // 내첨판 폭 치수선 — 게이지 치수 체인과 반대측(−DS)에 배치해 중복 회피
  if (inner) {
    const cyT = innerCy[1];
    const ix = -DS * Lpf / 2;
    emitDim(doc, tM, [ix, yF + cyT - inner.w / 2], [ix, yF + cyT + inner.w / 2], [-DS * (Lpf / 2 + 46), 0], `${round(inner.w)}`, true);
  }

  // ── 단면(斷面) 뷰 (보 전용, 입면 우측 상단) ──
  if (!isCol) {
    const posCy = colY.filter(c => c > 0);
    const innerCxAbs = inner && posCy.length ? Math.abs(posCy.reduce((a, b) => a + b, 0) / posCy.length) : 0;
    drawSection(doc, tM, L.secCx, yW, r, { H, B, tw, tf, oT, outerW, chum, colY, webRowY, innerCxAbs, dia, inner });
    // ── 규격표(중단) + 외곽 테두리 : 참조도면 [나의아저씨] 셀. 지시선·상단제목·하단표 없음. ──
    drawSpecTable(pff, F.frameL, F.frameRC, L.tableBot + cdy, L.rowH, titleS, webS, flgExtS, flgIntS);
    pff.rect(F.frameL, F.frameBot, F.frameRC - F.frameL, F.frameTop - F.frameBot, 'MINI_BOX');
    return;
  }

  // ── 지시선(판·볼트) : 앵커는 로컬(오프셋 제외) 좌표 → pf(정립+오프셋)가 한 번만 적용 ──
  // 사무소 종합도(sheet) 모드는 지시선 대신 우측 콜아웃 블록을 사용 → 지시선·표제란 스킵.
  if (!sheet) {
  const tMl = mkXf(L.mOx, L.mOy, L.deg);
  const outerA = pt(tMl, -Lpf / 3, yW + H / 2 + oT), innerA = pt(tMl, -(inner?.L ?? Lpf) / 3, yW + H / 2 - tf - (inner?.t ?? 0) / 2);
  const webA = pt(tMl, -webWid / 2, yW), wbA = pt(tMl, -webWid / 4, yW - chum / 2 + 20), fbA = pt(tMl, -base, yF + g1 / 2);
  // 지시선 텍스트는 도곽 여백에 두되, 콘텐츠 앵커펜(pfc) 기준 로컬로 환산(−cd)해 앵커와 좌표계 일치
  // 지시선 라벨 우측 기준: 보는 단면 뷰 왼쪽(라벨영역)에, 기둥은 도곽 우측에.
  const lx = F.frameL + 70 - cdx;
  const rx = isCol ? (F.frameRC - 70 - cdx) : (L.secCx - Math.max(L.B, L.outerW) / 2 - 60);
  type Lab = { a: [number, number]; txt: string };
  const GAPL = 46;
  // 라벨을 앵커 높이에 맞춰 좌/우 여백에 수직 배치 → 지시선이 거의 수평이 되어 교차·겹침 방지.
  // 앵커 높이 내림차순으로 배치하되, 너무 가까우면(<GAPL) 아래로 밀어 최소 간격 확보.
  const stackAt = (items: Lab[], xText: number) => {
    const sorted = items.slice().sort((p, q) => q.a[1] - p.a[1]);
    let prevY = Infinity;
    for (const it of sorted) {
      let ly = Math.min(it.a[1], F.frameTop - 40 - cdy);
      if (prevY - ly < GAPL) ly = prevY - GAPL;
      leader(pfc, it.a[0], it.a[1], xText, ly, it.txt);
      prevY = ly;
    }
  };
  // 우측 지시선(라벨) 스택 — 우측정렬로 프레임 내 수용, 앵커 높이 정렬 + 넉넉한 간격 분산
  const stackRight = (items: Lab[], gap: number) => {
    const sorted = items.slice().sort((p, q) => q.a[1] - p.a[1]);
    let prevY = Infinity;
    for (const it of sorted) {
      let ly = Math.min(it.a[1], F.frameTop - 40 - cdy);
      if (prevY - ly < gap) ly = prevY - gap;
      const w = it.txt.length * TH * 0.62, tleft = rx - w;
      pfc.dot(it.a[0], it.a[1], 'DIM');
      pfc.line(it.a[0], it.a[1], tleft - 12, ly, 'DIM'); pfc.line(tleft - 12, ly, tleft - 3, ly, 'DIM');
      pfc.text(rx, ly - TH / 2, TH, it.txt, 'DIM', { align: 'r' });
      prevY = ly;
    }
  };
  if (!isCol) {                                   // 보: 지시선 우측(치수 좌측) · 라벨 더 분산
    // H형강 부재 콜아웃 → 좌상단, 평면(상단) 위쪽에 L자 지시선
    const hty = F.frameTop - 52 - cdy;
    const hA = pt(tMl, -memHalf * 0.5, yF + outerW / 2);
    pfc.dot(hA[0], hA[1], 'DIM');
    pfc.line(hA[0], hA[1], lx, hA[1], 'DIM'); pfc.line(lx, hA[1], lx, hty, 'DIM');
    pfc.text(lx, hty - TH / 2, TH, secLbl, 'DIM', { align: 'l' });
    // 판·볼트 라벨 → 입면(하단) 우측 여백, 앵커 높이 정렬(외첨판↑ … 플랜지볼트↓·하부플랜지)
    const oR = pt(tMl, Lpf / 3, yW + H / 2 + oT), iR = pt(tMl, (inner?.L ?? Lpf) / 3, yW + H / 2 - tf - (inner?.t ?? 0) / 2);
    const wR = pt(tMl, webWid / 2, yW), wbR = pt(tMl, webWid / 4, yW - chum / 2 + 20), fbR = pt(tMl, base, yW - H / 2 - oT);
    stackRight([
      { a: oR, txt: outerLbl },
      ...(inner ? [{ a: iR, txt: innerLbl }] : []),
      { a: wR, txt: webLbl },
      { a: wbR, txt: wBoltLbl },
      { a: fbR, txt: flBoltLbl },
    ], 60);
  } else {                                        // 기둥: 좌(웨브)·우(플랜지) 여백에 앵커 높이 정렬
    stackAt([
      { a: webA, txt: webLbl },
      { a: wbA, txt: wBoltLbl },
    ], lx);
    stackAt([
      { a: outerA, txt: outerLbl },
      ...(inner ? [{ a: innerA, txt: innerLbl }] : []),
      { a: fbA, txt: flBoltLbl },
    ], rx);
  }
  }   // ── end if(!sheet): 지시선 블록 ──

  if (sheet) {
    // ── 사무소 종합도 셀: 좌상단 타이틀 + 섹션라벨 + 우측 콜아웃 블록(테두리·표제란 없음) ──
    drawSheetCell(pff, F, secLbl, outerLbl, innerLbl, webLbl, flBoltSheet, wBoltLbl);
    return;
  }

  // ── 외곽 테두리 + 도면 제목(상단 중앙) + 하단 표제란 (SECTION 뷰·NOTES 제거: 참고 도면 규약) ──
  pff.rect(F.frameL, F.frameBot, F.frameR - F.frameL, F.frameTop - F.frameBot, 'MINI_BOX');
  pff.text((F.frameL + F.frameRC) / 2, F.frameTop - 34, TH * 1.3, secLbl, 'DIM', { align: 'c' });
  const bl2 = F.frameL + 6, br2 = F.frameRC - 6, midX = (bl2 + br2) / 2;
  // 표제란 값 — 참고 도면 전체 형식(G.PL. …EA / …-M… H.T.B). 폭은 적응형 폰트(tbe)로 수용.
  const gplT = office ? ((pl: Plate | undefined, n: number) => n === 2 ? (pl === r.web.webPlate ? webLbl : outerLbl) : innerLbl)
    : ((pl: Plate | undefined, n: number) => pl ? `G.PL. ${pl.t}x${pl.w}x${pl.L}x${n}EA` : '-');
  const btbT = (n: number) => office ? (n === wCount ? wBoltLbl : flBoltLbl) : `${n}-M${dia} H.T.B`;
  // 사무소 포맷 주기(romans 폰트 호환 영문)
  if (office) {
    const nx = F.frameL + 10, ny = F.frameTop - 30;
    ['STEEL : ' + cond.steel + ' (U.N.O)', 'BOLT : ' + cond.bolt + ' H.T.B', 'SCALE : 1/20'].forEach((s, i) =>
      pff.text(nx, ny - i * TH * 1.7, TH, s, 'DIM', { align: 'l' }));
  }
  // 라벨 열폭·문자높이를 프레임 폭에 적응(좁은 도곽에서도 겹치지 않도록)
  const maxValLen = Math.max(secLbl.length, jointLbl.length, gplT(r.flange.outerPlate, 2).length, 12);
  const Lw = Math.max(80, Math.min(160, (br2 - bl2) * 0.26));
  const valW = midX - (bl2 + Lw);
  const CW = 0.62;                                          // txt.shx 문자폭 계수
  const tbe = Math.max(10, Math.min(TB, valW / (maxValLen * CW), Lw / (9.5 * CW)));
  const rw = [boxTopE, boxTopE - L.boxRow, boxTopE - 2 * L.boxRow, boxTopE - 3 * L.boxRow, boxTopE - 4 * L.boxRow];
  pff.rect(bl2, rw[4], br2 - bl2, rw[0] - rw[4], 'MINI_BOX');
  for (let i = 1; i < 4; i++) pff.line(bl2, rw[i], br2, rw[i], 'MINI_BOX');
  [bl2 + Lw, midX, midX + Lw].forEach(x => pff.line(x, rw[4], x, rw[0], 'MINI_BOX'));
  const tx = (x: number, ri: number, s: string) => pff.text(x + 8, (rw[ri] + rw[ri + 1]) / 2 - tbe / 2, tbe, s, 'DIM');
  tx(bl2, 0, 'Title'); tx(bl2 + Lw, 0, secLbl); tx(midX, 0, 'Steel'); tx(midX + Lw, 0, cond.steel);
  tx(bl2, 1, 'Web PL.'); tx(bl2 + Lw, 1, gplT(r.web.webPlate, 2)); tx(midX, 1, 'O-Flg PL.'); tx(midX + Lw, 1, gplT(r.flange.outerPlate, 2));
  tx(bl2, 2, 'Web Bolt'); tx(bl2 + Lw, 2, btbT(wCount)); tx(midX, 2, 'I-Flg PL.'); tx(midX + Lw, 2, inner ? gplT(inner, 4) : '-');
  tx(bl2, 3, 'Joint'); tx(bl2 + Lw, 3, jointLbl); tx(midX, 3, 'Flg Bolt'); tx(midX + Lw, 3, btbT(flCount));
}

// 레이어 표준 — 첨부 참조도면(BEAM-SPLICE) 포맷 준수: 이름·색·선종. [name, aci색, 선종].
const LAYERS: [string, number, string][] = [
  ['Steel', 2, 'CONTINUOUS'], ['Steel-Hidden', 2, 'DASHED0'],
  ['Plate', 3, 'CONTINUOUS'], ['Plate-Hidden', 3, 'DASHED0'],
  ['Bolt', 2, 'CONTINUOUS'], ['Bolt-Center', 16, 'DASHDOTDOT0'],   // 볼트=색2(황) — 참조도면 규약
  ['Dimension', 1, 'CONTINUOUS'], ['Dimension(Section)', 16, 'CONTINUOUS'],
  ['Table(Main)', 2, 'CONTINUOUS'], ['Table(Sub)', 7, 'CONTINUOUS'], ['Table(Etc)', 8, 'CONTINUOUS'],
  ['TableText(Head)', 6, 'CONTINUOUS'], ['TableText(RowHead)', 9, 'CONTINUOUS'],
];
// 내부 단축명 → 참조도면 레이어명(단일지점 변환: wrap()에서 전 엔티티 적용).
const LMAP: Record<string, string> = {
  MAIN: 'Steel', HIDDEN: 'Steel-Hidden', FLG_PL: 'Plate', WEB_PL: 'Plate',
  BOLT: 'Bolt', VER_BOLT: 'Bolt', DIM: 'Dimension', SECTION: 'Dimension(Section)',
  MINI_BOX: 'Table(Main)', NOTE: 'Table(Etc)', TEXT: 'TableText(RowHead)', MINI_HEAD: 'TableText(Head)',
};
const LY = (k: string): string => LMAP[k] ?? k;
// 문자 스타일(참조도면): 한글 malgun TrueType — 라벨/주기 한글 렌더. 치수문자는 STANDARD 유지.
const TEXT_STYLE = 'Cell Body';
// _ARCHTICK 화살촉 블록(45° 단위 틱). INSERT scale로 크기 결정
const ARCHTICK_BLOCK = ['0', 'BLOCK', '8', '0', '2', '_ARCHTICK', '70', '0', '10', '0', '20', '0', '30', '0', '3', '_ARCHTICK',
  '0', 'LINE', '8', '0', '10', '-0.5', '20', '-0.5', '30', '0', '11', '0.5', '21', '0.5', '31', '0',
  '0', 'ENDBLK', '8', '0'];
function wrap(doc: Doc): string {
  // STYLE(참조도면): STANDARD(micross)·Table Head(맑은고딕 Bold)·Cell Body(맑은고딕) — 한글 렌더.
  const styleT = ['0', 'TABLE', '2', 'STYLE', '70', '3',
    '0', 'STYLE', '2', 'STANDARD', '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '2.5', '3', 'romans', '4', '',
    '0', 'STYLE', '2', 'Table Head', '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '2.5', '3', 'malgunbd.ttf', '4', '',
    '0', 'STYLE', '2', 'Cell Body', '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '2.5', '3', 'malgun.ttf', '4', ''];
  // VPORT: *ACTIVE 뷰포트(R12 필수 테이블) — 누락 시 엄격한 리더가 파일 거부
  const vportT = ['0', 'TABLE', '2', 'VPORT', '70', '1',
    '0', 'VPORT', '2', '*ACTIVE', '70', '0',
    '10', '0.0', '20', '0.0', '11', '1.0', '21', '1.0',
    '12', '0.0', '22', '0.0', '13', '0.0', '23', '0.0',
    '14', '10.0', '24', '10.0', '15', '10.0', '25', '10.0',
    '16', '0.0', '26', '0.0', '36', '1.0', '17', '0.0', '27', '0.0', '37', '0.0',
    '40', '1000.0', '41', '1.5', '42', '50.0', '43', '0.0', '44', '0.0',
    '50', '0.0', '51', '0.0', '71', '0', '72', '100', '73', '1', '74', '3', '75', '0', '76', '0', '77', '0', '78', '0'];
  const ltT = ['0', 'TABLE', '2', 'LTYPE', '70', '4',
    '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0',
    '0', 'LTYPE', '2', 'HIDDEN', '70', '0', '3', '__ __ __', '72', '65', '73', '2', '40', '30.0', '49', '20.0', '49', '-10.0',
    '0', 'LTYPE', '2', 'DASHED0', '70', '0', '3', '__ __ __', '72', '65', '73', '2', '40', '15.0', '49', '10.0', '49', '-5.0',
    '0', 'LTYPE', '2', 'DASHDOTDOT0', '70', '0', '3', '__ . . __', '72', '65', '73', '4', '40', '20.0', '49', '12.0', '49', '-3.0', '49', '0.0', '49', '-3.0'];
  const layT: string[] = ['0', 'TABLE', '2', 'LAYER', '70', String(LAYERS.length)];
  LAYERS.forEach(([n, c, lt]) => layT.push('0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', lt));
  // DIMSTYLE·DIMENSION 미사용(분해치수) → 해당 테이블 제거로 엄격파서 폐기 원천 차단.
  // 내부 단축 레이어명 → 참조도면 표준 레이어명(단일지점 변환). 엔티티는 code/value 쌍이라 짝수 index=그룹코드.
  const relayer = (arr: string[]) => { for (let i = 0; i + 1 < arr.length; i += 2) if (arr[i] === '8') arr[i + 1] = LY(arr[i + 1]); };
  relayer(doc.e); relayer(doc.blk);
  return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4', '9', '$TEXTSTYLE', '7', 'STANDARD', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', ...vportT, '0', 'ENDTAB', ...ltT, '0', 'ENDTAB', ...layT, '0', 'ENDTAB', ...styleT, '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', ...ARCHTICK_BLOCK, ...doc.blk, '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', ...doc.e, '0', 'ENDSEC', '0', 'EOF'].join('\r\n');   // CRLF: DXF 관례(엄격 파서 호환)
}

export function toDXF(r: DesignResult, cond: DesignCondition): string {
  const doc = newDoc(); emitMember(doc, r, cond, 0, 0); return wrap(doc);
}
// 다중 배치 : JointDetailDWG.exe 규약(도면 1건=도곽 시트) 참고.
// 전 단면의 최대 도곽으로 균일 셀을 만들고 각 상세를 셀 중앙 배치 → 정렬된 시트세트(그리드).
export function placeGrid(rows: DesignResult[], isCol: boolean, emit: (r: DesignResult, ox: number, oy: number) => void) {
  const COLS = 3, GAP = 400;
  const Ls = rows.map(r => layout(r, isCol));
  const maxFW = Math.max(...Ls.map(L => L.frameR - L.frameL));
  const maxFH = Math.max(...Ls.map(L => L.frameTop - L.frameBot));
  const cellW = maxFW + GAP, cellH = maxFH + GAP;
  rows.forEach((r, i) => {
    const L = Ls[i], fw = L.frameR - L.frameL, fh = L.frameTop - L.frameBot;
    const col = i % COLS, row = Math.floor(i / COLS);
    const ox = col * cellW + (cellW - fw) / 2 - L.frameL;      // 셀 내 수평 중앙
    const oy = -row * cellH - (cellH - fh) / 2 - L.frameTop;   // 셀 내 수직 중앙(위→아래)
    emit(r, ox, oy);
  });
}
/** 전 단면의 최대 도곽 산정(모든 상세 공통 테두리) */
export function uniformFrame(rows: DesignResult[], isCol: boolean): UniFrame {
  const Ls = rows.map(r => layout(r, isCol));
  const frameL = Math.min(...Ls.map(L => L.frameL));
  const frameRC = Math.max(...Ls.map(L => L.frameRC));            // 본도면 영역 최대 우측
  const csStrip = Math.max(...Ls.map(L => L.frameR - L.frameRC)); // 단면도 스트립 최대 폭
  const frameTop = Math.max(...Ls.map(L => L.frameTop));
  const frameBot = Math.min(...Ls.map(L => L.frameBot));
  return { frameL, frameRC, frameR: frameRC + csStrip, frameTop, frameBot };
}

/** H형강 깊이(공칭 춤) 시리즈 키 — "H-250" 등. 참조도면 [나의아저씨] 전부재도 열 구분용. */
function seriesDepthKey(r: DesignResult): string {
  const sec = sectionByName(r.section);
  if (sec?.label) { const m = sec.label.match(/^W\d+/i); return m ? m[0].toUpperCase() : sec.label; }
  const { H, B } = parseName(r.section);
  return `H-${nominalOf(H, B).split(/[x×]/)[0]}`;
}
/** 깊이 시리즈별 그룹(등장순 유지, 비연속 안전). */
function groupByDepth(rows: DesignResult[]): { key: string; items: DesignResult[] }[] {
  const order: string[] = [], map = new Map<string, DesignResult[]>();
  for (const r of rows) { const k = seriesDepthKey(r); if (!map.has(k)) { map.set(k, []); order.push(k); } map.get(k)!.push(r); }
  return order.map(k => ({ key: k, items: map.get(k)! }));
}

export function toDXFAll(rows: DesignResult[], cond: DesignCondition, office = false): string {
  const doc = newDoc();
  const isCol = cond.member === '기둥';
  const p = pen(doc, mkXf(0, 0, 0));
  if (isCol) {
    // 기둥: 기존 시리즈-행 그리드 유지
    const uni = uniformFrame(rows, isCol);
    const fw = uni.frameR - uni.frameL, fh = uni.frameTop - uni.frameBot;
    const COLS = 3, GAP = 400, cellW = fw + GAP, cellH = fh + GAP, HHDR = 90;
    let row = 0;
    for (const g of groupBySeries(rows)) {
      const firstRow = row;
      g.items.forEach((r, j) => {
        if (j > 0 && j % COLS === 0) row++;
        const col = j % COLS;
        const ox = col * cellW + GAP / 2 - uni.frameL;
        const oy = -row * cellH - GAP / 2 - uni.frameTop - HHDR;
        emitMember(doc, r, cond, ox, oy, uni, office);
      });
      const hy = -firstRow * cellH - GAP / 2 - uni.frameTop - HHDR + fh + 34;
      p.text(GAP / 2, hy, TH * 1.8, `[ ${g.key} SERIES ]`, 'MINI_HEAD', { align: 'l' });
      row++;
    }
    return wrap(doc);
  }
  // 보: 참조도면 [나의아저씨] — 시리즈(H-춤)별 세로 열, 좌→우 배치. 각 열 상단 헤더 박스.
  const COLGAP = 500, ROWGAP = 340, HHDR = 260;
  let xCur = 0;
  for (const g of groupByDepth(rows)) {
    const uni = uniformFrame(g.items, false);
    const fw = uni.frameR - uni.frameL, fh = uni.frameTop - uni.frameBot;
    const hTop = -20, hBot = -HHDR + 60;                          // 헤더 박스(열 상단)
    p.rect(xCur, hBot, fw, hTop - hBot, 'MINI_BOX');
    p.text(xCur + fw / 2, (hTop + hBot) / 2 - 80, 160, g.key, 'MINI_HEAD', { align: 'c' });
    let yTop = -HHDR;                                             // 첫 셀 frameTop 위치
    for (const r of g.items) {
      emitMember(doc, r, cond, xCur - uni.frameL, yTop - uni.frameTop, uni, office);
      yTop -= fh + ROWGAP;
    }
    xCur += fw + COLGAP;
  }
  return wrap(doc);
}
/**
 * 사무소 종합도 포맷(참조: BEAM-SPLICE.dwg) — 여러 형강을 한 시트에 그리드 배치.
 * 셀마다 "BEAM SPLICE DETAIL / S=1/20 / *.섹션" 타이틀 + 우측 콜아웃(ExT/INT/W-PL·볼트) 블록.
 * 상단에 공통 주기(강종·볼트·Fy·축척). 치수·물량은 현 앱 계산값(W 오버행 캡 반영) 그대로.
 */
export function toDXFSheet(rows: DesignResult[], cond: DesignCondition): string {
  const doc = newDoc();
  const isCol = cond.member === '기둥';
  const uni = uniformFrame(rows, isCol);
  const fw = uni.frameR - uni.frameL, fh = uni.frameTop - uni.frameBot;
  const CALLOUT_W = 420;                                  // 우측 콜아웃 블록 폭
  const COLS = 4, GAP = 520, HHDR = 100;
  const cellW = fw + CALLOUT_W + GAP, cellH = fh + GAP;
  const p = pen(doc, mkXf(0, 0, 0));
  let row = 0;
  for (const g of groupBySeries(rows)) {                  // 시리즈별로 행 분리 + 헤더
    const firstRow = row;
    g.items.forEach((r, j) => {
      if (j > 0 && j % COLS === 0) row++;
      const col = j % COLS;
      const ox = col * cellW + GAP / 2 - uni.frameL;
      const oy = -row * cellH - GAP / 2 - uni.frameTop - HHDR;
      emitMember(doc, r, cond, ox, oy, uni, true, true);  // office + sheet
    });
    const hy = -firstRow * cellH - GAP / 2 - uni.frameTop - HHDR + fh + 44;
    p.text(GAP / 2, hy, TH * 2.0, `[ ${g.key} SERIES ]`, 'MINI_HEAD', { align: 'l' });
    row++;
  }
  const nRows = row;
  // ── 시트 상단 공통 주기 + 전체 외곽 테두리 ──
  const sheetW = COLS * cellW, sheetTop = -GAP / 2 + 40, sheetBot = -nRows * cellH - GAP / 2 + (cellH - fh) / 2 - 60;
  const fy = Fy(cond.steel, 20);
  const notes = [
    '*. STEEL : ' + cond.steel + '  BOLT : ' + cond.bolt + ' H.T.B  SCALE : 1/20',
    '*. 철골의 강도 (' + cond.steel + ')   Fy = ' + fy + ' N/mm^2',
  ];
  notes.forEach((s, i) => p.text(GAP / 2, sheetTop + 220 - i * TH * 1.8, TH * 1.2, s, i === 0 ? 'MAIN' : 'NOTE', { align: 'l' }));
  p.rect(GAP / 4, sheetBot, sheetW - GAP / 2, sheetTop + 320 - sheetBot, 'MINI_BOX');
  return wrap(doc);
}
/** 사무소 표준 포맷 별칭 — 앱 "전체 DXF 다운로드(사무소 표준 포맷)" 버튼.
 *  보: 참조도면 [나의아저씨] 시리즈-열 전부재도(toDXFAll)와 동일. */
export const toDXFAll2 = (rows: DesignResult[], cond: DesignCondition): string => toDXFAll(rows, cond);
export function downloadFile(filename: string, content: string | ArrayBuffer, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
