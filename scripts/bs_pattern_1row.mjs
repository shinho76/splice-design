// ═══════════════════════════════════════════════════════════════════════════
// 플랜지 1열 배치 — 블록전단 파단선 패턴 (외부·내부 이음판)
//   AISIsplice Appendix C. 원=볼트, 빗금=탈락(뜯김) 블록.
//   좌표: x = 하중축 Pf(자유단 0 → 이음면 Xj),  y = 폭(웨브 CL = 0).
//   전단 파단면 = 하중과 ∥(게이지선 따라), 인장 파단면 = 하중과 ⊥.
//   1열 = 웨브 양측 게이지선 2개(외부판) / 웨브 양측 내부판 2매(각 1게이지선).
//
//   ▸ Outer(외부판, 전폭 1매, 게이지선 ±a):
//       Path 1  (L,U_bs0.5): 전단 1면(하부선) + 인장(하부선→상부선 across).  탈락=두 선 사이 밴드
//       Path 2a (U,U_bs1.0): 전단 2면(상·하선) + 인장(두 선 사이).            탈락=두 선 사이 밴드
//       Path 2b (U,U_bs1.0): 전단 2면(상·하선) + 인장(각 선→판 외측연단).      탈락=바깥쪽 2밴드
//   ▸ Inner(내부판, 웨브 양측 2매, 각 게이지선 1개):
//       Path 4  (L,U_bs0.5): 각 판 전단 1면(게이지선) + 인장(게이지선→판 외측연단). 탈락=각 판 외측밴드
// ═══════════════════════════════════════════════════════════════════════════

/** @typedef {{y:number,x0:number,x1:number}} ShearLine   전단선(수평): y위치, x범위 */
/** @typedef {[number,number][]}            Polyline      점열(인장 파단선 / 탈락블록 다각형) */
/** @typedef {{id:string,label:string,ubs:number,shear:ShearLine[],tension:Polyline[],tear:Polyline[]}} BsPath */

/**
 * 1열 배치 플랜지 볼트/판 기하.
 * @typedef {Object} Flange1Row
 * @property {number} gauge      게이지 g1(두 게이지선 간격) → 선 = ±gauge/2
 * @property {number} n          하중방향 볼트 수
 * @property {number} pitch      하중방향 피치
 * @property {number} edge       자유단 연단거리
 * @property {number} B          플랜지폭(외부판 전폭)
 * @property {number} innerBand  내부판 스트립 폭(웨브 한쪽)
 * @property {number} innerGap   웨브 중앙 미소 간격(내부판 2매 사이, 도해용)
 */

const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const vLine = (x, y0, y1) => [[x, y0], [x, y1]];

/** 외부 이음판 파단 Path (Path 1 / 2a / 2b). */
export function outerPaths1Row(f) {
  const a = f.gauge / 2;                       // 게이지선 = ±a
  const xt = f.edge + (f.n - 1) * f.pitch;      // 인장 파단면 x(최이음측 볼트열)
  const ym = f.B / 2;                           // 판 외측연단 = ±ym
  return [
    { id: 'P1', label: 'Path 1', ubs: 0.5,
      shear:   [{ y: a, x0: 0, x1: xt }],                        // 전단 1면(상부 게이지선만) — 볼트선 따라 찢김
      tension: [vLine(xt, a, -ym)],                            // 인장: 상부선 → 하부선 통과 → 연단(↓)
      tear:    [rect(0, xt, a, -ym)] },                          // 탈락: 상부 볼트선~하부 연단 한덩어리
    { id: 'P2a', label: 'Path 2a', ubs: 1.0,
      shear:   [{ y: -a, x0: 0, x1: xt }, { y: a, x0: 0, x1: xt }], // 전단 2면
      tension: [vLine(xt, -a, a)],                              // 인장: 두 선 사이
      tear:    [rect(0, xt, -a, a)] },
    { id: 'P2b', label: 'Path 2b', ubs: 1.0,
      shear:   [{ y: -a, x0: 0, x1: xt }, { y: a, x0: 0, x1: xt }],
      tension: [vLine(xt, a, ym), vLine(xt, -a, -ym)],          // 인장: 각 선 → 외측연단(상·하)
      tear:    [rect(0, xt, a, ym), rect(0, xt, -a, -ym)] },    // 탈락: 바깥쪽 2밴드
  ];
}

