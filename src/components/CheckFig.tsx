// 상세계산서 검토별 파단선/검토선 도해.
//   블록전단: bsPatterns 단일 소스의 viz(전단·인장·탈락)를 실 볼트배치로 작도 —
//     전단면(빨강 실선, ∥하중)·인장면(파랑 실선, ⊥하중, 계단)·탈락 블록(앰버 해치), 지배 Path 강조.
//   후보 Path 전체를 나열(각 케이스 DCR). 기타 한계상태: 조항(clause)별 글리프.
import type { ReactNode } from 'react';
import type { AiscCheck, BlockCase, BlockShearGeom, NetPath, NetSectionGeom } from '../engine/aisc/types.ts';
import type { Lang } from '../i18n.ts';

const SHEAR = '#d1495b', TENSION = '#2c6fbb', BLOCKF = 'rgba(245,184,71,.18)', BLOCKS = '#e0a92e',
  HOLE = '#8b93a0', PLATE = '#9aa1ab', LOAD = '#12a794', INK = '#333';

type Pt = [number, number];
// 다각형 45° 해치(해석적 클리핑) — 어떤 렌더러/인쇄에서도 안전
function Hatch({ poly }: { poly: Pt[] }) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const inside = (x: number, y: number) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) c = !c; } return c; };
  const it = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) => { const r1 = bx - ax, r2 = by - ay, s1 = dx - cx, s2 = dy - cy, den = r1 * s2 - r2 * s1; if (Math.abs(den) < 1e-9) return null; const t = ((cx - ax) * s2 - (cy - ay) * s1) / den, u = ((cx - ax) * r2 - (cy - ay) * r1) / den; return (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) ? t : null; };
  const segs: Pt[][] = [];
  for (let c = x0 - y1; c <= x1 - y0; c += 5.5) {
    const Ax = c + y0, Ay = y0, Bx = c + y1, By = y1, ts: number[] = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const t = it(Ax, Ay, Bx, By, poly[i][0], poly[i][1], poly[j][0], poly[j][1]); if (t != null) ts.push(t); }
    if (ts.length < 2) continue; ts.sort((a, b) => a - b);
    for (let k = 0; k < ts.length - 1; k++) { const tm = (ts[k] + ts[k + 1]) / 2; if (!inside(Ax + (Bx - Ax) * tm, Ay + (By - Ay) * tm)) continue; segs.push([[Ax + (Bx - Ax) * ts[k], Ay + (By - Ay) * ts[k]], [Ax + (Bx - Ax) * ts[k + 1], Ay + (By - Ay) * ts[k + 1]]]); }
  }
  const ptStr = poly.map(p => p.join(',')).join(' ');
  return <>
    <polygon points={ptStr} fill={BLOCKF} />
    {segs.map((s, i) => <line key={i} x1={s[0][0]} y1={s[0][1]} x2={s[1][0]} y2={s[1][1]} stroke={BLOCKS} strokeWidth={0.7} opacity={0.6} />)}
    <polygon points={ptStr} fill="none" stroke={BLOCKS} strokeWidth={0.9} strokeDasharray="3 2" />
  </>;
}

