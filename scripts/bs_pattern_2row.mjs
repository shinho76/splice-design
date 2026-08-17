// ═══════════════════════════════════════════════════════════════════════════
// 플랜지 2열 배치 — 블록전단 파단선 패턴 (외부·내부·부재)
//   AISIsplice Appendix C. 원=볼트, 빗금=탈락블록(볼트선 따라 한덩어리로 찢김), Pf=왼쪽.
//   게이지선 4개: ±aIn(내측), ±aOut(외측). 웨브 CL=0.
//   외부판: Path 1 / 2a / 2b / 3   · 내부판(웨브 양측 2매): 4 / 5a / 5b   · 부재: 6 / 7 / 8
// ═══════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderPath } from './bs_pattern_1row.mjs';

const rect = (x0, x1, y0, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const vLine = (x, y0, y1) => [[x, y0], [x, y1]];

// H-400×400 (2열, M22): 게이지선 ±75(내)·±160(외), n=4, 피치60, 연단40, B=400
const F = { n: 4, pitch: 60, edge: 40, B: 400, innerW: 160 };
const aIn = 75, aOut = 160, ym = F.B / 2, xt = F.edge + (F.n - 1) * F.pitch;
const outerEdge = aOut + 35, innerEdge = outerEdge - F.innerW;   // 내부판 스트립 [innerEdge, outerEdge]
const S = (y) => ({ y, x0: 0, x1: xt });

// ── 외부 이음판 ──────────────────────────────────────────────────────────────
const outerPaths = [
  { id: 'P1', label: 'Path 1', ubs: 0.5, desc: '상부외곽선 전단 + 우측 인장(연단까지) · 한덩어리',
    shear: [S(aOut)], tension: [vLine(xt, aOut, -ym)], tear: [rect(0, xt, aOut, -ym)] },
  { id: 'P2a', label: 'Path 2a', ubs: 1.0, desc: '상·하 외곽선 전단 + 내측 인장',
    shear: [S(aOut), S(-aOut)], tension: [vLine(xt, aOut, -aOut)], tear: [rect(0, xt, aOut, -aOut)] },
  { id: 'P2b', label: 'Path 2b', ubs: 1.0, desc: '상·하 내측 게이지선 전단 + 외측연단~안쪽 2밴드',
    shear: [S(aIn), S(-aIn)], tension: [vLine(xt, aIn, ym), vLine(xt, -aIn, -ym)], tear: [rect(0, xt, aIn, ym), rect(0, xt, -aIn, -ym)] },
  { id: 'P3', label: 'Path 3', ubs: 1.0, desc: '내·외곽선 4면 전단 + 밴드분할 인장',
    shear: [S(aOut), S(aIn), S(-aIn), S(-aOut)], tension: [vLine(xt, aIn, aOut), vLine(xt, -aOut, -aIn)], tear: [rect(0, xt, aIn, aOut), rect(0, xt, -aOut, -aIn)] },
];

// ── 내부 이음판 (웨브 양측 2매) ──────────────────────────────────────────────
const innerPaths = [
  { id: 'P4', label: 'Path 4', ubs: 0.5, desc: '각 판 내측선 전단 + 판 외측연단(한덩어리)',
    shear: [S(aIn), S(-aIn)], tension: [vLine(xt, aIn, outerEdge), vLine(xt, -aIn, -outerEdge)], tear: [rect(0, xt, aIn, outerEdge), rect(0, xt, -aIn, -outerEdge)] },
  { id: 'P5a', label: 'Path 5a', ubs: 1.0, desc: '각 판 내·외선 전단 + 내측 인장',
    shear: [S(aOut), S(aIn), S(-aIn), S(-aOut)], tension: [vLine(xt, aIn, aOut), vLine(xt, -aOut, -aIn)], tear: [rect(0, xt, aIn, aOut), rect(0, xt, -aOut, -aIn)] },
  { id: 'P5b', label: 'Path 5b', ubs: 1.0, desc: '내부판 2장 · 게이지선 4면 전단 + 각 판 외곽선→연단·내곽선→끝선 2스트립(게이지선 사이 미탈락)',
    shear: [S(aOut), S(aIn), S(-aIn), S(-aOut)],
    tension: [vLine(xt, outerEdge, aOut), vLine(xt, aIn, innerEdge), vLine(xt, -innerEdge, -aIn), vLine(xt, -aOut, -outerEdge)],
    tear: [rect(0, xt, aOut, outerEdge), rect(0, xt, innerEdge, aIn), rect(0, xt, -aIn, -innerEdge), rect(0, xt, -outerEdge, -aOut)] },
];

// ── 부재 플랜지 (Girder, 웨브 중앙) ──────────────────────────────────────────
const girderPaths = [
  { id: 'P6', label: 'Path 6', ubs: 0.5, desc: 'Path 4와 동일 — 내측 게이지선 전단 + 외측연단(웨브 양측 2블록)',
    shear: [S(aIn), S(-aIn)], tension: [vLine(xt, aIn, ym), vLine(xt, -aIn, -ym)], tear: [rect(0, xt, aIn, ym), rect(0, xt, -aIn, -ym)] },
  { id: 'P7', label: 'Path 7', ubs: 1.0, desc: 'Path 5a와 동일 — 내·외 4면 전단 + 내측 인장(웨브 양측)',
    shear: [S(aOut), S(aIn), S(-aIn), S(-aOut)], tension: [vLine(xt, aIn, aOut), vLine(xt, -aOut, -aIn)], tear: [rect(0, xt, aIn, aOut), rect(0, xt, -aOut, -aIn)] },
];

// ── 렌더 ─────────────────────────────────────────────────────────────────────
const OUT = new URL('../docs/파단선/pattern2/', import.meta.url); mkdirSync(OUT, { recursive: true });
const boltAll = [-aOut, -aIn, aIn, aOut];
const oSvg = outerPaths.map(p => renderPath(F, p, { boltYs: boltAll }));
const iSvg = innerPaths.map(p => renderPath(F, p, { ym: outerEdge, plates: [[innerEdge, outerEdge], [-outerEdge, -innerEdge]], web: [-innerEdge, innerEdge], boltYs: boltAll }));
const gSvg = girderPaths.map(p => renderPath(F, p, { web: [-16, 16], boltYs: boltAll }));
outerPaths.forEach((p, i) => writeFileSync(new URL(`H400-${p.id}.svg`, OUT), oSvg[i], 'utf8'));
innerPaths.forEach((p, i) => writeFileSync(new URL(`H400-${p.id}.svg`, OUT), iSvg[i], 'utf8'));
girderPaths.forEach((p, i) => writeFileSync(new URL(`H400-${p.id}.svg`, OUT), gSvg[i], 'utf8'));

const sec = (title, paths, svgs) => `<h3 style="font-size:13px;margin:16px 0 6px;color:var(--sub)">${title}</h3><div class="pnls">${paths.map((p, i) => `<figure style="margin:0"><div class="cap"><b>${p.label}</b> · U<sub>bs</sub> ${p.ubs.toFixed(1)}</div>${svgs[i]}<figcaption style="font-size:10px;color:var(--sub);max-width:230px">${p.desc}</figcaption></figure>`).join('')}</div>`;
const html = `<title>2열 파단선 패턴 — H-400x400</title>\n<style>
:root{color-scheme:light dark}
.wrap{--bg:#fff;--fg:#1e2530;--sub:#6b7280;--card:#f7f8fa;--bd:#e3e6ec;--acc:#c8871a}
@media(prefers-color-scheme:dark){.wrap{--bg:#12151b;--fg:#e7eaf0;--sub:#98a1ae;--card:#1b1f27;--bd:#2a2f3a}}
:root[data-theme=dark] .wrap{--bg:#12151b;--fg:#e7eaf0;--sub:#98a1ae;--card:#1b1f27;--bd:#2a2f3a}
:root[data-theme=light] .wrap{--bg:#fff;--fg:#1e2530;--sub:#6b7280;--card:#f7f8fa;--bd:#e3e6ec}
.wrap{background:var(--bg);color:var(--fg);font-family:'Segoe UI',system-ui,sans-serif;padding:22px;max-width:1120px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 2px;padding:6px 10px;background:var(--card);border-left:3px solid var(--acc);border-radius:4px}
.lede{color:var(--sub);font-size:12.5px;line-height:1.55;margin:0 0 12px}
.key{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--sub);background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;margin-bottom:8px}
.pnls{display:flex;flex-wrap:wrap;gap:12px}.pnls svg{background:#fff;border:1px solid var(--bd);border-radius:7px;width:230px;height:auto}
.cap{font-size:11.5px;margin-bottom:3px}.cap b{color:var(--acc)}
</style>\n<div class="wrap"><h1>플랜지 2열 배치 — 블록전단 파단 Path</h1>
<p class="lede">AISIsplice Appendix C. 게이지선 4개(±내측 ±외측). 🔴 전단(∥Pf) · 🔵 인장(⊥Pf) · 🟡 탈락블록(볼트선 따라 한덩어리). Pf=왼쪽. 단면 H-400×400(M22).</p>
<div class="key"><span><b style="color:#d1495b">━</b> 전단면</span><span><b style="color:#2c6fbb">━</b> 인장면</span><span><b style="color:#e0a92e">▨</b> 탈락블록</span></div>
<h2>외부 이음판 (Outer Flange Splice Plate)</h2>${sec('Path 1 / 2a / 2b / 3', outerPaths, oSvg)}
<h2>내부 이음판 (Inner · 웨브 양측 2매)</h2>${sec('Path 4 / 5a / 5b', innerPaths, iSvg)}
<h2>부재 플랜지 (Girder Flange)</h2>${sec('Path 6 / 7 / 8', girderPaths, gSvg)}
</div>`;
writeFileSync(new URL('index.html', OUT), html, 'utf8');
console.log('rendered', oSvg.length + iSvg.length + gSvg.length, 'panels');