/** 내부 이음판 파단 Path (Path 4) — 웨브 양측 2매 동시. */
export function innerPaths1Row(f) {
  const a = f.gauge / 2;                        // 게이지선 = ±a (각 내부판에 1개)
  const xt = f.edge + (f.n - 1) * f.pitch;
  const outer = a + f.innerBand / 2;            // 판 외측연단(웨브 반대쪽)
  // 두 내부판: 상단 [inner,outer], 하단 [-outer,-inner]; 인장은 각 판 외측연단으로.
  return [
    { id: 'P4', label: 'Path 4', ubs: 0.5,
      shear:   [{ y: a, x0: 0, x1: xt }, { y: -a, x0: 0, x1: xt }],  // 각 판 전단 1면
      tension: [vLine(xt, a, outer), vLine(xt, -a, -outer)],         // 인장: 게이지선 → 판 외측연단
      tear:    [rect(0, xt, a, outer), rect(0, xt, -a, -outer)] },   // 탈락: 각 판 외측밴드
  ];
}

/** 부재 플랜지(Girder) 파단 Path (Path 6) — 전폭 1매·웨브 중앙, 인장=판 외측연단. */
export function girderPaths1Row(f) {
  const a = f.gauge / 2, xt = f.edge + (f.n - 1) * f.pitch, ym = f.B / 2;
  return [
    { id: 'P6', label: 'Path 6', ubs: 1.0,
      shear:   [{ y: a, x0: 0, x1: xt }, { y: -a, x0: 0, x1: xt }], // 상·하 게이지선 전단 2면
      tension: [vLine(xt, a, ym), vLine(xt, -a, -ym)],             // 인장: 각 선 → 판 외측연단
      tear:    [rect(0, xt, a, ym), rect(0, xt, -a, -ym)] },       // 탈락: 바깥쪽 2밴드(웨브 중앙)
  ];
}

/** 볼트 좌표(도해용): 게이지선 y[] × 하중방향 n열. */
export function boltGrid(f, ys) {
  const pts = [];
  for (const y of ys) for (let i = 0; i < f.n; i++) pts.push([f.edge + i * f.pitch, y]);
  return pts;
}

// ── 이하 검증용 SVG 렌더 (앱 CheckFig 포팅 참고) ────────────────────────────
const CLR = { sh: '#d1495b', te: '#2c6fbb', bf: '#f5b847', bs: '#e0a92e',
  hole: '#8b93a0', pl: '#5b6675', plf: '#f1f3f7', web: '#2b3038', ld: '#12a794', ink: '#2b3038', sub: '#6b7280' };

// 45° 해치(해석적 클리핑) — 어떤 뷰어에서도 렌더
function hatchSVG(poly, M) {
  const P = poly.map(M), xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const inside = (x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) c = !c; } return c; };
  const inter = (ax, ay, bx, by, cx, cy, dx, dy) => { const r1 = bx - ax, r2 = by - ay, s1 = dx - cx, s2 = dy - cy, den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) return null; const t = ((cx - ax) * s2 - (cy - ay) * s1) / den, u = ((cx - ax) * r2 - (cy - ay) * r1) / den; return (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) ? t : null; };
  const pts = P.map(p => p.join(',')).join(' ');
  let g = `<polygon points="${pts}" fill="${CLR.bf}" fill-opacity="0.22"/>`;
  for (let c = x0 - y1; c <= x1 - y0; c += 7) { const Ax = c + y0, Ay = y0, Bx = c + y1, By = y1, ts = [];
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const t = inter(Ax, Ay, Bx, By, P[i][0], P[i][1], P[j][0], P[j][1]); if (t != null) ts.push(t); }
    if (ts.length < 2) continue; ts.sort((p, q) => p - q);
    for (let k = 0; k < ts.length - 1; k++) { const tm = (ts[k] + ts[k + 1]) / 2; if (!inside(Ax + (Bx - Ax) * tm, Ay + (By - Ay) * tm)) continue;
      g += `<line x1="${(Ax + (Bx - Ax) * ts[k]).toFixed(1)}" y1="${(Ay + (By - Ay) * ts[k]).toFixed(1)}" x2="${(Ax + (Bx - Ax) * ts[k + 1]).toFixed(1)}" y2="${(Ay + (By - Ay) * ts[k + 1]).toFixed(1)}" stroke="${CLR.bs}" stroke-width="0.8"/>`; } }
  g += `<polygon points="${pts}" fill="none" stroke="${CLR.bs}" stroke-width="1.1" stroke-dasharray="3 2"/>`;
  return g;
}

