// DXF 생성기 — JointDetailDWG.exe(12=보이음/13=기둥이음) 도면 표현 규약 재현. 계산엔진 무관(결과만 소비).
// 정식 DIMENSION(+지오메트리 블록)·이중치수·지시선(원형머리)·romans 스타일·레이어(MAIN/FLG_PL/WEB_PL/BOLT/VER_BOLT/DIM/MINI_BOX)
// ·부재연장+파단선·외곽테두리·MINI_BOX 정보표. 보=가로배치, 기둥=세로배치(90° 회전). 단위 mm.
import type { DesignResult, DesignCondition, Plate } from './types.ts';
import { parseName, sectionByName } from './sections.ts';
import { BOLT_HOLE, boltNameByDia } from './bolts.ts';

const round = Math.round;
const TH = 20;   // 도면 문자높이
const TB = 24;   // 정보표 문자높이(셀폭 150 내 라벨 수용 — 겹침 방지)
const FONT = 'STANDARD';  // 표준 텍스트 스타일(txt.shx 기반) — 특정 폰트 미설치 PC에서도 열리도록 이식성 확보
const ARROW = 5.0;                        // exe DIMSTYLE dimasz(41) = _ARCHTICK INSERT scale
const PW = 4;                             // 입면 첨판 두꺼운 선 폭(POLYLINE width)

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
const gpl = (pl: Plate | undefined, n: number) => pl ? `G.PL. ${pl.t}x${pl.w}x${pl.L}x${n}EA` : '-';

// H형강 단면 그리기(필렛 R 반영) — 중심 (cx,cy), 직선 외곽 + 4개 필렛 ARC
function hSection(p: Pen, cx: number, cy: number, H: number, B: number, tw: number, tf: number, r: number, lay: string) {
  const b = B / 2, h = H / 2, w = tw / 2, yi = h - tf;   // yi: 플랜지 안쪽면
  const X = (x: number) => cx + x, Y = (y: number) => cy + y;
  const rr = Math.min(r, yi - 1, b - w - 1);              // 안전 반경(치수 초과 방지)
  p.line(X(-b), Y(h), X(b), Y(h), lay);                  // 상단 플랜지 윗변
  p.line(X(b), Y(h), X(b), Y(yi), lay);                  // 우상 플랜지 옆변
  p.line(X(b), Y(yi), X(w + rr), Y(yi), lay);            // 우상 플랜지 밑면
  p.arc(X(w + rr), Y(yi - rr), rr, 90, 180, lay);        // 우상 필렛
  p.line(X(w), Y(yi - rr), X(w), Y(-(yi - rr)), lay);    // 우측 웨브면
  p.arc(X(w + rr), Y(-(yi - rr)), rr, 180, 270, lay);    // 우하 필렛
  p.line(X(w + rr), Y(-yi), X(b), Y(-yi), lay);          // 우하 플랜지 윗면
  p.line(X(b), Y(-yi), X(b), Y(-h), lay);                // 우하 플랜지 옆변
  p.line(X(b), Y(-h), X(-b), Y(-h), lay);                // 하단 플랜지 아랫변
  p.line(X(-b), Y(-h), X(-b), Y(-yi), lay);              // 좌하 플랜지 옆변
  p.line(X(-b), Y(-yi), X(-(w + rr)), Y(-yi), lay);      // 좌하 플랜지 윗면
  p.arc(X(-(w + rr)), Y(-(yi - rr)), rr, 270, 360, lay); // 좌하 필렛
  p.line(X(-w), Y(-(yi - rr)), X(-w), Y(yi - rr), lay);  // 좌측 웨브면
  p.arc(X(-(w + rr)), Y(yi - rr), rr, 0, 90, lay);       // 좌상 필렛
  p.line(X(-(w + rr)), Y(yi), X(-b), Y(yi), lay);        // 좌상 플랜지 밑면
  p.line(X(-b), Y(yi), X(-b), Y(h), lay);                // 좌상 플랜지 옆변(닫힘)
  p.line(X(0), Y(-h - 12), X(0), Y(h + 12), 'MAIN');     // 중심선(웨브)
}

