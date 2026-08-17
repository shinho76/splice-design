// ─────────────────────────────────────────────────────────────────────────
// 블록전단 파단선 SVG 생성 — 3 샘플 × 4 요소 뷰
//   샘플: H-450x200(플랜지 1열) · H-700x300(엇모) · H-400x400(2열)
//   뷰 : ①외부 이음판 평면 ②내부 이음판 평면(WEB SECTION) ③부재 평면 ④웨브 이음판 입면
//   표기: 탈락블록 해치 · 전단면(빨강 실선 S) · 인장면(파랑 점선 T) · 하중화살표 · H형강 컨텍스트
//   기하는 엔진(aiscOptimize)의 실제 bsGeom·지배 Path를 그대로 사용(검토와 동일).
// ─────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync } from 'node:fs';
import { sectionByName, parseName } from '../src/engine/sections.ts';
import { designConnection } from '../src/engine/engine.ts';
import { aiscOptimize } from '../src/engine/aisc/optimize.ts';

const OUT = new URL('../docs/파단선/samples/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const C = { SHEAR: '#d1495b', TEN: '#2c6fbb', BLKF: '#f5b847', BLKS: '#e0a92e',
  HOLE: '#8b93a0', PLATE: '#5b6675', LOAD: '#12a794', INK: '#2b3038', WEB: '#d7dbe2', PLATEF: '#f1f3f7', SUB: '#6b7280' };

const base = {
  member: '보', jointType: '마찰', steel: 'SN355', plateSteel: 'SM355', bolt: 'F10T',
  strengthRatio: 1.0, sectionType: '압연', gap: 10, designStd: 'AISC', threadCond: 'N',
  profile: 'H', sectionSet: 'all', equalPlateT: true, plateShare: '5050', bsShare: 'balanced',
};
const SAMPLES = [
  { name: 'H-450x200x9x14', dia: 20, noStagger: true, tag: '플랜지 1열배치', slug: 'H450-1row' },
  { name: 'H-700x300x13x24', dia: undefined, noStagger: false, tag: '플랜지 엇모배치', slug: 'H700-stag' },
  { name: 'H-400x400x13x21', dia: undefined, noStagger: true, tag: '플랜지 2열배치', slug: 'H400-2row' },
];

// ── 기하 헬퍼(CheckFig 포팅) ────────────────────────────────────────────────
function stagOf(cv, g) {
  const maxAbs = Math.max(...g.cols.map(v => Math.abs(v)));
  const isOut = Math.abs(cv) >= maxAbs - 0.5;
  const rows = g.staggered ? (isOut ? (g.nHi ?? g.nrow) : (g.nLo ?? g.nrow)) : g.nrow;
  const off = (g.staggered && !isOut) ? 45 : 0;
  const pit = g.staggered ? 90 : g.pitch;
  return { rows, off, pit, Lv: g.edge + off + Math.max(0, rows - 1) * pit };
}
function fracture(key, cols, hw) {
  const absC = cols.map(v => Math.abs(v));
  const xOut = Math.max(...absC);
  const posAbs = absC.filter(v => v > 0.1);
  const xIn = posAbs.length ? Math.min(...posAbs) : xOut;
  switch (key) {
    case 'U2a': return { shearYs: [-xOut, xOut], tenLo: -xOut, tenHi: xOut };
    case 'U2b': return { shearYs: xIn > 0.1 ? [-xIn, xIn] : [-xOut, xOut], tenLo: -hw, tenHi: hw };
    case 'B3': return { shearYs: [-xOut, -xIn, xIn, xOut], tenLo: -xOut, tenHi: xOut };
    case 'webV': return cols.length >= 2 ? { shearYs: [-xOut, xOut], tenLo: -xOut, tenHi: xOut } : { shearYs: [xOut], tenLo: xOut, tenHi: hw };
    default: return { shearYs: [xOut], tenLo: xOut, tenHi: hw };
  }
}

