// 상세계산서 검토별 파단선/검토선 도해 — "무엇을 검토하는가"를 시각화.
//   블록전단: Case A/B/C/D별 전단면(빨강 실선)·인장면(파랑 점선)·탈락 블록(해치), 지배 케이스 강조.
//   기타 한계상태: 조항(clause)별 파단·검토 글리프.
// 색: 전단=빨강, 인장=파랑(점선), 블록=앰버 해치 — 인쇄·화면 공통 관례색.
import type { ReactNode } from 'react';
import type { AiscCheck, BlockCase } from '../engine/aisc/types.ts';
import type { Lang } from '../i18n.ts';
import { caseLabel } from './aiscI18n.ts';

const SHEAR = '#d1495b', TENSION = '#2c6fbb', BLOCK = 'rgba(245,184,71,.22)', BLOCKS = '#e0a92e', HOLE = '#8b93a0', PLATE = '#9aa1ab', LOAD = '#12a594';

// 미니 패널 좌표(폭=세로, 하중=가로, 자유단=우측)
const COLS = [19, 33, 47, 61], CL = 40, TOP = 11, ROWS = [54, 78], EDGE = 93, TNX = 54;
interface CaseGeo { shears: number[]; tn: [number, number]; blk: [number, number]; sep: number[]; }
const CASE_GEO: Record<string, CaseGeo> = {
  C: { shears: [COLS[0], COLS[3]], tn: [COLS[0], COLS[3]], blk: [COLS[0], COLS[3]], sep: [0, 1, 2, 3] },
  A: { shears: [COLS[0]], tn: [TOP, COLS[0]], blk: [TOP, COLS[0]], sep: [0] },
  B: { shears: [COLS[1]], tn: [COLS[1], CL], blk: [COLS[1], CL], sep: [1] },
  D: { shears: [COLS[1], COLS[2]], tn: [COLS[1], COLS[2]], blk: [COLS[1], COLS[2]], sep: [1, 2] },
};

function BsPanel({ c, lang }: { c: BlockCase; lang: Lang }) {
  const letter = (c.label[0] || 'C').toUpperCase();
  const g = CASE_GEO[letter] ?? CASE_GEO.C;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 104 76" role="img" style={{ width: 104, height: 76, maxWidth: '100%' }}>
        <title>{caseLabel(c.label, lang)}</title>
        <rect x={6} y={10} width={92} height={56} rx={3} fill="none" stroke={c.gov ? BLOCKS : PLATE} strokeWidth={c.gov ? 1.8 : 1.2} />
        {/* 하중 화살표 */}
        <line x1={34} y1={CL} x2={12} y2={CL} stroke={LOAD} strokeWidth={1.4} />
        <path d={`M12,${CL} l5,-3 v6 z`} fill={LOAD} />
        {/* 탈락 블록 */}
        <rect x={TNX} y={g.blk[0]} width={EDGE - TNX} height={g.blk[1] - g.blk[0]} fill={BLOCK} stroke={BLOCKS} strokeWidth={0.8} strokeDasharray="2 2" />
        {/* 볼트 */}
        {COLS.map((cy, ci) => ROWS.map((cx) => {
          const sep = g.sep.includes(ci);
          return <circle key={`${ci}-${cx}`} cx={cx} cy={cy} r={3.4} fill="none" stroke={sep ? '#333' : HOLE} strokeWidth={sep ? 1.3 : 1} />;
        }))}
        {/* 전단면(실선) */}
        {g.shears.map((y, i) => <line key={i} x1={TNX} y1={y} x2={EDGE} y2={y} stroke={SHEAR} strokeWidth={2} strokeLinecap="round" />)}
        {/* 인장면(점선) */}
        <line x1={TNX} y1={g.tn[0]} x2={TNX} y2={g.tn[1]} stroke={TENSION} strokeWidth={2} strokeDasharray="4 3" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 10.5, color: c.gov ? BLOCKS : 'inherit', fontWeight: c.gov ? 700 : 500, marginTop: -2 }}>
        {caseLabel(c.label, lang)}{c.gov ? ' ◀' : ''}
      </div>
    </div>
  );
}

function BlockShearFig({ cases, lang }: { cases: BlockCase[]; lang: Lang }) {
  return (
    <div className="cf-bs" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '4px 0 8px', alignItems: 'flex-start' }}>
      {cases.map((c, i) => <BsPanel key={i} c={c} lang={lang} />)}
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
  else if (clause === 'J4.1') body = <><rect x={2} y={8} width={56} height={24} rx={2} fill={BLOCK} stroke={PLATE} strokeWidth={1.1} />{holes}</>;
  else if (clause === 'J4.2') body = <>{plate}<line x1={30} y1={6} x2={30} y2={34} stroke={TENSION} strokeWidth={2} strokeDasharray="4 3" />{holes}</>;
  else if (clause.startsWith('J4.4')) body = <>{plate}<path d="M12,20 C22,10 38,30 48,20" fill="none" stroke={SHEAR} strokeWidth={2} strokeDasharray="4 2" /></>;
  else if (clause === 'F13.1') body = <><rect x={4} y={7} width={52} height={7} fill={BLOCK} stroke={PLATE} strokeWidth={1} /><rect x={26} y={7} width={8} height={26} fill="none" stroke={PLATE} strokeWidth={1} /><line x1={30} y1={5} x2={30} y2={16} stroke={TENSION} strokeWidth={1.8} strokeDasharray="3 2" /><circle cx={16} cy={10.5} r={2.4} fill="none" stroke={HOLE} strokeWidth={1} /><circle cx={44} cy={10.5} r={2.4} fill="none" stroke={HOLE} strokeWidth={1} /></>;
  else if (clause.startsWith('D2')) body = <><rect x={4} y={8} width={52} height={7} fill="none" stroke={PLATE} strokeWidth={1} /><rect x={26} y={8} width={8} height={25} fill="none" stroke={PLATE} strokeWidth={1} /><line x1={4} y1={11.5} x2={56} y2={11.5} stroke={TENSION} strokeWidth={1.6} strokeDasharray="3 2" /></>;
  else if (clause.startsWith('G2')) body = <>{plate}<line x1={10} y1={12} x2={50} y2={28} stroke={SHEAR} strokeWidth={2} strokeDasharray="4 2" /></>;
  else return null;
  return <svg {...P} role="img" style={{ flex: '0 0 auto' }}>{body}</svg>;
}

/** 검토별 도해: 블록전단은 Case별 파단선 패널, 그 외는 조항 글리프. */
export default function CheckFig({ c, lang }: { c: AiscCheck; lang: Lang }) {
  if (c.cases && c.cases.length) return <BlockShearFig cases={c.cases} lang={lang} />;
  const g = <Glyph clause={c.clause} />;
  if (!g) return null;
  return <div className="cf-glyph" style={{ float: 'right', marginLeft: 8 }}>{g}</div>;
}