export function layout(r: DesignResult, isCol: boolean) {
  const { H, B, tw, tf } = parseName(r.section);
  const csStrip = B + 120;                        // 우측 단면도 영역 폭
  const oT = r.flange.outerPlate?.t ?? 9;
  const Lpf = r.flange.outerPlate?.L ?? 300, outerW = r.flange.outerPlate?.w ?? 200;
  const wB = r.web.bolt;
  const gap = r.flange.gap ?? 10, base = gap / 2 + 40;
  const webWid = r.web.webPlate?.L ?? 170;
  const webL = Math.max(webWid, 2 * (base + (wB.n - 1) * 60) + 40) + 40;
  const contentHalf = Math.max(Lpf, webL) / 2;
  const hf = outerW / 2, hw = H / 2 + oT;
  const yF = 0, yW = yF + hf + 120 + 90 + hw;
  const ext = Math.max(H, 300), memHalf = Lpf / 2 + ext;
  // 부재(로컬) 대략 범위
  const locYmax = yW + hw + 30, locYmin = yF - hf - 120;
  const halfLen = memHalf + 20;                 // 부재 길이 반(display 세로/가로)
  const halfView = (locYmax - locYmin) / 2;     // 두 뷰 스프레드 반
  const boxRow = 54;
  if (!isCol) {
    // 보: 가로부재, 뷰 상하 스택. display = local.
    const boxTop = yF - hf - 210, boxBot = boxTop - boxRow * 4;
    const boxHalf = Math.max(memHalf, 500) + 20;
    const frameRC = boxHalf + 10, frameTop = yW + hw + 130, frameBot = boxBot - 16;
    return {
      H, B, tw, tf, oT, Lpf, outerW, webWid, contentHalf, hf, hw, gap, base, yF, yW, memHalf, boxRow,
      mOx: 0, mOy: 0, deg: 0,
      boxTop, boxBot, frameL: -boxHalf - 10, frameRC, frameR: frameRC + csStrip, frameTop, frameBot,
      csCx: frameRC + csStrip / 2, csCy: (frameTop + frameBot) / 2,
    };
  }
  // 기둥: 세로부재. display x = -localY + mOx(뷰 좌우), display y = localX(부재 세로).
  const mOx = (locYmax + locYmin) / 2;
  const dispHW = halfView + 40;                 // 프레임 가로 반
  const boxTop = -halfLen - 40, boxBot = boxTop - boxRow * 4;
  const frameRC = dispHW + 10, frameTop = halfLen + 40, frameBot = boxBot - 16;
  return {
    H, B, tw, tf, oT, Lpf, outerW, webWid, contentHalf, hf, hw, gap, base, yF, yW, memHalf, boxRow,
    mOx, mOy: 0, deg: 90,
    boxTop, boxBot, frameL: -dispHW - 10, frameRC, frameR: frameRC + csStrip, frameTop, frameBot,
    csCx: frameRC + csStrip / 2, csCy: (frameTop + frameBot) / 2,
  };
}

