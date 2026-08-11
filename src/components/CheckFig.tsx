// 상세계산서 검토별 파단선/검토선 도해.
//   블록전단: 실제 볼트배치(열·피치·연단·폭)로 Case A/B/C/D 파단선을 실측 작도 —
//     전단면(빨강 실선, 하중방향)·인장면(파랑 점선, 직각)·탈락 블록(앰버 해치), 지배 케이스 강조.
//     참조: Thornton Tomasetti Flange Plate&Bar(15th) Case A~D / AISC J4.3 U자형·분할 파단.
//   기타 한계상태: 조항(clause)별 검토 글리프.
import type { ReactNode } from 'react';
import type { AiscCheck, BlockCase, BlockShearGeom } from '../engine/aisc/types.ts';
import type { Lang } from '../i18n.ts';
import { caseLabel } from './aiscI18n.ts';

const SHEAR = '#d1495b', TENSION = '#2c6fbb', BLOCKF = 'rgba(245,184,71,.18)', BLOCKS = '#e0a92e',
  HOLE = '#8b93a0', PLATE = '#9aa1ab', LOAD = '#12a794', INK = '#333';

let HID = 0;   // 해치 pattern 고유 id

// 케이스 문자 → 파단 기하(전단열 y[], 인장구간 [lo,hi]). cols·halfWidth(mm) 기준.
function fracture(letter: string, cols: number[], halfWidth: number): { shearYs: number[]; tenLo: number; tenHi: number } {
  const maxC = Math.max(...cols.map(v => Math.abs(v)));
  const innerAbs = cols.map(v => Math.abs(v)).filter(v => v > 0.1);
  const minC = innerAbs.length ? Math.min(...innerAbs) : maxC;
  switch (letter) {
    case 'A': return { shearYs: [maxC], tenLo: maxC, tenHi: halfWidth };        // 외연 L: 1전단 + 최외곽열→판단 인장
    case 'B': return { shearYs: [minC], tenLo: 0, tenHi: minC };                // 중앙 L: 1전단 + 최내곽열→CL 인장
    case 'D': return { shearYs: [-minC, minC], tenLo: -minC, tenHi: minC };     // 내측 페어 U: 2전단 + 내측쌍 인장
    default:  return { shearYs: [-maxC, maxC], tenLo: -maxC, tenHi: maxC };     // C 전열 U: 2전단 + 전폭 인장
  }
}