// ── SVG 프리미티브 ──────────────────────────────────────────────────────────
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.fs ?? 12}" font-weight="${o.fw ?? 400}" fill="${o.fill ?? C.INK}" text-anchor="${o.a ?? 'start'}"${o.ff ? ` font-family="${o.ff}"` : ''}>${esc(s)}</text>`;
const L = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.s ?? C.INK}" stroke-width="${o.w ?? 1}"${o.d ? ` stroke-dasharray="${o.d}"` : ''}${o.cap ? ` stroke-linecap="${o.cap}"` : ''}/>`;
const RC = (x, y, w, h, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.f ?? 'none'}" stroke="${o.s ?? 'none'}" stroke-width="${o.w ?? 1}"${o.d ? ` stroke-dasharray="${o.d}"` : ''}/>`;

// 폴리곤을 45° 대각선 해치로 채움 — 해치선을 폴리곤에 해석적 클리핑(모든 뷰어 호환)
function ptInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function segInterT(ax, ay, bx, by, cx, cy, dx, dy) { // AB ∩ CD → t along AB (0..1) 또는 null
  const r1 = bx - ax, r2 = by - ay, s1 = dx - cx, s2 = dy - cy;
  const den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * s2 - (cy - ay) * s1) / den;
  const u = ((cx - ax) * r2 - (cy - ay) * r1) / den;
  return (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) ? t : null;
}
function hatchPoly(points, fill, stroke) {
  const poly = points.split(' ').map(p => p.split(',').map(Number));
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let g = `<polygon points="${points}" fill="${fill}" fill-opacity="0.20"/>`;
  const spacing = 8.5; // 45° 선 간 c-간격(≈6px 시각 간격)
  for (let c = x0 - (y1 - y0); c <= x1; c += spacing) {
    const Ax = c + y0, Ay = y0, Bx = c + y1, By = y1; // 선: x = y + c
    const ts = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const t = segInterT(Ax, Ay, Bx, By, poly[i][0], poly[i][1], poly[j][0], poly[j][1]);
      if (t != null) ts.push(t);
    }
    if (ts.length < 2) continue;
    ts.sort((a, b) => a - b);
    for (let k = 0; k < ts.length - 1; k++) {
      const tm = (ts[k] + ts[k + 1]) / 2, mx = Ax + (Bx - Ax) * tm, my = Ay + (By - Ay) * tm;
      if (!ptInPoly(mx, my, poly)) continue;
      const p0x = Ax + (Bx - Ax) * ts[k], p0y = Ay + (By - Ay) * ts[k];
      const p1x = Ax + (Bx - Ax) * ts[k + 1], p1y = Ay + (By - Ay) * ts[k + 1];
      g += `<line x1="${p0x.toFixed(1)}" y1="${p0y.toFixed(1)}" x2="${p1x.toFixed(1)}" y2="${p1y.toFixed(1)}" stroke="${stroke}" stroke-width="0.9" opacity="0.6"/>`;
    }
  }
  g += `<polygon points="${points}" fill="none" stroke="${stroke}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
  return g;
}

// 공통 파단선 오버레이(전단·인장·탈락블록·볼트·하중) — map:(u,v)->[x,y], vertical=웨브
function overlay(g, gov, map, opt = {}) {
  const key = gov.key || 'L1';
  const f = fracture(key, g.cols, g.halfWidth);
  const br = Math.max(3.2, (g.dh / 2) * opt.sc);
  const onShear = v => f.shearYs.some(s => Math.abs(s - v) < 0.1);
  const uAt = v => {
    const col = g.cols.find(cc => Math.abs(cc - v) < 0.5);
    if (col !== undefined) return stagOf(col, g).Lv;
    const near = f.shearYs.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, f.shearYs[0]);
    return stagOf(near, g).Lv;
  };
  const spanVs = [f.tenLo, ...g.cols.filter(cc => cc > f.tenLo + 0.1 && cc < f.tenHi - 0.1), f.tenHi].sort((a, b) => a - b);
  const tenNodes = spanVs.map(v => [uAt(v), v]);
  const blockPts = [map(0, f.tenLo), ...tenNodes.map(([u, v]) => map(u, v)), map(0, f.tenHi)].map(p => p.join(',')).join(' ');
  const tenPts = tenNodes.map(([u, v]) => map(u, v).join(',')).join(' ');
  let s = '';
  // 탈락 블록(해치) — 이식성 위해 clipPath + 명시적 대각선(패턴 미지원 뷰어 대응)
  s += hatchPoly(blockPts, C.BLKF, C.BLKS);
  // 볼트
  for (const cv of g.cols) { const { rows, off, pit } = stagOf(cv, g); for (let i = 0; i < rows; i++) { const [bx, by] = map(g.edge + off + i * pit, cv); s += `<circle cx="${bx}" cy="${by}" r="${br}" fill="none" stroke="${onShear(cv) ? C.INK : C.HOLE}" stroke-width="${onShear(cv) ? 1.6 : 1}"/>`; } }
  // 전단면(빨강 실선)
  for (const v of f.shearYs) { const Lv = stagOf(v, g).Lv; const [x1, y1] = map(0, v), [x2, y2] = map(Lv, v); s += L(x1, y1, x2, y2, { s: C.SHEAR, w: 3, cap: 'round' }); }
  // 인장면(파랑 점선)
  s += `<polyline points="${tenPts}" fill="none" stroke="${C.TEN}" stroke-width="3" stroke-dasharray="6 4" stroke-linecap="round" stroke-linejoin="round"/>`;
  // S/T 라벨
  const sv0 = f.shearYs[0]; const [sLx, sLy] = map(stagOf(sv0, g).Lv * 0.45, sv0);
  const tMidV = (f.tenLo + f.tenHi) / 2; const [tLx, tLy] = map(uAt(tMidV), tMidV);
  s += `<circle cx="${sLx}" cy="${sLy}" r="8.5" fill="#fff" stroke="${C.SHEAR}" stroke-width="1.2"/>` + T(sLx, sLy + 4, 'S', { fs: 11, fw: 800, fill: C.SHEAR, a: 'middle' });
  const [toX, toY] = opt.vertical ? [tLx, tLy + 16] : [tLx + 14, tLy];
  s += `<circle cx="${toX}" cy="${toY}" r="8.5" fill="#fff" stroke="${C.TEN}" stroke-width="1.2"/>` + T(toX, toY + 4, 'T', { fs: 11, fw: 800, fill: C.TEN, a: 'middle' });
  return s;
}

// ── 플랜지 평면 뷰(u=길이/하중 수평, v=폭 수직, 갭=좌측 u=0) ─────────────────
function flangePlan(g, gov, meta) {
  const W = 540, Hs = 348, padL = 96, padR = 56, padT = 80, padB = 76;
  const LvMax = Math.max(g.edge, ...g.cols.map(cv => stagOf(cv, g).Lv));
  const lenTot = LvMax + g.edge, widTot = 2 * g.halfWidth;
  const sc = Math.min((W - padL - padR) / lenTot, (Hs - padT - padB) / widTot);
  const u0 = padL, vc = padT + (Hs - padT - padB) / 2;
  const map = (u, v) => [u0 + u * sc, vc - v * sc];
  const hw = g.halfWidth;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hs}" font-family="'Segoe UI',system-ui,sans-serif">`;
  s += defs();
  s += T(16, 26, meta.title, { fs: 15, fw: 800 });
  s += T(16, 44, meta.sub, { fs: 11.5, fill: C.SUB });
  // 판 외곽
  const [px, py] = map(0, hw), pw = lenTot * sc, ph = widTot * sc;
  s += RC(px, py, pw, ph, { s: gov.gov ? C.BLKS : C.PLATE, w: gov.gov ? 2 : 1.4, f: C.PLATEF });
  // 웨브 CL / WEB SECTION 표기
  if (meta.webCL) { const [w1] = map(0, 0), [w2] = map(lenTot, 0); s += L(w1, vc, w2, vc, { s: C.HOLE, w: 1, d: '10 4 3 4' }); s += T(px + pw - 4, vc - 5, 'web ℄', { fs: 9.5, fill: C.HOLE, a: 'end' }); }
  if (meta.webBand) {
    // 내부판은 웨브에 인접 → 판 하단(내측, ℄ 방향) 바깥에 WEB SECTION 밴드 표기
    const bY = py + ph + 6, bh = 22;
    s += RC(px, bY, pw, bh, { f: C.WEB, s: C.HOLE, w: 0.8, d: '5 3' });
    s += T(px + pw / 2, bY + bh / 2 + 4, 'WEB SECTION (모재 웨브 위치)', { fs: 9.5, fw: 700, fill: C.HOLE, a: 'middle' });
    s += L(px, py + ph, px + pw, py + ph, { s: C.HOLE, w: 1, d: '3 2' });
    s += T(px + pw + 6, py + ph + 3, '내측 연단', { fs: 8.5, fill: C.SUB });
  }
  // 자유단(이음 갭) 표기 — 좌측 u=0
  s += L(px, py, px, py + ph, { s: C.INK, w: 1.6 });
  s += T(px + 2, py - 7, '이음 갭 ℄ (자유단)', { fs: 9.5, fill: C.SUB, a: 'start' });
  for (let i = 0; i <= 6; i++) { const v = -hw + i * (hw * 2 / 6); const [ex, ey] = map(0, v); s += L(ex, ey, ex - 5, ey, { s: C.HOLE, w: 0.8 }); }
  // 파단선 오버레이
  s += overlay(g, gov, map, { sc });
  // 하중 화살표 Pf(좌향)
  const [a1x, a1y] = map(-3, 0), [a2x, a2y] = map(-70 / sc * sc, 0); // 좌측
  const ax2 = px - 66;
  s += L(px - 6, vc, ax2, vc, { s: C.LOAD, w: 5, cap: 'round' });
  s += `<path d="M${ax2},${vc} l17,-9 v18 z" fill="${C.LOAD}"/>`;
  s += T(ax2 + 4, vc - 12, meta.load ?? 'Pf', { fs: 15, fw: 800, fill: C.LOAD });
  // 치수: 폭 B(우측), 피치/연단(하단)
  const dimX = px + pw + 16;
  s += L(dimX, py, dimX, py + ph, { s: C.SUB, w: 0.8 }); s += L(dimX - 4, py, dimX + 4, py, { s: C.SUB, w: 0.8 }); s += L(dimX - 4, py + ph, dimX + 4, py + ph, { s: C.SUB, w: 0.8 });
  s += `<text x="${dimX + 12}" y="${vc}" font-size="10.5" fill="${C.SUB}" text-anchor="middle" transform="rotate(90 ${dimX + 12} ${vc})">${Math.round(widTot)}</text>`;
  s += legend(16, Hs - 40, gov, g);
  s += pathBadge(W - 14, 26, gov);
  s += '</svg>';
  return s;
}