export function emitMember(doc: Doc, r: DesignResult, cond: DesignCondition, ox: number, oy: number, uni?: UniFrame) {
  const isCol = cond.member === '기둥';
  const L = layout(r, isCol);
  // 통일 도곽(uni) 사용 시: 테두리·표제·단면도는 도곽(F) 좌표, 콘텐츠는 도곽 중앙에 오도록 cd만큼 이동.
  const F: UniFrame = uni ?? { frameL: L.frameL, frameRC: L.frameRC, frameR: L.frameR, frameTop: L.frameTop, frameBot: L.frameBot };
  const cdx = uni ? ((F.frameL + F.frameRC) / 2 - (L.frameL + L.frameRC) / 2) : 0;
  const cdy = uni ? ((F.frameTop + F.frameBot) / 2 - (L.frameTop + L.frameBot) / 2) : 0;
  const csCx = uni ? F.frameRC + (F.frameR - F.frameRC) / 2 : L.csCx;
  const csCy = uni ? (F.frameTop + F.frameBot) / 2 : L.csCy;
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
  const grade = cond.bolt;                                   // 볼트 등급(F10T·A490 등) — NOTES에 명기
  const btb = (n: number) => `${n}-M${dia} H.T.B`;           // 지시선 볼트 콜아웃(등급은 NOTES)
  const flCount = fB.m * round(fB.n) * 4, wCount = wB.m * wB.n * 2;
  const B = parseName(r.section).B;
  const secLbl = `H-${H}x${B}x${tw}x${tf}`;
  // 정보표 영문화(exe 폰트 OpenSansCondensed엔 한글 글리프 없음 → CAD 깨짐 방지)
  const jointLbl = `${cond.member === '기둥' ? 'Column' : 'Beam'} ${cond.jointType === '지압' ? 'Bearing' : 'Friction'}`;

  const colY = fB.m === 2 ? [-g1 / 2, g1 / 2] : [-(g1 / 2 + g2), -g1 / 2, g1 / 2, g1 / 2 + g2];
  const nHi = Math.ceil(fB.n), nLo = Math.floor(fB.n);
  const fp = r.flange.pitch ?? 60, wp = r.web.pitch ?? 60;   // 엔진 피치(Custom 대구경 상향)
  const fBolts: { x: number; y: number }[] = [];
  ([1, -1] as const).forEach(s => colY.forEach((cy, ci) => {
    if (!stag) for (let i = 0; i < nHi; i++) fBolts.push({ x: s * (base + i * fp), y: cy });
    else { const off = ci % 2 ? 45 : 0, rows = ci % 2 ? nLo : nHi; for (let j = 0; j < rows; j++) fBolts.push({ x: s * (base + off + j * 90), y: cy }); }
  }));
  const fPosX = [...new Set(fBolts.filter(b => b.x > 0).map(b => b.x))].sort((a, b) => a - b);
  const chum = r.web.webPlate?.w ?? 140, Pc = r.web.Pc ?? 60;
  const webOff = (r.web.staggered ?? false) ? 30 : 0;   // 웨브볼트 절반피치 엇갈림(체결 간섭 회피)
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
  fPosX.flatMap(x => [x, -x]).forEach(x => {
    p.line(x, yW + H / 2 + oT, x, yW + H / 2 - tf - (inner?.t ?? 0), 'VER_BOLT');
    p.line(x, yW - H / 2 - oT, x, yW - H / 2 + tf + (inner?.t ?? 0), 'VER_BOLT');
  });
  ([1, -1] as const).forEach(s => webPosX.forEach(wx => webRowY.forEach(wy => boltPlan(p, s * wx, yW + wy, rad))));
  p.line(0, yW - H / 2 - 20, 0, yW + H / 2 + 20, 'MAIN');
  const webYs = [yW + H / 2, yW + chum / 2, ...webRowY.slice().sort((a, b) => b - a).map(y => yW + y), yW - chum / 2, yW - H / 2];
  dimChainV(doc, tM, [...new Set(webYs)].sort((a, b) => b - a), contentHalf, contentHalf + 46, contentHalf + 120);
  const webXs = [-webWid / 2, ...webPosX.map(x => -x).sort((a, b) => a - b), -gap / 2, gap / 2, ...webPosX, webWid / 2];
  dimChainH(doc, tM, [...new Set(webXs)].sort((a, b) => a - b), yW - H / 2 - oT, yW - H / 2 - oT - 46, yW - H / 2 - oT - 100);

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
  ([1, -1] as const).forEach(s => colY.forEach((cy, ci) => {
    if (!stag) for (let i = 0; i < nHi; i++) boltPlan(p, s * (base + i * fp), cy, rad);
    else { const off = ci % 2 ? 45 : 0, rows = ci % 2 ? nLo : nHi; for (let j = 0; j < rows; j++) boltPlan(p, s * (base + off + j * 90), cy, rad); }
  }));
  const flYs = [outerW / 2, ...[...colY].sort((a, b) => b - a), -outerW / 2].map(y => yF + y);
  dimChainV(doc, tM, [...new Set(flYs)].sort((a, b) => b - a), Lpf / 2, Lpf / 2 + 46, Lpf / 2 + 120);
  const flXs = [-Lpf / 2, ...fPosX.map(x => -x).sort((a, b) => a - b), -gap / 2, gap / 2, ...fPosX, Lpf / 2];
  dimChainH(doc, tM, [...new Set(flXs)].sort((a, b) => a - b), yF - outerW / 2, yF - outerW / 2 - 46, yF - outerW / 2 - 100);
  // 내첨판 폭 치수선(좌측) — inner.w (양측 중 +측 중심)
  if (inner) {
    const cyT = innerCy[1];
    emitDim(doc, tM, [-Lpf / 2, yF + cyT - inner.w / 2], [-Lpf / 2, yF + cyT + inner.w / 2], [-Lpf / 2 - 46, 0], `${round(inner.w)}`, true);
  }

  // ── 지시선(판·볼트) : 앵커는 로컬(오프셋 제외) 좌표 → pf(정립+오프셋)가 한 번만 적용 ──
  const tMl = mkXf(L.mOx, L.mOy, L.deg);
  const outerA = pt(tMl, -Lpf / 3, yW + H / 2 + oT), innerA = pt(tMl, -(inner?.L ?? Lpf) / 3, yW + H / 2 - tf - (inner?.t ?? 0) / 2);
  const webA = pt(tMl, -webWid / 2, yW), wbA = pt(tMl, -webWid / 4, yW - chum / 2 + 20), fbA = pt(tMl, -base, yF + g1 / 2);
  // 지시선 텍스트는 도곽 여백에 두되, 콘텐츠 앵커펜(pfc) 기준 로컬로 환산(−cd)해 앵커와 좌표계 일치
  const lx = F.frameL + 70 - cdx, rx = F.frameRC - 70 - cdx;
  if (!isCol) {                                   // 보: 좌측 여백 스택
    let ly = F.frameTop - 70 - cdy;
    const put = (a: [number, number], txt: string) => { leader(pfc, a[0], a[1], lx, ly, txt); ly -= 62; };
    put(outerA, gpl(r.flange.outerPlate, 2));
    if (inner) put(innerA, gpl(inner, 4));
    put(webA, gpl(r.web.webPlate, 2));
    put(wbA, btb(wCount));
    put(fbA, btb(flCount));
  } else {                                        // 기둥: 좌(웨브)·우(플랜지) 여백에 수직 스택(겹침 방지)
    let lyL = F.frameTop - 100 - cdy;
    const putL = (a: [number, number], txt: string) => { leader(pfc, a[0], a[1], lx, lyL, txt); lyL -= 62; };
    putL(webA, gpl(r.web.webPlate, 2));
    putL(wbA, btb(wCount));
    let lyR = F.frameTop - 100 - cdy;
    const putR = (a: [number, number], txt: string) => { leader(pfc, a[0], a[1], rx, lyR, txt); lyR -= 62; };
    putR(outerA, gpl(r.flange.outerPlate, 2));
    if (inner) putR(innerA, gpl(inner, 4));
    putR(fbA, btb(flCount));
  }

  // ── 외곽 테두리 + 단면라벨 + 하단 MINI_BOX(도곽 좌표) + 우측 단면도 ──
  pff.rect(F.frameL, F.frameBot, F.frameR - F.frameL, F.frameTop - F.frameBot, 'MINI_BOX');
  pff.line(F.frameRC, F.frameBot, F.frameRC, F.frameTop, 'MINI_BOX');   // 본도면/단면도 구분선
  pff.text((F.frameL + F.frameRC) / 2, F.frameTop - 34, TH * 1.2, secLbl, 'DIM', { align: 'c' });
  // 우측 단면도 : H형강 단면(필렛 R 반영)
  hSection(pff, csCx, csCy, H, B, tw, tf, fr, 'MAIN');
  pff.text(csCx, csCy + H / 2 + 40, TH * 1.2, 'SECTION', 'DIM', { align: 'c' });
  pff.text(csCx, csCy - H / 2 - 56, TH, secLbl, 'DIM', { align: 'c' });
  const bl2 = F.frameL + 6, br2 = F.frameRC - 6, midX = (bl2 + br2) / 2;
  // 표제란 값 — 참고 도면 전체 형식(G.PL. …EA / …-M… H.T.B). 폭은 적응형 폰트(tbe)로 수용.
  const gplT = (pl: Plate | undefined, n: number) => pl ? `G.PL. ${pl.t}x${pl.w}x${pl.L}x${n}EA` : '-';
  const btbT = (n: number) => `${n}-M${dia} H.T.B`;
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

  // ── 디테일러 노트(우측 단면도 스트립 하단, 정립) — 볼트·구멍·연단·피치·갭·기준 ──
  const fEdge = r.flange.edge ?? 40, fPitchN = r.flange.pitch ?? 60;
  const std = cond.designStd === 'AISC' ? 'AISC 360-16 LRFD' : 'KBC-09 LSD';
  const notes = [
    'NOTES',
    `1. BOLT: M${dia} ${grade} H.T.B,  HOLE DIA ${hole} STD`,
    `2. ${cond.jointType === '지압' ? 'BEARING-TYPE JOINT' : 'SLIP-CRITICAL, FAYING CLASS B (u=0.50)'}`,
    `3. EDGE ${fEdge}  PITCH ${fPitchN}  GAP ${gap}  (mm)`,
    `4. DESIGN: ${std}`,
  ];
  notes.forEach((s, i) => pff.text(F.frameRC + 16, F.frameBot + 44 + (notes.length - 1 - i) * 30, i === 0 ? TH : TH * 0.85, s, 'DIM', { align: 'l' }));
}

