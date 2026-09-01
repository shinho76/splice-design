import type { DesignCondition } from '../engine/types.ts';
import type { ShearResult } from '../engine/shear/singlePlate.ts';
import { sectionByName } from '../engine/sections.ts';
import { useLang, tJoint } from '../i18n.ts';

/**
 * 전단판(SC) 접합 상세도 — ConnectionSVG(GS)와 동일한 파라메트릭 렌더 방식.
 * 치수는 실제 볼트 좌표·판 치수(ShearResult)에서 직접 도출 → 계산 결과와 항상 일치.
 * 지지부재(컬럼/거더)는 SC 엔진이 형상을 산정하지 않으므로 임의로 그리지 않고
 * 해치(///) 벽체 기호로만 표시한다(connParts.ts·ShearViewer와 동일한 원칙).
 *   View1: 전단판 입면도(피지지보 측면 — 플랜지대·전단판(양측 2매, 겹쳐보임)·볼트)
 *   View2: 볼트 단면 상세(전단판 2매 + 웨브 그립 구성 — 2면전단 시각화)
 */
export default function ShearConnectionSVG({ r, cond }: { r: ShearResult; cond: DesignCondition }) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const sec = sectionByName(r.section);
  const H = sec?.H ?? 0, tf = sec?.tf ?? 0, tw = sec?.tw ?? 0;
  const { NC, NR, Pc, a, sh, Leh, plate, boltDia: dia } = r;

  const colX = NC === 2 ? [a, a + sh] : [a];
  const rowY = Array.from({ length: NR }, (_, i) => (i - (NR - 1) / 2) * Pc);
  const round = Math.round;

  // ── 치수체인: 실제 좌표·판치수에서 도출 ──
  const margin = (plate.L - (NR - 1) * Pc) / 2;           // 상·하 여장(볼트가 판 중앙에 대칭 배치)
  const vCh = [round(margin), ...Array(Math.max(0, NR - 1)).fill(round(Pc)), round(margin)];
  const hCh = NC === 2 ? [round(a), round(sh), round(Leh)] : [round(a), round(Leh)];

  // 레이아웃 (ConnectionSVG와 동일한 카드 폭)
  const W = 476, mid = W / 2;
  const drawLen = plate.w + 55;                            // 지지면(x=0)→판 원단+여유
  const bandH = Math.max(H, plate.L + 20);
  const sc1 = Math.min(0.62, 300 / drawLen, 250 / bandH);
  const flT = Math.max(3, tf * sc1);

  const secW = 2 * plate.t + tw, secDrawW = secW + 50;      // 볼트 단면 상세(확대)
  const sc2 = Math.min(4.2, 230 / secDrawW);
  const secH = 70;

  const yHead = 8, hHead = 34;
  const yWeb = yHead + hHead + 26;
  const webBandH = bandH * sc1;
  const ySec = yWeb + webBandH + 60;
  const yTbl = ySec + secH + 46, Htot = yTbl + 88;

  const Cross = ({ x, y, s = 4.2 }: { x: number; y: number; s?: number }) => (
    <g transform={`translate(${x},${y})`}>
      <circle r={s} className="svg-boltc" /><line x1={-s - 2} x2={s + 2} className="svg-boltx" /><line y1={-s - 2} y2={s + 2} className="svg-boltx" />
    </g>
  );
  const DimV = ({ x, cy, vals, sc }: { x: number; cy: number; vals: number[]; sc: number }) => {
    const tot = vals.reduce((s, v) => s + v, 0); let acc = cy - tot * sc / 2; const st = [acc];
    vals.forEach(v => { acc += v * sc; st.push(acc); });
    return <g><line x1={x} y1={st[0]} x2={x} y2={st[st.length - 1]} className="svg-dim-l" />
      {st.map((s, i) => <line key={i} x1={x - 3} y1={s} x2={x + 3} y2={s} className="svg-dim-l" />)}
      {vals.map((v, i) => <text key={i} x={x + 5} y={(st[i] + st[i + 1]) / 2 + 3.5} className="svg-dim-t">{v}</text>)}</g>;
  };
  const DimH = ({ y, x0, vals, sc }: { y: number; x0: number; vals: number[]; sc: number }) => {
    let acc = x0; const st = [acc];
    vals.forEach(v => { acc += v * sc; st.push(acc); });
    return <g><line x1={st[0]} y1={y} x2={st[st.length - 1]} y2={y} className="svg-dim-l" />
      {st.map((s, i) => <line key={i} x1={s} y1={y - 3} x2={s} y2={y + 3} className="svg-dim-l" />)}
      {vals.map((v, i) => <text key={i} x={(st[i] + st[i + 1]) / 2} y={y + 13} className="svg-dim-t" textAnchor="middle">{v}</text>)}</g>;
  };
  /** 지지면 해치(///) 벽체 기호 — 실제 지지부재 형상은 SC 엔진이 산정하지 않으므로 그리지 않음 */
  const SupportHatch = ({ x, y0, y1 }: { x: number; y0: number; y1: number }) => {
    const ticks = []; const n = Math.max(2, Math.round((y1 - y0) / 9));
    for (let i = 0; i <= n; i++) { const ty = y0 + (i * (y1 - y0)) / n; ticks.push(<line key={i} x1={x} y1={ty} x2={x - 8} y2={ty + 8} className="svg-hidden" />); }
    return <g><line x1={x} y1={y0} x2={x} y2={y1} className="svg-ver" />{ticks}</g>;
  };

  return (
    <div className="svg-wrap">
      <svg viewBox={`0 0 ${W} ${Htot}`} className="conn-svg" role="img" aria-label="전단판 접합 상세도">
        <defs><pattern id="hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="5" className="svg-hatch-l" /></pattern></defs>

        {/* 제목 셀 */}
        <rect x={30} y={yHead} width={(W - 60) / 2} height={hHead} className="svg-cell" />
        <rect x={30 + (W - 60) / 2} y={yHead} width={(W - 60) / 2} height={hHead} className="svg-cell" />
        <text x={30 + (W - 60) / 4} y={yHead + hHead / 2 + 5} className="svg-title" textAnchor="middle">{sec?.label ?? r.section}</text>
        <text x={30 + (W - 60) * 3 / 4} y={yHead + hHead / 2 + 5} className="svg-title" textAnchor="middle">{cond.steel} {Math.round(cond.strengthRatio * 100)}% {cond.bolt} {tJoint(cond.jointType, lang)}</text>

        {/* ── 전단판 입면도 ── */}
        <text x={30} y={yWeb - 8} className="svg-cap">{L('전단판 입면도 (피지지보 측면)', 'Shear tab elevation (supported beam side)')}</text>
        <text x={W - 30} y={yWeb - 8} className="svg-dim-t" textAnchor="end">{L('해치=지지부재(별도, 형상 미산정)', 'Hatch = support (not modeled)')}</text>
        <g transform={`translate(60,${yWeb + webBandH / 2})`}>
          <SupportHatch x={0} y0={-webBandH / 2 - 6} y1={webBandH / 2 + 6} />
          {/* 피지지보 플랜지대(측면) */}
          <rect x={0} y={-H * sc1 / 2} width={drawLen * sc1} height={flT} className="svg-flange-band" />
          <rect x={0} y={H * sc1 / 2 - flT} width={drawLen * sc1} height={flT} className="svg-flange-band" />
          {/* 전단판(양측 2매 — 측면에서는 겹쳐 보임) */}
          <rect x={0} y={-plate.L * sc1 / 2} width={plate.w * sc1} height={plate.L * sc1} className="svg-plate-h" />
          <text x={plate.w * sc1 / 2} y={-plate.L * sc1 / 2 - 6} className="svg-dim-t" textAnchor="middle">{L('전단판 ×2', 'Plate ×2')}</text>
          {/* 볼트 */}
          {colX.flatMap((cx, ci) => rowY.map((ry, ri) => <Cross key={`b${ci}${ri}`} x={cx * sc1} y={ry * sc1} />))}
          <DimV x={-16} cy={0} vals={vCh} sc={sc1} />
          <DimH y={H * sc1 / 2 + flT + 14} x0={0} vals={hCh} sc={sc1} />
        </g>

        {/* ── 볼트 단면 상세(2면전단) ── */}
        <text x={30} y={ySec - 8} className="svg-cap">{L('볼트 단면 상세 (2면전단)', 'Bolt section detail (double shear)')}</text>
        <g transform={`translate(${mid},${ySec + secH / 2})`}>
          {(() => {
            const pW = plate.t * sc2, wW = tw * sc2, h = 36;
            const x0 = -secW * sc2 / 2, x1 = x0 + pW, x2 = x1 + wW, x3 = x2 + pW;
            return <>
              <rect x={x0} y={-h / 2} width={pW} height={h} className="svg-plate-h" />
              <rect x={x1} y={-h / 2} width={wW} height={h} className="svg-web" />
              <rect x={x2} y={-h / 2} width={pW} height={h} className="svg-plate-h" />
              {/* 볼트(단면) — 헤드·너트·샹크 개략 표시 */}
              <rect x={x0 - 7} y={-6} width={7} height={12} className="svg-flg" />
              <line x1={x0} y1={0} x2={x3} y2={0} className="svg-ver" />
              <rect x={x3} y={-5} width={6} height={10} className="svg-flg" />
              <DimH y={h / 2 + 16} x0={x0} vals={[plate.t, tw, plate.t]} sc={sc2} />
            </>;
          })()}
        </g>

        {/* ── 정보표 ── */}
        <rect x={30} y={yTbl} width={W - 60} height={72} className="svg-cell" />
        {[1, 2].map(i => <line key={i} x1={30} y1={yTbl + 24 * i} x2={W - 30} y2={yTbl + 24 * i} className="svg-dim-l" />)}
        {[108, 238, 316].map((x, i) => <line key={i} x1={x} y1={yTbl} x2={x} y2={yTbl + 72} className="svg-dim-l" />)}
        {([
          ['Title', r.section, 'Steel', cond.steel],
          ['Plate', `2-PL ${plate.t}x${plate.L}x${plate.w}`, 'Bolt', `${r.boltCount}-M${dia} H.T.B`],
          ['Grip', `${r.boltGrip}mm (PL+WEB+PL)`, 'Gov.', `${r.govId} · DCR ${r.govDcr.toFixed(2)} · ${r.ok ? 'OK' : 'NG'}`],
        ] as const).map(([l1, v1, l2, v2], i) => {
          const y = yTbl + 24 * i + 16;
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
