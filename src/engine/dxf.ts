// DXF 생성기 (AutoCAD R12 ASCII, 무의존성) — 접합 상세도.
// 플랜지 평면 + 웨브 입면(외·내첨판 단면). 해칭·치수(실좌표 도출)·웨브 은선·레이어. 단위 mm 실척.
import type { DesignResult, DesignCondition } from './types.ts';
import { parseName } from './sections.ts';
import { BOLT_HOLE, boltNameByDia } from './bolts.ts';

export function toDXF(r: DesignResult, cond: DesignCondition): string {
  const e: string[] = [];
  const f = (x: number) => x.toFixed(2);
  const line = (x1: number, y1: number, x2: number, y2: number, layer: string) =>
    e.push('0', 'LINE', '8', layer, '10', f(x1), '20', f(y1), '30', '0', '11', f(x2), '21', f(y2), '31', '0');
  const rect = (x: number, y: number, w: number, h: number, layer: string) => {
    line(x, y, x + w, y, layer); line(x + w, y, x + w, y + h, layer); line(x + w, y + h, x, y + h, layer); line(x, y + h, x, y, layer);
  };
  const circle = (cx: number, cy: number, rad: number) => e.push('0', 'CIRCLE', '8', 'HOLE', '10', f(cx), '20', f(cy), '30', '0', '40', f(rad));
  const text = (x: number, y: number, h: number, s: string, layer = 'TEXT') => e.push('0', 'TEXT', '8', layer, '10', f(x), '20', f(y), '30', '0', '40', f(h), '1', s);
  const hatch = (x: number, y: number, w: number, h: number, step = 12) => {
    for (let c = y - (x + w); c < (y + h) - x; c += step) {
      const x1 = Math.max(x, y - c), x2 = Math.min(x + w, y + h - c);
      if (x1 < x2 - 1) line(x1, x1 + c, x2, x2 + c, 'HATCH');
    }
  };
  const plate = (x: number, y: number, w: number, h: number) => { hatch(x, y, w, h, h < 40 ? 8 : 12); rect(x, y, w, h, 'PLATE'); };
  const dimV = (x: number, yTop: number, vals: number[]) => {
    let acc = yTop; const st = [acc]; vals.forEach(v => { acc -= v; st.push(acc); });
    line(x, st[0], x, st[st.length - 1], 'DIM'); st.forEach(p => line(x - 15, p, x + 15, p, 'DIM'));
    vals.forEach((v, i) => text(x + 20, (st[i] + st[i + 1]) / 2 - 15, 30, String(v)));
  };
  const dimH = (y: number, xLeft: number, vals: number[]) => {
    let acc = xLeft; const st = [acc]; vals.forEach(v => { acc += v; st.push(acc); });
    line(st[0], y, st[st.length - 1], y, 'DIM'); st.forEach(p => line(p, y - 15, p, y + 15, 'DIM'));
    vals.forEach((v, i) => text((st[i] + st[i + 1]) / 2 - 12, y - 45, 30, String(v)));
  };

  const { H, tw, tf } = parseName(r.section);
  const fB = r.flange.bolt, wB = r.web.bolt;
  const g1 = r.flange.gauge?.g1 ?? 90, g2 = r.flange.gauge?.g2 ?? 0;
  const stag = r.flange.staggered ?? false, gap = r.flange.gap ?? 10, base = gap / 2 + 40;
  const rad = BOLT_HOLE[boltNameByDia[r.boltDia]].hole / 2;
  const round = Math.round;

  const Lpf = r.flange.outerPlate?.L ?? 300, outerW = r.flange.outerPlate?.w ?? 200;
  const oT = r.flange.outerPlate?.t ?? 9, inner = r.flange.innerPlate;
  const colY = fB.m === 2 ? [-g1 / 2, g1 / 2] : [-(g1 / 2 + g2), -g1 / 2, g1 / 2, g1 / 2 + g2];
  const nHi = Math.ceil(fB.n), nLo = Math.floor(fB.n);
  const fBolts: { x: number; y: number }[] = [];
  ([1, -1] as const).forEach(s => colY.forEach((cy, ci) => {
    if (!stag) for (let i = 0; i < nHi; i++) fBolts.push({ x: s * (base + i * 60), y: cy });
    else { const off = ci % 2 ? 45 : 0, rows = ci % 2 ? nLo : nHi; for (let j = 0; j < rows; j++) fBolts.push({ x: s * (base + off + j * 90), y: cy }); }
  }));
  const fPosX = [...new Set(fBolts.filter(b => b.x > 0).map(b => b.x))].sort((a, b) => a - b);
  // 치수(실좌표): 대칭 갭 체인
  const chainSym = (half: number, pos: number[]) => {
    const rt = [round(pos[0] - gap / 2)]; for (let i = 1; i < pos.length; i++) rt.push(round(pos[i] - pos[i - 1]));
    rt.push(round(half - pos[pos.length - 1])); return [...rt.slice().reverse(), gap, ...rt];
  };
  const chainFull = (half: number, sorted: number[]) => {
    const c = [round(sorted[0] + half)]; for (let i = 1; i < sorted.length; i++) c.push(round(sorted[i] - sorted[i - 1]));
    c.push(round(half - sorted[sorted.length - 1])); return c;
  };

  // ── 플랜지 평면도 (원점) ──
  plate(-Lpf / 2, -outerW / 2, Lpf, outerW);
  line(0, -outerW / 2 - 15, 0, outerW / 2 + 15, 'GAP');
  line(-Lpf / 2, -tw / 2, Lpf / 2, -tw / 2, 'HIDDEN'); line(-Lpf / 2, tw / 2, Lpf / 2, tw / 2, 'HIDDEN');
  fBolts.forEach(b => circle(b.x, b.y, rad));
  dimV(Lpf / 2 + 60, outerW / 2, chainFull(outerW / 2, [...colY].sort((a, b) => a - b)));
  dimH(-outerW / 2 - 60, -Lpf / 2, chainSym(Lpf / 2, fPosX));
  text(-Lpf / 2, -outerW / 2 - 110, 32, `FLANGE PL ${oT}x${outerW}x${Lpf}(2)${inner ? ` + ${inner.t}x${inner.w}x${inner.L}(4)` : ''}`);

  // ── 웨브 입면도 (오프셋) ──
  const yo = outerW / 2 + H / 2 + 280;
  const chum = r.web.webPlate?.w ?? 140, webWid = r.web.webPlate?.L ?? 170, Pc = r.web.Pc ?? 60;
  const webPosX = Array.from({ length: wB.n }, (_, i) => base + i * 60);
  const webL = Math.max(webWid, 2 * (base + (wB.n - 1) * 60) + 40) + 40;
  // 상·하 플랜지
  [1, -1].forEach(s => { line(-webL / 2, yo + s * H / 2, webL / 2, yo + s * H / 2, 'FLANGE'); line(-webL / 2, yo + s * (H / 2 - tf), webL / 2, yo + s * (H / 2 - tf), 'FLANGE'); });
  // 외첨판(외측)·내첨판(내측)
  plate(-Lpf / 2, yo + H / 2, Lpf, oT);
  plate(-Lpf / 2, yo - H / 2 - oT, Lpf, oT);
  if (inner) { plate(-inner.L / 2, yo + H / 2 - tf - inner.t, inner.L, inner.t); plate(-inner.L / 2, yo - H / 2 + tf, inner.L, inner.t); }
  // 플랜지 볼트(입면 관통선)
  fPosX.flatMap(x => [x, -x]).forEach(x => { line(x, yo + H / 2 + oT, x, yo + H / 2 - tf - (inner?.t ?? 0), 'HOLE'); line(x, yo - H / 2 - oT, x, yo - H / 2 + tf + (inner?.t ?? 0), 'HOLE'); });
  // 웨브 첨판 + 볼트
  plate(-webWid / 2, yo - chum / 2, webWid, chum);
  line(0, yo - H / 2 - 20, 0, yo + H / 2 + 20, 'GAP');
  const webRowY = Array.from({ length: wB.m }, (_, i) => (i - (wB.m - 1) / 2) * Pc);
  ([1, -1] as const).forEach(s => webPosX.forEach(wx => webRowY.forEach(wy => circle(s * wx, yo + wy, rad))));
  const flO = round((H - chum) / 2);
  dimV(webL / 2 + 60, yo + H / 2, [flO, ...chainFull(chum / 2, [...webRowY].sort((a, b) => a - b)), flO]);
  dimH(yo - H / 2 - 60, -webWid / 2, chainSym(webWid / 2, webPosX));
  text(-webWid / 2, yo + H / 2 + oT + 60, 32, `WEB PL ${r.web.webPlate?.t}x${chum}x${webWid}(2)  [${r.section} ${cond.steel} ${cond.bolt} M${r.boltDia}]`);

  const layers: [string, number][] = [['PLATE', 5], ['HATCH', 8], ['HOLE', 1], ['GAP', 6], ['HIDDEN', 8], ['DIM', 8], ['TEXT', 3], ['FLANGE', 7]];
  const lt: string[] = ['0', 'TABLE', '2', 'LAYER', '70', String(layers.length)];
  layers.forEach(([n, c]) => lt.push('0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', 'CONTINUOUS'));
  lt.push('0', 'ENDTAB');
  return ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', ...lt, '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', ...e, '0', 'ENDSEC', '0', 'EOF'].join('\n');
}

export function downloadFile(filename: string, content: string | ArrayBuffer, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