const LAYERS: [string, number][] = [['MAIN', 7], ['FLG_PL', 3], ['WEB_PL', 4], ['BOLT', 6], ['VER_BOLT', 1], ['DIM', 7], ['MINI_BOX', 7]];
// _ARCHTICK 화살촉 블록(45° 단위 틱). INSERT scale로 크기 결정
const ARCHTICK_BLOCK = ['0', 'BLOCK', '8', '0', '2', '_ARCHTICK', '70', '0', '10', '0', '20', '0', '30', '0', '3', '_ARCHTICK',
  '0', 'LINE', '8', '0', '10', '-0.5', '20', '-0.5', '30', '0', '11', '0.5', '21', '0.5', '31', '0',
  '0', 'ENDBLK', '8', '0'];
function wrap(doc: Doc): string {
  // STYLE: 단일 STANDARD 스타일(SHX 'romans' — AutoCAD/호환 CAD 표준 내장 로만 심플렉스).
  const styleT = ['0', 'TABLE', '2', 'STYLE', '70', '1',
    '0', 'STYLE', '2', 'STANDARD', '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '2.5', '3', 'romans', '4', ''];
  // VPORT: *ACTIVE 뷰포트(R12 필수 테이블) — 누락 시 엄격한 리더가 파일 거부
  const vportT = ['0', 'TABLE', '2', 'VPORT', '70', '1',
    '0', 'VPORT', '2', '*ACTIVE', '70', '0',
    '10', '0.0', '20', '0.0', '11', '1.0', '21', '1.0',
    '12', '0.0', '22', '0.0', '13', '0.0', '23', '0.0',
    '14', '10.0', '24', '10.0', '15', '10.0', '25', '10.0',
    '16', '0.0', '26', '0.0', '36', '1.0', '17', '0.0', '27', '0.0', '37', '0.0',
    '40', '1000.0', '41', '1.5', '42', '50.0', '43', '0.0', '44', '0.0',
    '50', '0.0', '51', '0.0', '71', '0', '72', '100', '73', '1', '74', '3', '75', '0', '76', '0', '77', '0', '78', '0'];
  const ltT = ['0', 'TABLE', '2', 'LTYPE', '70', '2',
    '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0',
    '0', 'LTYPE', '2', 'HIDDEN', '70', '0', '3', '__ __ __', '72', '65', '73', '2', '40', '30.0', '49', '20.0', '49', '-10.0'];
  const layT: string[] = ['0', 'TABLE', '2', 'LAYER', '70', String(LAYERS.length)];
  LAYERS.forEach(([n, c]) => layT.push('0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', 'CONTINUOUS'));
  // DIMSTYLE·DIMENSION 미사용(분해치수) → 해당 테이블 제거로 엄격파서 폐기 원천 차단.
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

export function toDXFAll(rows: DesignResult[], cond: DesignCondition): string {
  const doc = newDoc();
  const isCol = cond.member === '기둥';
  const uni = uniformFrame(rows, isCol);                          // 가장 큰 형강 기준 통일 도곽
  const fw = uni.frameR - uni.frameL, fh = uni.frameTop - uni.frameBot;
  const COLS = 3, GAP = 400, cellW = fw + GAP, cellH = fh + GAP;
  rows.forEach((r, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const ox = col * cellW + GAP / 2 - uni.frameL;                // 통일 도곽을 셀에 정렬 배치
    const oy = -row * cellH - GAP / 2 - uni.frameTop;
    emitMember(doc, r, cond, ox, oy, uni);                        // 각 상세를 통일 도곽 중앙에
  });
  return wrap(doc);
}
export function downloadFile(filename: string, content: string | ArrayBuffer, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