// ── 웨브 이음판 입면(u=춤/하중 수직, v=축방향 수평, 갭=중앙 CL) ────────────────
function webElev(g, gov, meta) {
  const W = 380, Hs = 500, padX = 64, padT = 104, padB = 96;
  const LvMax = Math.max(g.edge, ...g.cols.map(cv => stagOf(cv, g).Lv));
  const lenTot = LvMax + g.edge, widTot = 2 * g.halfWidth;
  const drawH = Hs - padT - padB, drawW = W - 2 * padX;
  const sc = Math.min(drawH / lenTot, drawW / widTot);
  const u0 = padT, vc = W / 2;
  const map = (u, v) => [vc + v * sc, u0 + u * sc]; // v=수평(축), u=수직(춤/하중)
  const hw = g.halfWidth;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hs}" font-family="'Segoe UI',system-ui,sans-serif">`;
  s += defs();
  s += T(16, 26, meta.title, { fs: 15, fw: 800 });
  s += T(16, 44, meta.sub, { fs: 11.5, fill: C.SUB });
  // 웨브판 외곽
  const [px, py] = map(0, -hw), pw = widTot * sc, ph = lenTot * sc;
  // 상·하 플랜지(H형강 표기, 개략) — 웨브판 상·하 바깥
  const fY1 = py - 26, fY2 = py + ph + 17;
  s += RC(padX - 12, fY1, drawW + 24, 9, { f: C.WEB, s: C.HOLE, w: 0.8 });
  s += RC(padX - 12, fY2, drawW + 24, 9, { f: C.WEB, s: C.HOLE, w: 0.8 });
  s += T(padX - 12, fY1 - 5, '상부 플랜지 (H형강)', { fs: 9, fill: C.HOLE });
  s += T(padX - 12, fY2 + 21, '하부 플랜지 (H형강)', { fs: 9, fill: C.HOLE });
  // 이음 갭 CL(수직 중앙)
  s += L(vc, fY1 - 5, vc, fY2 + 9, { s: C.HOLE, w: 1, d: '10 4 3 4' });
  s += T(vc + 5, fY1 - 9, '이음 ℄', { fs: 9.5, fill: C.HOLE });
  s += RC(px, py, pw, ph, { s: gov.gov ? C.BLKS : C.PLATE, w: gov.gov ? 2 : 1.4, f: C.PLATEF });
  // 자유단(상단 u=0)
  s += L(px, py, px + pw, py, { s: C.INK, w: 1.6 });
  s += T(px + pw + 6, py + 3, '자유단', { fs: 9, fill: C.SUB });
  // 파단선 오버레이
  s += overlay(g, gov, map, { sc, vertical: true });
  // 하중 Vu(하향)
  const ax = px - 30, ay1 = py + 6, ay2 = py + ph - 6;
  s += L(ax, ay1, ax, ay2, { s: C.LOAD, w: 5, cap: 'round' });
  s += `<path d="M${ax},${ay2} l-9,-17 h18 z" fill="${C.LOAD}"/>`;
  s += T(ax - 18, (ay1 + ay2) / 2, meta.load ?? 'Vu', { fs: 15, fw: 800, fill: C.LOAD });
  s += legend(16, Hs - 40, gov, g);
  s += pathBadge(W - 14, 26, gov);
  s += '</svg>';
  return s;
}

