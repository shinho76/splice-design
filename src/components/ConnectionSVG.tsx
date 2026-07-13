import type { DesignResult, DesignCondition } from '../engine/types.ts';
import { parseName } from '../engine/sections.ts';

/**
 * 접합 상세도 — 계산 결과 기반 파라메트릭 렌더.
 * 치수는 실제 볼트 좌표·판 치수에서 도출 → 도면과 항상 일치(연단거리 포함).
 * 웨브 입면(플랜지 외·내첨판, 웨브첨판, 볼트) + 플랜지 평면(웨브 은선·게이지) + 요약표. 해칭·테마 대응.
 */
export default function ConnectionSVG({ r, cond }: { r: DesignResult; cond: DesignCondition }) {
  const { H, tw, tf } = parseName(r.section);
  const fB = r.flange.bolt, wB = r.web.bolt, dia = r.boltDia;
  const g1 = r.flange.gauge?.g1 ?? 90, g2 = r.flange.gauge?.g2 ?? 0;
  const stag = r.flange.staggered ?? false;   // 엔진의 실제 엇모 여부(공칭300만) — m≥4로 판정 금지
  const gap = r.flange.gap ?? 10;             // 첨판 길이에 반영된 이격(엔진과 동일)
  const base = gap / 2 + 40;

  const Lpf = r.flange.outerPlate?.L ?? 300, outerW = r.flange.outerPlate?.w ?? 200;
  const oT = r.flange.outerPlate?.t ?? 9, inner = r.flange.innerPlate, iT = inner?.t ?? 0;
  const colY = fB.m === 2 ? [-g1 / 2, g1 / 2] : [-(g1 / 2 + g2), -g1 / 2, g1 / 2, g1 / 2 + g2];

  // 플랜지 볼트 좌표(양단 40 연단): 정렬=60, 엇모=지그재그(짝수열 j·90, 홀수열 45+j·90)
  const nHi = Math.ceil(fB.n), nLo = Math.floor(fB.n);
  const fBolts: { x: number; y: number }[] = [];
  ([1, -1] as const).forEach(s => colY.forEach((cy, ci) => {
    if (!stag) for (let i = 0; i < nHi; i++) fBolts.push({ x: s * (base + i * 60), y: cy });
    else { const off = ci % 2 ? 45 : 0, rows = ci % 2 ? nLo : nHi; for (let j = 0; j < rows; j++) fBolts.push({ x: s * (base + off + j * 90), y: cy }); }
  }));
  const fPosX = [...new Set(fBolts.filter(b => b.x > 0).map(b => b.x))].sort((a, b) => a - b);

  const Pc = r.web.Pc ?? 60, mW = wB.m, nW = wB.n;
  const chum = r.web.webPlate?.w ?? ((mW - 1) * Pc + 80);
  const webWid = r.web.webPlate?.L ?? 170, wT = r.web.webPlate?.t;
  const flOff = Math.round((H - chum) / 2);
  const webRowY = Array.from({ length: mW }, (_, i) => (i - (mW - 1) / 2) * Pc);
  const webPosX = Array.from({ length: nW }, (_, i) => base + i * 60);

  // ── 치수체인: 실제 좌표·판치수에서 도출 ──
  const round = (x: number) => Math.round(x);
  const chainFull = (half: number, sorted: number[]) => {         // 대칭 전구간 [연단, 간격.., 연단]
    const c = [round(sorted[0] + half)];
    for (let i = 1; i < sorted.length; i++) c.push(round(sorted[i] - sorted[i - 1]));
    c.push(round(half - sorted[sorted.length - 1])); return c;
  };
  const chainSym = (half: number, pos: number[]) => {             // 갭 대칭 [.., 갭, ..]
    const rt = [round(pos[0] - gap / 2)];
    for (let i = 1; i < pos.length; i++) rt.push(round(pos[i] - pos[i - 1]));
    rt.push(round(half - pos[pos.length - 1]));
    return [...rt.slice().reverse(), gap, ...rt];
  };
  const flVCh = chainFull(outerW / 2, [...colY].sort((a, b) => a - b));
  const flHCh = chainSym(Lpf / 2, fPosX);
  const webVCh = [flOff, ...chainFull(chum / 2, [...webRowY].sort((a, b) => a - b)), flOff];
  const webHCh = chainSym(webWid / 2, webPosX);

  // 레이아웃
  const W = 476, mid = W / 2;
  const sc1 = Math.min(0.5, 270 / Math.max(H + 2 * oT, 200), 300 / Math.max(Lpf, 200));
  const sc2 = Math.min(0.5, 300 / Math.max(outerW, Lpf, 200));
  const yHead = 8, hHead = 34;
  const yWeb = yHead + hHead + 50, webPx = H * sc1;
  const yFl = yWeb + webPx + 88, flPx = outerW * sc2;
  const yTbl = yFl + flPx + 56, Htot = yTbl + 104;
  const fbT = Math.max(4, oT * sc1), ibT = Math.max(3, iT * sc1);
  const beamW = Math.max(Lpf, webWid) + 40;

  const Cross = ({ x, y, s = 4.2 }: { x: number; y: number; s?: number }) => (
    <g transform={`translate(${x},${y})`}>
      <circle r={s} className="svg-boltc" /><line x1={-s - 2} x2={s + 2} className="svg-boltx" /><line y1={-s - 2} y2={s + 2} className="svg-boltx" />
    </g>
  );
  const gpl = (t?: number, w?: number, l?: number, n?: number) => t == null ? '-' : `G.PL. ${t}x${w}x${l}x${n}EA`;
  const DimV = ({ x, cy, vals, sc }: { x: number; cy: number; vals: number[]; sc: number }) => {
    const tot = vals.reduce((a, b) => a + b, 0); let acc = cy - tot * sc / 2; const st = [acc];
    vals.forEach(v => { acc += v * sc; st.push(acc); });
    return <g><line x1={x} y1={st[0]} x2={x} y2={st[st.length - 1]} className="svg-dim-l" />
      {st.map((s, i) => <line key={i} x1={x - 3} y1={s} x2={x + 3} y2={s} className="svg-dim-l" />)}
      {vals.map((v, i) => <text key={i} x={x + 5} y={(st[i] + st[i + 1]) / 2 + 3.5} className="svg-dim-t">{v}</text>)}</g>;
  };
  const DimH = ({ y, cx, vals, sc }: { y: number; cx: number; vals: number[]; sc: number }) => {
    const tot = vals.reduce((a, b) => a + b, 0); let acc = cx - tot * sc / 2; const st = [acc];
    vals.forEach(v => { acc += v * sc; st.push(acc); });
    return <g><line x1={st[0]} y1={y} x2={st[st.length - 1]} y2={y} className="svg-dim-l" />
      {st.map((s, i) => <line key={i} x1={s} y1={y - 3} x2={s} y2={y + 3} className="svg-dim-l" />)}
      {vals.map((v, i) => <text key={i} x={(st[i] + st[i + 1]) / 2} y={y + 13} className="svg-dim-t" textAnchor="middle">{v}</text>)}</g>;
  };

  return (
    <div className="svg-wrap">
      <svg viewBox={`0 0 ${W} ${Htot}`} className="conn-svg" role="img" aria-label="접합 상세도">
        <defs><pattern id="hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="5" className="svg-hatch-l" /></pattern></defs>

        {/* 제목 셀 */}
        <rect x={30} y={yHead} width={(W - 60) / 2} height={hHead} className="svg-cell" />
        <rect x={30 + (W - 60) / 2} y={yHead} width={(W - 60) / 2} height={hHead} className="svg-cell" />
        <text x={30 + (W - 60) / 4} y={yHead + hHead / 2 + 5} className="svg-title" textAnchor="middle">{r.section}</text>
        <text x={30 + (W - 60) * 3 / 4} y={yHead + hHead / 2 + 5} className="svg-title" textAnchor="middle">{cond.steel} {Math.round(cond.strengthRatio * 100)}% {cond.bolt} {cond.jointType}</text>

        {/* ── 웨브 입면도 ── */}
        <text x={30} y={yWeb - 8} className="svg-cap">웨브 입면도</text>
        <g transform={`translate(${mid},${yWeb + webPx / 2})`}>
          {/* 상·하 플랜지 */}
          <rect x={-beamW * sc1 / 2} y={-webPx / 2} width={beamW * sc1} height={Math.max(3, tf * sc1)} className="svg-flange-band" />
          <rect x={-beamW * sc1 / 2} y={webPx / 2 - Math.max(3, tf * sc1)} width={beamW * sc1} height={Math.max(3, tf * sc1)} className="svg-flange-band" />
          {/* 플랜지 외첨판(외측, 해칭) */}
          <rect x={-Lpf * sc1 / 2} y={-webPx / 2 - fbT} width={Lpf * sc1} height={fbT} className="svg-flg" />
          <rect x={-Lpf * sc1 / 2} y={webPx / 2} width={Lpf * sc1} height={fbT} className="svg-flg" />
          {/* 플랜지 내첨판(내측, 해칭) */}
          {inner && <>
            <rect x={-(inner.L) * sc1 / 2} y={-webPx / 2 + Math.max(3, tf * sc1)} width={inner.L * sc1} height={ibT} className="svg-flg" />
            <rect x={-(inner.L) * sc1 / 2} y={webPx / 2 - Math.max(3, tf * sc1) - ibT} width={inner.L * sc1} height={ibT} className="svg-flg" />
          </>}
          {/* 플랜지 볼트(입면) */}
          {fPosX.flatMap(x => [x, -x]).map((x, i) => <g key={`fb${i}`}>
            <line x1={x * sc1} y1={-webPx / 2 - fbT} x2={x * sc1} y2={-webPx / 2 + Math.max(3, tf * sc1) + ibT} className="svg-ver" />
            <line x1={x * sc1} y1={webPx / 2 + fbT} x2={x * sc1} y2={webPx / 2 - Math.max(3, tf * sc1) - ibT} className="svg-ver" />
          </g>)}
          {/* 웨브 첨판(해칭) + 볼트 */}
          <rect x={-webWid * sc1 / 2} y={-chum * sc1 / 2} width={webWid * sc1} height={chum * sc1} className="svg-web" />
          {([1, -1] as const).flatMap(s => webPosX.flatMap((wx, xi) => webRowY.map((wy, yi) =>
            <Cross key={`w${s}${xi}${yi}`} x={s * wx * sc1} y={wy * sc1} />)))}
          <line x1={0} y1={-webPx / 2 - fbT - 4} x2={0} y2={webPx / 2 + fbT + 4} className="svg-gap" />
        </g>
        <DimV x={mid + beamW * sc1 / 2 + 22} cy={yWeb + webPx / 2} vals={webVCh} sc={sc1} />
        <DimH y={yWeb + webPx + fbT + 14} cx={mid} vals={webHCh} sc={sc1} />

        {/* ── 플랜지 평면도 ── */}
        <text x={30} y={yFl - 8} className="svg-cap">플랜지 평면도 (외첨판)</text>
        <g transform={`translate(${mid},${yFl + flPx / 2})`}>
          <rect x={-Lpf * sc2 / 2} y={-flPx / 2} width={Lpf * sc2} height={flPx} className="svg-flg" />
          <line x1={-Lpf * sc2 / 2} y1={-tw * sc2 / 2} x2={Lpf * sc2 / 2} y2={-tw * sc2 / 2} className="svg-hidden" />
          <line x1={-Lpf * sc2 / 2} y1={tw * sc2 / 2} x2={Lpf * sc2 / 2} y2={tw * sc2 / 2} className="svg-hidden" />
          <line x1={0} y1={-flPx / 2 - 6} x2={0} y2={flPx / 2 + 6} className="svg-gap" />
          {fBolts.map((b, i) => <Cross key={i} x={b.x * sc2} y={b.y * sc2} />)}
        </g>
        <DimV x={mid + Lpf * sc2 / 2 + 22} cy={yFl + flPx / 2} vals={flVCh} sc={sc2} />
        <text x={mid + Lpf * sc2 / 2 + 9} y={yFl + flPx / 2 + 3} className="svg-dim-t">t{tw}</text>
        <DimH y={yFl + flPx + 16} cx={mid} vals={flHCh} sc={sc2} />

        {/* ── 정보표 (MINI_BOX, JointDetailDWG 형식) ── */}
        <rect x={30} y={yTbl} width={W - 60} height={88} className="svg-cell" />
        {[1, 2, 3].map(i => <line key={i} x1={30} y1={yTbl + 22 * i} x2={W - 30} y2={yTbl + 22 * i} className="svg-dim-l" />)}
        {[108, 238, 316].map((x, i) => <line key={i} x1={x} y1={yTbl} x2={x} y2={yTbl + 88} className="svg-dim-l" />)}
        {([
          ['Title', r.section, 'Steel', cond.steel],
          ['Web PL.', gpl(wT, chum, webWid, 2), 'O-Flg PL.', gpl(oT, outerW, Lpf, 2)],
          ['Web Bolt', `${mW * nW * 2}-M${dia} H.T.B`, 'I-Flg PL.', inner ? gpl(iT, inner.w, inner.L, 4) : '-'],
          ['Joint', `${cond.member} ${cond.jointType}`, 'Flg Bolt', `${fB.m * Math.round(fB.n) * 4}-M${dia} H.T.B`],
        ] as const).map(([l1, v1, l2, v2], i) => {
          const y = yTbl + 22 * i + 15;
          return <g key={i}>
            <text x={35} y={y} className="svg-tblk" style={{ fontSize: '9px' }}>{l1}</text>
            <text x={113} y={y} className="svg-tblv" style={{ fontSize: '8.3px' }}>{v1}</text>
            <text x={243} y={y} className="svg-tblk" style={{ fontSize: '9px' }}>{l2}</text>
            <text x={321} y={y} className="svg-tblv" style={{ fontSize: '8.3px' }}>{v2}</text>
          </g>;
        })}
      </svg>
    </div>
  );
}