function BsPanel({ c, geom, lang }: { c: BlockCase; geom: BlockShearGeom; lang: Lang }) {
  const vertical = !!geom.vertical, stag = !!geom.staggered;   // 웨브=수직 전단, 엇모=지그재그
  const W = 176, H = vertical ? 150 : 118, pad = 12, aw = 16;  // aw=하중화살표 여백
  const Lv = geom.edge + (geom.nrow - 1) * geom.pitch;
  const stagLen = stag ? geom.pitch / 2 : 0;
  const lenTot = Lv + geom.edge + stagLen;                     // u축: 자유단~후단
  const widTot = 2 * geom.halfWidth;                           // v축: 폭
  const sc = Math.min(((vertical ? H : W) - 2 * pad - aw) / lenTot, ((vertical ? W : H) - 2 * pad) / widTot);
  const u0 = pad + aw, vc = (vertical ? W : H) / 2;
  // u=전단선방향(자유단 0→), v=폭(중심 0). 수직이면 u=세로.
  const map = (u: number, v: number): [number, number] => vertical ? [vc + v * sc, u0 + u * sc] : [u0 + u * sc, vc - v * sc];
  const letter = (c.label[0] || 'C').toUpperCase();
  const f = fracture(letter, geom.cols, geom.halfWidth);
  const br = Math.max(1.3, geom.dh / 2 * sc);
  const pid = 'bsh' + (HID++);
  const onShear = (v: number) => f.shearYs.some(s => Math.abs(s - v) < 0.1);
  const uBolt = (i: number, ci: number) => geom.edge + i * geom.pitch + (stag ? (ci % 2) * stagLen : 0);
  const rct = (u1: number, v1: number, u2: number, v2: number) => {
    const [x1, y1] = map(u1, v1), [x2, y2] = map(u2, v2);
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  };
  const plate = rct(0, -geom.halfWidth, lenTot, geom.halfWidth);
  const block = rct(0, f.tenLo, Lv, f.tenHi);

  // 인장면 — 엇모 U블록은 열별 마지막볼트 지그재그(대각 순단면 s²/4g)
  const tenCols = geom.cols.filter(v => v >= f.tenLo - 0.1 && v <= f.tenHi + 0.1).sort((a, b) => a - b);
  let tension: ReactNode;
  if (stag && tenCols.length >= 2) {
    const pts = tenCols.map(v => map(uBolt(geom.nrow - 1, geom.cols.indexOf(v)), v).join(',')).join(' ');
    tension = <polyline points={pts} fill="none" stroke={TENSION} strokeWidth={1.7} strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />;
  } else {
    const [tx1, ty1] = map(Lv, f.tenLo), [tx2, ty2] = map(Lv, f.tenHi);
    tension = <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke={TENSION} strokeWidth={1.8} strokeDasharray="4 3" strokeLinecap="round" />;
  }
  const [la1x, la1y] = map(-1, 0), [la2x, la2y] = map(-13, 0);
  const ahead = vertical ? `M${la2x},${la2y} l-3,5 h6 z` : `M${la2x},${la2y} l5,-3 v6 z`;
  const modeTxt = c.mode ? ` · ${c.mode}` : '';
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', maxWidth: W, height: 'auto' }}>
        <title>{caseLabel(c.label, lang)}{modeTxt}</title>
        <defs><pattern id={pid} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke={BLOCKS} strokeWidth="0.6" opacity="0.55" /></pattern></defs>
        <rect x={plate.x} y={plate.y} width={plate.w} height={plate.h} fill="none" stroke={c.gov ? BLOCKS : PLATE} strokeWidth={c.gov ? 1.6 : 1} />
        <rect x={block.x} y={block.y} width={block.w} height={block.h} fill={BLOCKF} stroke="none" />
        <rect x={block.x} y={block.y} width={block.w} height={block.h} fill={`url(#${pid})`} stroke={BLOCKS} strokeWidth="0.7" strokeDasharray="2 2" />
        <line x1={la1x} y1={la1y} x2={la2x} y2={la2y} stroke={LOAD} strokeWidth={1.4} />
        <path d={ahead} fill={LOAD} />
        <text x={vertical ? la2x + 9 : la2x} y={vertical ? la2y + 3 : la2y - 4} fontSize="8" fill={LOAD} textAnchor="middle">{vertical ? 'Vu' : 'Pf'}</text>
        {geom.cols.map((cv, ci) => Array.from({ length: geom.nrow }, (_, i) => {
          const [bx, by] = map(uBolt(i, ci), cv);
          return <circle key={`${ci}-${i}`} cx={bx} cy={by} r={br} fill="none" stroke={onShear(cv) ? INK : HOLE} strokeWidth={onShear(cv) ? 1.2 : 0.85} />;
        }))}
        {f.shearYs.map((v, i) => { const [sx1, sy1] = map(0, v), [sx2, sy2] = map(Lv, v); return <line key={i} x1={sx1} y1={sy1} x2={sx2} y2={sy2} stroke={SHEAR} strokeWidth={1.8} strokeLinecap="round" />; })}
        {tension}
      </svg>
      <div style={{ fontSize: 10, color: c.gov ? BLOCKS : 'var(--sub,#6b7280)', fontWeight: c.gov ? 700 : 500, marginTop: -1 }}>
        {caseLabel(c.label, lang)}{modeTxt} · U<sub>bs</sub>{c.Ubs.toFixed(1)}{c.gov ? ' ◀' : ''}
      </div>
    </div>
  );
}

function BlockShearFig({ cases, geom, lang }: { cases: BlockCase[]; geom: BlockShearGeom; lang: Lang }) {
  const gauge = geom.cols.length > 1 ? Math.round(Math.max(...geom.cols) - Math.min(...geom.cols)) : 0;
  return (
    <div className="cf-bs" style={{ margin: '4px 0 8px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        {cases.map((c, i) => <BsPanel key={i} c={c} geom={geom} lang={lang} />)}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--sub,#6b7280)', marginTop: 3 }}>
        {lang === 'ko'
          ? `실측 작도: 볼트 ${geom.cols.length}열 × ${geom.nrow}행, 피치 s=${geom.pitch}, 연단 e=${geom.edge}, 게이지 ${gauge}, 폭 ${Math.round(2 * geom.halfWidth)}mm${geom.plates === 2 ? ' (×2매)' : ''}${geom.vertical ? ' · 수직 전단(웨브 Vu)' : ''}${geom.staggered ? ' · 엇모 지그재그(+s²/4g)' : ''}. 빨강=전단면·파랑점선=인장면·해치=탈락블록.`
          : `To scale: ${geom.cols.length} cols × ${geom.nrow} rows, pitch s=${geom.pitch}, edge e=${geom.edge}, gauge ${gauge}, width ${Math.round(2 * geom.halfWidth)}mm${geom.plates === 2 ? ' (×2)' : ''}${geom.vertical ? ' · vertical shear (web Vu)' : ''}${geom.staggered ? ' · staggered zig-zag (+s²/4g)' : ''}. red=shear, blue-dash=tension, hatch=tear-out block.`}
      </div>
    </div>
  );
}