export function renderPath(f, path, opt = {}) {
  const W = 250, H = 210, padL = 20, padR = 20, padT = 44, padB = 22;
  const xt = f.edge + (f.n - 1) * f.pitch, Xj = xt + f.edge, ym = opt.ym ?? f.B / 2;
  const sc = Math.min((W - padL - padR) / Xj, (H - padT - padB) / (2 * ym)), x0 = padL, cy = padT + (H - padT - padB) / 2;
  const M = ([x, y]) => [x0 + x * sc, cy - y * sc];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="'Segoe UI',system-ui,sans-serif">`;
  s += `<text x="${padL}" y="16" font-size="13" font-weight="800" fill="${CLR.ink}">${path.label}</text>`;
  s += `<text x="${padL}" y="30" font-size="9" fill="${CLR.sub}">전단 ${path.shear.length}면 · U_bs ${path.ubs.toFixed(1)}</text>`;
  // 판
  for (const p of opt.plates ?? [[-ym, ym]]) { const [ax, ay] = M([0, p[1]]), [bx, by] = M([Xj, p[0]]); s += `<rect x="${ax}" y="${ay}" width="${(bx - ax).toFixed(1)}" height="${(by - ay).toFixed(1)}" fill="${CLR.plf}" stroke="${CLR.pl}" stroke-width="1.2"/>`; }
  if (opt.web) { const [ax, ay] = M([0, opt.web[1]]), [bx, by] = M([Xj, opt.web[0]]); s += `<rect x="${ax}" y="${ay}" width="${(bx - ax).toFixed(1)}" height="${(by - ay).toFixed(1)}" fill="${CLR.web}" opacity="0.62"/><text x="${((ax + bx) / 2).toFixed(1)}" y="${((ay + by) / 2 + 3).toFixed(1)}" font-size="8" font-weight="700" fill="#fff" text-anchor="middle">WEB</text>`; }
  // 탈락블록
  for (const blk of path.tear) s += hatchSVG(blk, M);
  // 볼트
  const ys = [...new Set(path.shear.map(v => v.y))];
  const bys = opt.boltYs ?? [...new Set([...ys, ...path.tension.flatMap(t => t.map(p => p[1]))])];
  for (const by of (opt.boltYs ?? ys)) for (let i = 0; i < f.n; i++) { const [bx, byy] = M([f.edge + i * f.pitch, by]); s += `<circle cx="${bx.toFixed(1)}" cy="${byy.toFixed(1)}" r="4.4" fill="none" stroke="${CLR.ink}" stroke-width="1.5"/>`; }
  // 전단면(빨강)
  for (const sh of path.shear) { const [a1, b1] = M([sh.x0, sh.y]), [a2] = M([sh.x1, sh.y]); s += `<line x1="${a1.toFixed(1)}" y1="${b1.toFixed(1)}" x2="${a2.toFixed(1)}" y2="${b1.toFixed(1)}" stroke="${CLR.sh}" stroke-width="2.6" stroke-linecap="round"/>`; }
  // 인장면(파랑 점선)
  for (const t of path.tension) s += `<polyline points="${t.map(M).map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${CLR.te}" stroke-width="2.6" stroke-dasharray="5 3" stroke-linecap="round"/>`;
  // 이음 CL · 하중 Pf
  const [jx, jy1] = M([Xj, ym]), [, jy2] = M([Xj, -ym]); s += `<line x1="${jx.toFixed(1)}" y1="${(jy1 - 5).toFixed(1)}" x2="${jx.toFixed(1)}" y2="${(jy2 + 5).toFixed(1)}" stroke="${CLR.hole}" stroke-width="1" stroke-dasharray="8 3 2 3"/><text x="${jx.toFixed(1)}" y="${(jy1 - 8).toFixed(1)}" font-size="8" fill="${CLR.hole}" text-anchor="middle">이음 ℄</text>`;
  s += `<line x1="${(x0 - 4).toFixed(1)}" y1="${cy}" x2="${padL - 2}" y2="${cy}" stroke="${CLR.ld}" stroke-width="3.5" stroke-linecap="round"/><path d="M${padL - 2},${cy} l10,-6 v12 z" fill="${CLR.ld}"/><text x="${padL + 2}" y="${cy - 8}" font-size="11" font-weight="800" fill="${CLR.ld}">Pf</text>`;
  s += '</svg>';
  return s;
}

// ── H-450x200 (1열, M20) 검증 렌더 ───────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('bs_pattern_1row.mjs')) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const OUT = new URL('../docs/파단선/pattern/', import.meta.url); mkdirSync(OUT, { recursive: true });
  const F = { gauge: 120, n: 4, pitch: 60, edge: 40, B: 200, innerBand: 70, innerGap: 25 };
  const a = F.gauge / 2, outer = a + F.innerBand / 2, wHalf = a - F.innerBand / 2;
  const outerP = outerPaths1Row(F), innerP = innerPaths1Row(F), girderP = girderPaths1Row(F);
  const oSvg = outerP.map(p => renderPath(F, p, { boltYs: [-a, a] }));
  const iSvg = innerP.map(p => renderPath(F, p, { ym: outer, plates: [[wHalf, outer], [-outer, -wHalf]], web: [-wHalf, wHalf], boltYs: [-a, a] }));
  const gSvg = girderP.map(p => renderPath(F, p, { web: [-14, 14], boltYs: [-a, a] }));
  outerP.forEach((p, i) => writeFileSync(new URL(`H450-${p.id}.svg`, OUT), oSvg[i], 'utf8'));
  innerP.forEach((p, i) => writeFileSync(new URL(`H450-${p.id}.svg`, OUT), iSvg[i], 'utf8'));
  girderP.forEach((p, i) => writeFileSync(new URL(`H450-${p.id}.svg`, OUT), gSvg[i], 'utf8'));
  const html = `<title>1열 파단선 패턴 — H-450x200</title><div style="font-family:system-ui;padding:18px;background:#fff">
<h2 style="font-size:16px">플랜지 1열 배치 — 블록전단 파단선 패턴 (H-450×200, M20)</h2>
<p style="font-size:12px;color:#666">🔴 전단면(∥Pf) · 🔵 인장면(⊥Pf) · 🟡 탈락블록. 외부판 Path 1/2a/2b · 내부판(웨브 양측 2매) Path 4 · 부재 플랜지 Path 6.</p>
<h3 style="font-size:13px;margin-top:14px">외부 이음판 (Outer)</h3><div style="display:flex;gap:10px;flex-wrap:wrap">${oSvg.join('')}</div>
<h3 style="font-size:13px;margin-top:14px">내부 이음판 (Inner · 웨브 양측 2매)</h3><div style="display:flex;gap:10px;flex-wrap:wrap">${iSvg.join('')}</div>
<h3 style="font-size:13px;margin-top:14px">부재 플랜지 (Girder Flange)</h3><div style="display:flex;gap:10px;flex-wrap:wrap">${gSvg.join('')}</div></div>`;
  writeFileSync(new URL('index.html', OUT), html, 'utf8');
  console.log('rendered', oSvg.length + iSvg.length + gSvg.length, 'panels →', OUT.pathname);
}