// 한 케이스(Path) 패널 — c.viz(x=하중축, y=폭; 웨브는 x=춤·y=축[이음면0→외곽])를 실측 작도
function BsPanel({ c, geom }: { c: BlockCase; geom: BlockShearGeom }) {
  const viz = c.viz; if (!viz) return null;
  const vertical = !!geom.vertical, stag = !!geom.staggered;
  const nHi = geom.nHi ?? geom.nrow, nLo = geom.nLo ?? geom.nrow;
  const mx = Math.max(...geom.cols.map(v => Math.abs(v)));
  const stagOf = (cv: number) => { const isOut = Math.abs(cv) >= mx - 0.5; const rows = stag ? (isOut ? nHi : nLo) : geom.nrow; const off = (stag && !isOut) ? 45 : 0; const pit = stag ? 90 : geom.pitch; return { rows, off, pit }; };
  const iE = (geom as any).innerEdge as number | undefined;   // 내부판 끝선(웨브측)
  const wb = (geom as any).webBar as number | undefined;
  // (x,y) bbox — viz + 판폭/판단 + 볼트. 웨브는 축좌표 이음면(0)→외곽(양수, 한쪽 절반).
  const pts: Pt[] = [...viz.shear.flatMap(s => [[s.x0, s.y], [s.x1, s.y]] as Pt[]), ...viz.tension.flat(), ...viz.tear.flat()];
  const xs = pts.map(p => p[0]).concat([geom.edge]);
  const ys = vertical ? pts.map(p => p[1]).concat([0, mx + geom.edge]) : pts.map(p => p[1]).concat([geom.halfWidth, -geom.halfWidth]);
  const XT = Math.max(...xs), Xj = XT + geom.edge, ymax = Math.max(...ys), ymin = Math.min(...ys), yMid = (ymax + ymin) / 2;
  const W = 232, H = vertical ? 208 : 150, pad = 12, aw = 42;
  const lenTot = Xj, widTot = ymax - ymin;
  const sc = Math.min(((vertical ? H : W) - 2 * pad - aw) / lenTot, ((vertical ? W : H) - 2 * pad - (vertical ? aw : 0)) / (widTot || 1));
  const u0 = pad + aw, cc = vertical ? (W + aw) / 2 : H / 2;
  // 웨브(vertical): 이음면(y=0) 우측, 외곽 좌측(→ Vu·전단선이 좌측). 그 외: x=하중축(우=이음).
  const map = (x: number, y: number): Pt => vertical ? [cc - (y - yMid) * sc, u0 + x * sc] : [u0 + x * sc, cc - (y - yMid) * sc];
  const M = (p: Pt) => map(p[0], p[1]);
  const br = Math.max(1.3, (geom.dh / 2) * sc);
  const plate = (() => { const a = map(0, ymax), b = map(Xj, ymin); return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }; })();
  const onShear = (y: number) => viz.shear.some(s => Math.abs(s.y - y) < 0.5);
  const loadLbl = geom.loadDir === 'H' ? 'Hu' : vertical ? 'Vu' : 'Pf';
  // 하중 화살표 — 웨브는 전단선(외곽열) 좌측·하향, 그 외는 자유단(좌측)에서 우향.
  const shearMaxX = Math.max(...viz.shear.map(s => s.x1), XT);
  let ld: { x1: number; y1: number; x2: number; y2: number; head: string; lx: number; ly: number };
  if (vertical) {
    const topY = map(0, mx)[1], botY = map(shearMaxX, mx)[1], vx = plate.x - 8;
    ld = { x1: vx, y1: topY, x2: vx, y2: botY - 3, head: `M${vx},${botY} l-6,-12 h12 z`, lx: vx, ly: topY - 5 };
  } else {
    const la0 = map(0, yMid), lax = la0[0] - (aw - 8);
    ld = { x1: lax, y1: la0[1], x2: la0[0], y2: la0[1], head: `M${lax},${la0[1]} l14,-7 v14 z`, lx: lax, ly: la0[1] - 8 };
  }
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', maxWidth: W, height: 'auto', background: '#fff', borderRadius: 5 }}>
        <title>{c.path ?? ''}</title>
        {vertical ? (() => {
          // 웨브: 판 좌측선(외측단, Vu 화살표 우측)만 점선, 상·우·하 3면 실선
          const Lx = plate.x, Rx = plate.x + plate.w, Ty = plate.y, By = plate.y + plate.h;
          const col = c.gov ? BLOCKS : PLATE, sw = c.gov ? 1.5 : 1;
          return <>
            <polyline points={`${Lx},${By} ${Rx},${By} ${Rx},${Ty} ${Lx},${Ty}`} fill="none" stroke={col} strokeWidth={sw} />
            <line x1={Lx} y1={Ty} x2={Lx} y2={By} stroke={col} strokeWidth={sw} strokeDasharray="4 3" />
          </>;
        })() : (
          <rect x={plate.x} y={plate.y} width={plate.w} height={plate.h} fill="none" stroke={c.gov ? BLOCKS : PLATE} strokeWidth={c.gov ? 1.5 : 1} />
        )}
        {/* WEB 바(내부·부재) */}
        {wb ? (() => { const a = map(0, wb), b = map(Xj, -wb); return <rect x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} fill="#2b3038" opacity={0.5} />; })() : null}
        {/* 끝선(웨브측 판단부) — ±iE 실선. 내부판=내부판 끝선, 부재=웨브 경계 */}
        {iE != null && !vertical ? [iE, -iE].map((ye, k) => { const a = map(0, ye), b = map(Xj, ye); return <line key={`ie${k}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={BLOCKS} strokeWidth={1.3} />; }) : null}
        {/* 탈락블록 */}
        {viz.tear.map((poly, i) => <Hatch key={i} poly={poly.map(M)} />)}
        {/* 하중 화살표 */}
        <line x1={ld.x1} y1={ld.y1} x2={ld.x2} y2={ld.y2} stroke={LOAD} strokeWidth={4} strokeLinecap="round" />
        <path d={ld.head} fill={LOAD} />
        <text x={ld.lx} y={ld.ly} fontSize={13} fontWeight={800} fill={LOAD} textAnchor="middle">{loadLbl}</text>
        {/* 볼트 */}
        {geom.cols.map((cv, ci) => { const { rows, off, pit } = stagOf(cv); return Array.from({ length: rows }, (_, i) => { const [bx, by] = map(geom.edge + off + i * pit, cv); return <circle key={`${ci}-${i}`} cx={bx} cy={by} r={br} fill="none" stroke={onShear(cv) ? INK : HOLE} strokeWidth={onShear(cv) ? 1.2 : 0.85} />; }); })}
        {/* 전단면(빨강 ∥하중) */}
        {viz.shear.map((s, i) => { const [x1, y1] = map(s.x0, s.y), [x2, y2] = map(s.x1, s.y); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={SHEAR} strokeWidth={2} strokeLinecap="round" />; })}
        {/* 인장면(파랑 계단) */}
        {viz.tension.map((poly, i) => <polyline key={i} points={poly.map(M).map(p => p.join(',')).join(' ')} fill="none" stroke={TENSION} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />)}
        {/* 이음 CL — 웨브는 이음면(y=0) 수직, 그 외는 이음측(x=Xj) */}
        {(() => { const a = vertical ? map(0, 0) : map(Xj, ymax), b = vertical ? map(Xj, 0) : map(Xj, ymin); return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={HOLE} strokeWidth={0.8} strokeDasharray="7 3 2 3" />; })()}
        {c.path ? <text x={4} y={12} fontSize={11} fontWeight={700} fill={c.gov ? BLOCKS : INK}>{c.path}</text> : null}
      </svg>
      <div style={{ fontSize: 10.5, color: c.gov ? BLOCKS : 'var(--sub,#6b7280)', fontWeight: c.gov ? 700 : 500, marginTop: -1 }}>
        <b>{c.path}</b> · U<sub>bs</sub>{c.Ubs.toFixed(1)} · DCR {(c.dcr ?? 0).toFixed(2)}{c.gov ? ' ◀' : ''}
      </div>
    </div>
  );
}

function BlockShearFig({ cases, geom, lang }: { cases: BlockCase[]; geom: BlockShearGeom; lang: Lang }) {
  return (
    <div className="cf-bs" style={{ margin: '4px 0 8px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        {cases.filter(c => c.viz).map((c, i) => <BsPanel key={i} c={c} geom={geom} />)}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--sub,#6b7280)', marginTop: 3 }}>
        {lang === 'ko'
          ? `AISIsplice Path 실측 작도 · 볼트 ${geom.cols.length}열×${geom.nrow}행, 피치 ${geom.pitch}, 연단 ${geom.edge}, 폭 ${Math.round(2 * geom.halfWidth)}mm${geom.plates === 2 ? ' (×2매)' : ''}${geom.vertical ? ' · 수직전단(Vu)·이음면 한쪽 절반' : ''}${geom.staggered ? ' · 엇모 계단(+s²/4g)' : ''}. 빨강=전단면·파랑=인장면·해치=탈락블록. 각 Path DCR 표기(지배 ◀).`
          : `To-scale AISIsplice paths. red=shear, blue=tension, hatch=tear-out. DCR per path (governing ◀).`}
      </div>
    </div>
  );
}

// ── 엇모 순단면 인장파단(B4.3b) 후보경로 패널 ──
//   판폭(세로)을 관통하는 파단선을 실측 작도. u=응력축(우=이음), y=폭.
//   전열 지그재그(계단, +Σs²/4g) · 정렬위상별 직선. 공제 구멍 강조, 지배 경로 앰버.
function NetPanel({ path, geom, govKey }: { path: NetPath; geom: NetSectionGeom; govKey: string }) {
  const gov = path.key === govKey;
  const { edge, pitch, width } = geom;
  const lines = geom.lines.slice().sort((a, b) => b.y - a.y);  // 위(+y)→아래(−y)
  const uOf = (l: { off: number; rows: number }) => edge + l.off + Math.max(0, l.rows - 1) * pitch;  // 이음측 마지막 행
  const maxLastU = Math.max(...lines.map(uOf));
  const uEnd = maxLastU + edge, yTop = width / 2, yBot = -width / 2;
  const W = 176, H = 150, pad = 12, aw = 24;
  const sc = Math.min((W - 2 * pad - aw) / (uEnd || 1), (H - 2 * pad) / (width || 1));
  const padL = pad + aw;
  const map = (u: number, y: number): Pt => [padL + u * sc, pad + (yTop - y) * sc];
  const br = Math.max(1.4, (geom.dh / 2) * sc);
  // 파단경로 폴리라인 + 공제 구멍 판정
  const phaseOff = path.key[0] === 's' ? Number(path.key.slice(1)) : null;
  const cut = (l: { off: number }) => phaseOff == null || Math.abs(l.off - phaseOff) < 0.5;   // 이 경로가 지나는(공제) 게이지선
  let poly: Pt[];
  if (phaseOff == null) {                              // 전열 지그재그
    const lp = lines.map(l => map(uOf(l), l.y));
    poly = [map(uOf(lines[0]), yTop), ...lp, map(uOf(lines[lines.length - 1]), yBot)];
  } else {                                             // 직선(정렬 위상)
    const l0 = lines.find(cut)!, uS = uOf(l0);
    poly = [map(uS, yTop), map(uS, yBot)];
  }
  const pl = map(0, 0), plax = pl[0] - (aw - 6);       // 하중 화살표(좌측 자유단 → 우향)
  const col = gov ? BLOCKS : PLATE;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', maxWidth: W, height: 'auto', background: '#fff', borderRadius: 5 }}>
        <title>{path.label}</title>
        {/* 판 */}
        {(() => { const a = map(0, yTop), b = map(uEnd, yBot); return <rect x={a[0]} y={a[1]} width={b[0] - a[0]} height={b[1] - a[1]} fill="none" stroke={col} strokeWidth={gov ? 1.6 : 1} />; })()}
        {/* 이음 CL(우측단 점선) */}
        {(() => { const a = map(uEnd, yTop), b = map(uEnd, yBot); return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={HOLE} strokeWidth={0.8} strokeDasharray="7 3 2 3" />; })()}
        {/* 하중 화살표 Pf */}
        <line x1={plax} y1={pl[1]} x2={pl[0]} y2={pl[1]} stroke={LOAD} strokeWidth={4} strokeLinecap="round" />
        <path d={`M${plax},${pl[1]} l14,-7 v14 z`} fill={LOAD} />
        <text x={plax} y={pl[1] - 9} fontSize={12} fontWeight={800} fill={LOAD} textAnchor="middle">Pf</text>
        {/* 볼트(공제 구멍 강조) */}
        {lines.map((l, li) => Array.from({ length: l.rows }, (_, k) => {
          const [bx, by] = map(edge + l.off + k * pitch, l.y);
          const isCut = cut(l) && k === l.rows - 1;    // 파단선이 지나는 행
          return <circle key={`${li}-${k}`} cx={bx} cy={by} r={br} fill={isCut ? 'rgba(44,111,187,.12)' : 'none'} stroke={isCut ? TENSION : HOLE} strokeWidth={isCut ? 1.3 : 0.85} />;
        }))}
        {/* 파단선(파랑 계단/직선) */}
        <polyline points={poly.map(p => p.join(',')).join(' ')} fill="none" stroke={TENSION} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <text x={4} y={12} fontSize={11} fontWeight={700} fill={gov ? BLOCKS : INK}>{phaseOff == null ? '지그재그' : '직선'}</text>
      </svg>
      <div style={{ fontSize: 10.5, color: gov ? BLOCKS : 'var(--sub,#6b7280)', fontWeight: gov ? 700 : 500, marginTop: -1 }}>
        {path.nHoles}공 공제{path.gain > 0.05 ? ` +Σs²/4g=${path.gain.toFixed(1)}` : ''} · An={Math.round(path.area)}{geom.plates === 2 ? '×2' : ''}mm²{gov ? ' ◀' : ''}
      </div>
    </div>
  );
}

function NetSectionFig({ paths, geom, lang }: { paths: NetPath[]; geom: NetSectionGeom; lang: Lang }) {
  const govKey = paths.reduce((a, b) => (b.area < a.area ? b : a)).key;
  return (
    <div className="cf-ns" style={{ margin: '4px 0 8px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        {paths.map((p, i) => <NetPanel key={i} path={p} geom={geom} govKey={govKey} />)}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--sub,#6b7280)', marginTop: 3 }}>
        {lang === 'ko'
          ? `엇모 순단면 인장파단(AISC B4.3b) 후보경로 전수검토 · 게이지선 ${geom.lines.length}열, 피치 ${geom.pitch}, 연단 ${geom.edge}, 폭 ${Math.round(geom.width)}mm${geom.plates === 2 ? ' (내부판 ×2)' : ''}. 파랑=파단선(계단=엇모 +s²/4g). 최소 순단면(An)이 지배 ◀.`
          : `Staggered net-section rupture (AISC B4.3b): all candidate paths. blue=fracture line; min net area governs ◀.`}
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
  if (c.cases && c.cases.length && c.bsGeom && c.cases.some(x => x.viz)) return <BlockShearFig cases={c.cases} geom={c.bsGeom} lang={lang} />;
  if (c.nsPaths && c.nsPaths.length && c.nsGeom) return <NetSectionFig paths={c.nsPaths} geom={c.nsGeom} lang={lang} />;
  const g = <Glyph clause={c.clause} />;
  if (!g) return null;
  return <div className="cf-glyph" style={{ float: 'right', marginLeft: 8 }}>{g}</div>;
}
