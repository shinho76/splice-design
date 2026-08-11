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
  const W = 176, H = 116, pad = 12, aw = 16;   // aw=하중화살표 여백
  const Lv = geom.edge + (geom.nrow - 1) * geom.pitch;
  const lenTot = Lv + geom.edge;               // 자유단~마지막볼트 + 후단 여유
  const widTot = 2 * geom.halfWidth;
  const sc = Math.min((W - 2 * pad - aw) / lenTot, (H - 2 * pad) / widTot);
  const ox = pad + aw, oy = H / 2;
  const mx = (x: number) => ox + x * sc;       // 하중방향(자유단 x=0 → 우측)
  const my = (y: number) => oy - y * sc;       // 폭방향(중심 y=0)
  const letter = (c.label[0] || 'C').toUpperCase();
  const f = fracture(letter, geom.cols, geom.halfWidth);
  const br = Math.max(1.4, geom.dh / 2 * sc);
  const pid = 'bsh' + (HID++);

  const rows = Array.from({ length: geom.nrow }, (_, i) => geom.edge + i * geom.pitch);
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', maxWidth: W, height: 'auto' }}>
        <title>{caseLabel(c.label, lang)}</title>
        <defs>
          <pattern id={pid} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke={BLOCKS} strokeWidth="0.6" opacity="0.55" />
          </pattern>
        </defs>
        {/* 판 외곽 */}
        <rect x={mx(0)} y={my(geom.halfWidth)} width={lenTot * sc} height={widTot * sc}
          fill="none" stroke={c.gov ? BLOCKS : PLATE} strokeWidth={c.gov ? 1.6 : 1} />
        {/* 탈락 블록(자유단~인장선, 전단열 사이) */}
        <rect x={mx(0)} y={my(f.tenHi)} width={Lv * sc} height={(f.tenHi - f.tenLo) * sc}
          fill={BLOCKF} stroke="none" />
        <rect x={mx(0)} y={my(f.tenHi)} width={Lv * sc} height={(f.tenHi - f.tenLo) * sc}
          fill={`url(#${pid})`} stroke={BLOCKS} strokeWidth="0.7" strokeDasharray="2 2" />
        {/* 하중 Pf ← */}
        <line x1={mx(0) - 3} y1={oy} x2={pad} y2={oy} stroke={LOAD} strokeWidth={1.4} />
        <path d={`M${pad},${oy} l5,-3 v6 z`} fill={LOAD} />
        {/* 볼트 */}
        {geom.cols.map((cy, ci) => rows.map((rx, ri) => (
          <circle key={`${ci}-${ri}`} cx={mx(rx)} cy={my(cy)} r={br} fill="none"
            stroke={f.shearYs.some(s => Math.abs(s - cy) < 0.1) ? INK : HOLE}
            strokeWidth={f.shearYs.some(s => Math.abs(s - cy) < 0.1) ? 1.2 : 0.9} />
        )))}
        {/* 전단면(하중방향 실선, 자유단→마지막볼트) */}
        {f.shearYs.map((y, i) => (
          <line key={i} x1={mx(0)} y1={my(y)} x2={mx(Lv)} y2={my(y)} stroke={SHEAR} strokeWidth={1.8} strokeLinecap="round" />
        ))}
        {/* 인장면(직각 점선, 마지막볼트열) */}
        <line x1={mx(Lv)} y1={my(f.tenLo)} x2={mx(Lv)} y2={my(f.tenHi)} stroke={TENSION} strokeWidth={1.8} strokeDasharray="4 3" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 10, color: c.gov ? BLOCKS : 'var(--sub,#6b7280)', fontWeight: c.gov ? 700 : 500, marginTop: -1 }}>
        {caseLabel(c.label, lang)} · U<sub>bs</sub>{c.Ubs.toFixed(1)}{c.gov ? ' ◀' : ''}
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
          ? `실측 작도: 볼트 ${geom.cols.length}열 × ${geom.nrow}행, 피치 s=${geom.pitch}, 연단 e=${geom.edge}, 게이지 ${gauge}, 폭 ${Math.round(2 * geom.halfWidth)}mm${geom.plates === 2 ? ' (×2매)' : ''}. 빨강=전단면·파랑점선=인장면·해치=탈락블록.`
          : `To scale: ${geom.cols.length} cols × ${geom.nrow} rows, pitch s=${geom.pitch}, edge e=${geom.edge}, gauge ${gauge}, width ${Math.round(2 * geom.halfWidth)}mm${geom.plates === 2 ? ' (×2)' : ''}. red=shear, blue-dash=tension, hatch=tear-out block.`}
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