// 조항별 단일 글리프(48×34)
function Glyph({ clause }: { clause: string }) {
  const P = { width: 48, height: 34, viewBox: '0 0 60 40' } as const;
  const holes = [16, 30, 44].map(x => <circle key={x} cx={x} cy={20} r={3} fill="none" stroke={HOLE} strokeWidth={1.3} />);
  const plate = <rect x={2} y={8} width={56} height={24} rx={2} fill="none" stroke={PLATE} strokeWidth={1.3} />;
  let body: ReactNode = null;
  if (clause === 'J3.6') body = <>
    <rect x={2} y={7} width={56} height={7} fill="none" stroke={PLATE} strokeWidth={1} /><rect x={2} y={26} width={56} height={7} fill="none" stroke={PLATE} strokeWidth={1} />
    <line x1={30} y1={4} x2={30} y2={36} stroke={SHEAR} strokeWidth={2} /><circle cx={30} cy={20} r={3.2} fill="none" stroke={HOLE} strokeWidth={1.2} /></>;
  else if (clause === 'J3.8') body = <>{plate}<circle cx={20} cy={20} r={3.2} fill="none" stroke={HOLE} strokeWidth={1.2} /><circle cx={40} cy={20} r={3.2} fill="none" stroke={HOLE} strokeWidth={1.2} />
    <path d="M8,20 h44" stroke={LOAD} strokeWidth={1} strokeDasharray="2 2" /></>;
  else if (clause === 'J3.10') body = <>{plate}<circle cx={20} cy={20} r={4} fill="none" stroke={HOLE} strokeWidth={1.3} />
    <path d="M25,15 A6 6 0 0 1 25,25" fill="none" stroke={SHEAR} strokeWidth={2} /><line x1={4} y1={15} x2={15} y2={15} stroke={SHEAR} strokeWidth={1.6} strokeDasharray="3 2" /><line x1={4} y1={25} x2={15} y2={25} stroke={SHEAR} strokeWidth={1.6} strokeDasharray="3 2" /></>;
  else if (clause === 'J4.1') body = <><rect x={2} y={8} width={56} height={24} rx={2} fill={BLOCKF} stroke={PLATE} strokeWidth={1.1} />{holes}</>;
  else if (clause === 'J4.2') body = <>{plate}<line x1={30} y1={6} x2={30} y2={34} stroke={TENSION} strokeWidth={2} strokeDasharray="4 3" />{holes}</>;
  else if (clause.startsWith('J4.4')) body = <>{plate}<path d="M12,20 C22,10 38,30 48,20" fill="none" stroke={SHEAR} strokeWidth={2} strokeDasharray="4 2" /></>;
  else if (clause === 'F13.1') body = <><rect x={4} y={7} width={52} height={7} fill={BLOCKF} stroke={PLATE} strokeWidth={1} /><rect x={26} y={7} width={8} height={26} fill="none" stroke={PLATE} strokeWidth={1} /><line x1={30} y1={5} x2={30} y2={16} stroke={TENSION} strokeWidth={1.8} strokeDasharray="3 2" /><circle cx={16} cy={10.5} r={2.4} fill="none" stroke={HOLE} strokeWidth={1} /><circle cx={44} cy={10.5} r={2.4} fill="none" stroke={HOLE} strokeWidth={1} /></>;
  else if (clause.startsWith('D2')) body = <><rect x={4} y={8} width={52} height={7} fill="none" stroke={PLATE} strokeWidth={1} /><rect x={26} y={8} width={8} height={25} fill="none" stroke={PLATE} strokeWidth={1} /><line x1={4} y1={11.5} x2={56} y2={11.5} stroke={TENSION} strokeWidth={1.6} strokeDasharray="3 2" /></>;
  else if (clause.startsWith('G2')) body = <>{plate}<line x1={10} y1={12} x2={50} y2={28} stroke={SHEAR} strokeWidth={2} strokeDasharray="4 2" /></>;
  else return null;
  return <svg {...P} role="img" style={{ flex: '0 0 auto' }}>{body}</svg>;
}

/** 검토별 도해: 블록전단은 실측 파단선 패널, 그 외는 조항 글리프. */
export default function CheckFig({ c, lang }: { c: AiscCheck; lang: Lang }) {
  if (c.cases && c.cases.length && c.bsGeom) return <BlockShearFig cases={c.cases} geom={c.bsGeom} lang={lang} />;
  const g = <Glyph clause={c.clause} />;
  if (!g) return null;
  return <div className="cf-glyph" style={{ float: 'right', marginLeft: 8 }}>{g}</div>;
}