function defs() {
  return '';
}
function pathBadge(x, y, gov) {
  return `<g><rect x="${x - 78}" y="${y - 17}" width="78" height="22" rx="4" fill="${C.BLKS}" opacity="0.14"/>${T(x - 39, y - 1, (gov.path || '') + ' ◀', { fs: 12, fw: 800, fill: C.BLKS, a: 'middle' })}</g>`;
}
function legend(x, y, gov, g) {
  const dcr = gov.dcr != null ? `DCR ${gov.dcr.toFixed(2)}` : '';
  const cap = `φRn ${(gov.phiRn / 1e3).toFixed(0)}kN · Ubs ${gov.Ubs.toFixed(1)} · ${dcr}`;
  let s = `<g>`;
  s += L(x, y, x + 22, y, { s: C.SHEAR, w: 3, cap: 'round' }) + T(x + 28, y + 4, '전단 파단면(S)', { fs: 10, fill: C.SUB });
  s += L(x + 138, y, x + 160, y, { s: C.TEN, w: 3, d: '6 4', cap: 'round' }) + T(x + 166, y + 4, '인장 파단면(T)', { fs: 10, fill: C.SUB });
  s += hatchPoly(`${x},${y + 12} ${x + 20},${y + 12} ${x + 20},${y + 23} ${x},${y + 23}`, C.BLKF, C.BLKS) + T(x + 26, y + 21, '탈락(뜯김) 블록', { fs: 10, fill: C.SUB });
  s += T(x + 138, y + 21, cap, { fs: 10, fw: 700, fill: C.BLKS });
  s += `</g>`;
  return s;
}

