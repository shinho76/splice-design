import type { DesignCondition } from '../engine/types.ts';
import type { ShearResult } from '../engine/shear/singlePlate.ts';
import { sectionByName } from '../engine/sections.ts';
import { useLang, tJoint } from '../i18n.ts';

/**
 * 전단판(SC) 접합 상세도 — ConnectionSVG(GS)와 동일한 파라메트릭 렌더 방식.
 * 치수는 실제 볼트 좌표·판 치수(ShearResult)에서 직접 도출 → 계산 결과와 항상 일치.
 * 지지부재(컬럼/거더)는 SC 엔진이 형상을 산정하지 않으므로 그리지 않는다(참조 샘플
 * 400200dd.dxf와 동일 관례 — 판의 근접단이 곧 지지면이라는 암묵적 표시만으로 충분).
 *   View1: 전단판 입면도(피지지보 측면 — 플랜지대·전단판(양측 2매, 겹쳐보임)·볼트)
 *   View2: 볼트 단면 상세(전단판 2매 + 웨브 그립 구성 — 2면전단 시각화)
 */
export default function ShearConnectionSVG({ r, cond }: { r: ShearResult; cond: DesignCondition }) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const sec = sectionByName(r.section);
  const H = sec?.H ?? 0, tf = sec?.tf ?? 0, tw = sec?.tw ?? 0;
  const { NC, NR, Pc, a, sh, Leh, plate, boltDia: dia } = r;
  const gap = cond.gap ?? 5;

  const colX = NC === 2 ? [a, a + sh] : [a];
  const rowY = Array.from({ length: NR }, (_, i) => (i - (NR - 1) / 2) * Pc);
  const round = Math.round;

  // ── 치수체인: 실제 좌표·판치수에서 도출 ──
  const margin = (plate.L - (NR - 1) * Pc) / 2;           // 상·하 여장(볼트가 판 중앙에 대칭 배치)
  const vCh = [round(margin), ...Array(Math.max(0, NR - 1)).fill(round(Pc)), round(margin)];
  const hCh = NC === 2 ? [round(a), round(sh), round(Leh)] : [round(a), round(Leh)];

  // 레이아웃 (ConnectionSVG와 동일한 카드 폭) — x=0은 지지면(=전단판 근접단), x≥0에 전단판·보 배치.
  const W = 476, mid = W / 2;
  const rightW = plate.w + 40;                              // 0→보 원단+여유
  const bandH = Math.max(H, plate.L + 20);
  const sc1 = Math.min(0.62, 300 / rightW, 250 / bandH);
  const flT = Math.max(3, tf * sc1);

  const secW = 2 * plate.t + tw, secDrawW = secW + 50;      // 볼트 단면 상세(확대)
  const sc2 = Math.min(4.2, 230 / secDrawW);
  const secH = 70;

  const yHead = 8, hHead = 34;
  const yWeb = yHead + hHead + 26;
  const webBandH = bandH * sc1;
  const ySec = yWeb + webBandH + 60;
  const yTbl = ySec + secH + 46, Htot = yTbl + 122;

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
        <text x={W - 30} y={yWeb - 8} className="svg-dim-t" textAnchor="end">{L('지지부재는 미표시(형상 미산정)', 'Support not drawn (not designed)')}</text>
        <g transform={`translate(60,${yWeb + webBandH / 2})`}>
          {/* 피지지보 플랜지대(측면) — 부재 끝은 지지면에서 갭(gap)만큼 물러나 있다(전단판이 갭 구간을 덮음) */}
          <rect x={gap * sc1} y={-H * sc1 / 2} width={(rightW - gap) * sc1} height={flT} className="svg-flange-band" />
          <rect x={gap * sc1} y={H * sc1 / 2 - flT} width={(rightW - gap) * sc1} height={flT} className="svg-flange-band" />
          <line x1={gap * sc1} y1={-H * sc1 / 2} x2={gap * sc1} y2={H * sc1 / 2} className="svg-dim-l" />
          <text x={gap * sc1} y={-H * sc1 / 2 - 6} className="svg-dim-t" textAnchor="middle">{L(`갭${gap}`, `gap${gap}`)}</text>
          {/* 전단판(양측 2매 — 측면에서는 겹쳐 보임, 갭 구간 전체를 덮으며 지지면(x=0)에서 시작) */}
          <rect x={0} y={-plate.L * sc1 / 2} width={plate.w * sc1} height={plate.L * sc1} className="svg-plate-h" />
          <text x={plate.w * sc1 / 2} y={-plate.L * sc1 / 2 - 6} className="svg-dim-t" textAnchor="middle">{L('전단판 ×2', 'Plate ×2')}</text>
          {/* 볼트 */}
          {colX.flatMap((cx, ci) => rowY.map((ry, ri) => <Cross key={`b${ci}${ri}`} x={cx * sc1} y={ry * sc1} />))}
          <DimV x={plate.w * sc1 + 16} cy={0} vals={vCh} sc={sc1} />
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

        {/* ── 정보표(H {H}x{B}x{tf}/{tw} (SHEAR CONNECT) 제목 + WEB/FLG(EXT.)/FLG(INT.) 3행 —
             400200dd.dxf 샘플과 동일 구조. SC는 플랜지 이음판이 없어 FLG 두 행은 "-") ── */}
        <rect x={30} y={yTbl} width={W - 60} height={26} className="svg-cell" />
        <text x={mid} y={yTbl + 18} className="svg-title" textAnchor="middle">
          {sec ? `H ${sec.H}x${sec.B}x${sec.tw}/${sec.tf} (SHEAR CONNECT)` : r.section}
        </text>
        <rect x={30} y={yTbl + 26} width={W - 60} height={70} className="svg-cell" />
        {[1, 2].map(i => <line key={i} x1={30} y1={yTbl + 26 + 23.3 * i} x2={W - 30} y2={yTbl + 26 + 23.3 * i} className="svg-dim-l" />)}
        <line x1={108} y1={yTbl + 26} x2={108} y2={yTbl + 96} className="svg-dim-l" />
        {([
          ['WEB', `${r.boltCount}-M${dia}(${cond.bolt}) / ${plate.w}x${plate.L}x${plate.t}t(${cond.plateSteel ?? cond.steel}, 2EA)`],
          ['FLG(EXT.)', '-'],
          ['FLG(INT.)', '-'],
        ] as const).map(([l1, v1], i) => {
          const y = yTbl + 26 + 23.3 * i + 15;
          return <g key={i}>
            <text x={35} y={y} className="svg-tblk" style={{ fontSize: '9px' }}>{l1}</text>
            <text x={113} y={y} className="svg-tblv" style={{ fontSize: '8.3px' }}>{v1}</text>
          </g>;
        })}
        <text x={35} y={yTbl + 110} className="svg-dim-t">{L(`지배 ${r.govId} · DCR ${r.govDcr.toFixed(2)} · ${r.ok ? 'OK' : 'NG'} (그립 ${r.boltGrip}mm)`, `Gov. ${r.govId} · DCR ${r.govDcr.toFixed(2)} · ${r.ok ? 'OK' : 'NG'} (grip ${r.boltGrip}mm)`)}</text>
      </svg>
    </div>
  );
}