// ── 생성 루프 ────────────────────────────────────────────────────────────────
const panels = []; // {sample, view, file, title}
for (const sm of SAMPLES) {
  const cond = { ...base, noStagger: sm.noStagger };
  const sec = sectionByName(sm.name);
  const dim = parseName(sm.name);
  const r0 = designConnection(cond, sec, sm.dia);
  const opt = aiscOptimize(r0, cond);
  const rep = opt.report;
  const dia = opt.result.boltDia;
  const byId = id => rep.checks.find(c => c.id === id);
  const govOf = c => c.cases.find(x => x.gov) ?? c.cases.reduce((a, b) => (b.dcr > a.dcr ? b : a));
  const tw = dim.tw, B = dim.B, Hh = dim.H;
  const views = [
    { id: 'FP5', file: `${sm.slug}-1-outer.svg`, title: '① 외부 이음판 (평면)', sub: `${sm.name} · ${sm.tag} · M${dia} · PL-${opt.result.flange.outerPlate.t}×${opt.result.flange.outerPlate.w}`, kind: 'flange', webCL: true, load: 'Pf' },
    { id: 'FI5', file: `${sm.slug}-2-inner.svg`, title: '② 내부 이음판 (평면, WEB SECTION)', sub: `${sm.name} · 내부판 ×2매 · PL-${opt.result.flange.innerPlate.t}×${opt.result.flange.innerPlate.w}`, kind: 'flange', webBand: tw, load: 'Pf' },
    { id: 'FM5', file: `${sm.slug}-3-member.svg`, title: '③ 부재 플랜지 (평면)', sub: `${sm.name} · 모재 tf=${dim.tf} · Girder Flange`, kind: 'flange', webCL: true, load: 'Pf' },
    { id: 'WP1', file: `${sm.slug}-4-web.svg`, title: '④ 웨브 이음판 (입면)', sub: `${sm.name} · 웨브판 ×2매 · PL-${opt.result.web.webPlate.t}×${opt.result.web.webPlate.w}`, kind: 'web', H: Hh, load: 'Vu' },
  ];
  for (const v of views) {
    const c = byId(v.id); if (!c || !c.bsGeom) continue;
    const gov = govOf(c);
    const meta = { title: v.title, sub: v.sub, webCL: v.webCL, webBand: v.webBand, load: v.load, H: v.H };
    const svg = v.kind === 'web' ? webElev(c.bsGeom, gov, meta) : flangePlan(c.bsGeom, gov, meta);
    writeFileSync(new URL(v.file, OUT), svg, 'utf8');
    panels.push({ sample: sm, view: v, file: v.file, gov, cases: c.cases, svg });
    console.log('wrote', v.file, '·', gov.path, 'DCR', gov.dcr);
  }
}

// ── 인덱스 HTML(아티팩트용) ──────────────────────────────────────────────────
let html = `<title>블록전단 파단선 — 3 샘플 × 4 요소</title>\n`;
html += `<style>
:root{color-scheme:light dark}
body,.wrap{--bg:#fff;--fg:#1f2430;--sub:#6b7280;--card:#f7f8fa;--bd:#e3e6ec;--accent:#e0a92e}
@media (prefers-color-scheme:dark){.wrap{--bg:#14171d;--fg:#e7eaf0;--sub:#9aa1ad;--card:#1c2029;--bd:#2a2f3a}}
:root[data-theme=dark] .wrap{--bg:#14171d;--fg:#e7eaf0;--sub:#9aa1ad;--card:#1c2029;--bd:#2a2f3a}
:root[data-theme=light] .wrap{--bg:#fff;--fg:#1f2430;--sub:#6b7280;--card:#f7f8fa;--bd:#e3e6ec}
.wrap{background:var(--bg);color:var(--fg);font-family:'Segoe UI',system-ui,sans-serif;padding:22px;max-width:1180px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}.lede{color:var(--sub);font-size:13px;margin:0 0 18px;line-height:1.5}
.grp{margin:0 0 26px}.grp>h2{font-size:15px;margin:0 0 10px;padding:6px 10px;background:var(--card);border-left:3px solid var(--accent);border-radius:4px}
.row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media(min-width:900px){.row{grid-template-columns:repeat(4,minmax(0,1fr))}}
.cell{background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:8px}
.cell svg{width:100%;height:auto;background:#fff;border-radius:5px}
.cap{font-size:11px;color:var(--sub);margin-top:6px;line-height:1.4}
.cap b{color:var(--accent)}
.note{font-size:12px;color:var(--sub);background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:12px 14px;line-height:1.6;margin-top:8px}
.note code{background:rgba(120,130,145,.15);padding:1px 5px;border-radius:3px;font-size:11px}
</style>\n`;
html += `<div class="wrap">`;
html += `<h1>블록전단(Block Shear) 파단선 — 업데이트 검토 기준</h1>`;
html += `<p class="lede">AISIsplice Appendix C Path 체계로 갱신한 블록전단 검토의 <b>실측 파단선</b>입니다. 각 요소의 <b>지배(governing) Path</b>를 표기 — <span style="color:#d1495b">■</span> 전단 파단면(하중방향) · <span style="color:#2c6fbb">▨</span> 인장 파단면(직각) · <span style="color:#e0a92e">▤</span> 뜯겨나가는 탈락블록(해치). 하중: 플랜지 Pf(축력)·웨브 Vu(전단, H=0). 분담 = 균형(U블록 1.0·단일 L블록 tributary).</p>`;
const bySample = {};
for (const p of panels) (bySample[p.sample.slug] ??= []).push(p);
for (const sm of SAMPLES) {
  const ps = bySample[sm.slug]; if (!ps) continue;
  html += `<div class="grp"><h2>${sm.name} — ${sm.tag}</h2><div class="row">`;
  for (const p of ps) {
    const others = p.cases.map(c => `${c.path}${c.gov ? '◀' : ''} ${c.dcr.toFixed(2)}`).join(' · ');
    html += `<div class="cell">${p.svg}<div class="cap"><b>${p.gov.path}</b> 지배 · DCR ${p.gov.dcr.toFixed(2)}<br>전체: ${esc(others)}</div></div>`;
  }
  html += `</div></div>`;
}
html += `<div class="note"><b>주기</b> · 파단선은 엔진의 실제 볼트배치·이음판 치수(옵티마이저 결과)로 작도 — 상세계산서 검토와 동일한 기하입니다.<br>
· 플랜지: 전단면 ∥ 하중(Pf), 인장면 ⊥ 하중. 웨브: H=0이므로 수직력 Vu만 검토(Web Splice Plate + Girder Web 2계통), 수직 전단면·하단 수평 인장면.<br>
· <code>Path 1/4</code>=외연 L블록(Ubs 0.5) · <code>2a/5a</code>=전열 U블록 · <code>2b/5b</code>=외측 U블록 · <code>3</code>=밴드분할 U · <code>6·7/8·9</code>=부재 플랜지 · 웨브 <code>Path 1/4·5</code>=수직 V블록(Ubs 1.0).</div>`;
html += `</div>`;
writeFileSync(new URL('index.html', OUT), html, 'utf8');
console.log('\nwrote index.html · panels:', panels.length);
