// ────────────────────────────────────────────────────────────────────────────
// AISC 자동 최소화 (사전식 유도 그리디) — 강재 중량 최소 방향으로 DCR≤1 달성
//   목적: ① 볼트수·판 최소  ② 지배 실패항목만 최소증분(불필요한 과설계 회피)
//   레버: 첨판두께 · 플랜지 볼트행 · 웨브 볼트 · 웨브첨판 두께·춤 · 볼트직경 · 부재한계 소요캡핑
//   부재(F13.1·D2·전단항복 등)는 접합 보강 불가 → 소요를 부재강도로 캡핑(부분강도접합).
//   탐색이력(history)에 매 반복 지배·DCR·조정을 기록(참고 엔진 optimize 이식).
// ────────────────────────────────────────────────────────────────────────────
import type { DesignResult, DesignCondition } from '../types.ts';
import { aiscRun } from './run.ts';
import type { AiscResult } from './types.ts';

// 실무 표준 시리즈(KS D 3503/3515 상용 압연 강판 두께 mm · KS B 1010 볼트호칭)
const FT = [9, 10, 12, 14, 16, 19, 22, 25, 28, 32, 36, 40, 45, 50, 55, 60];   // 플랜지 첨판 두께
const WT = [6, 8, 9, 10, 12, 14, 16, 19, 22, 25, 28, 32, 36, 40, 45, 50];     // 웨브 첨판 두께
const DIA = [16, 20, 22, 24, 27, 30];
const nextUp = (v: number, s: number[]) => s.find(x => x > v + 1e-6) ?? v;

/** 최적화 한계(제작성 상한). 진단 시 크게 열어 부재지배(부분강도) 잔여만 남기는 용도. */
export interface OptLimits { maxRows?: number; maxWebCols?: number; }

export interface OptStep { it: number; gov: string; dcr: number; action: string; wt: number; }
export interface AiscOptResult {
  result: DesignResult;
  report: AiscResult;
  history: OptStep[];
  changes: string[];
  ok: boolean;
  flangeScale: number; webScale: number;   // <1 이면 부분강도(소요캡핑)
  memberLimited: boolean;
  wt0: number; wt1: number;                 // 강재중량(플랜지+웨브 첨판, kg/부재)
}

/** 첨판 강재중량(kg/부재) — 플랜지 외·내(×2) + 웨브(×2) */
function plateWeight(r: DesignResult): number {
  const o = r.flange.outerPlate, i = r.flange.innerPlate, w = r.web.webPlate;
  const vol = (o ? o.t * o.w * o.L : 0)
    + (i ? 2 * i.t * i.w * i.L : 0)
    + (w ? 2 * w.t * w.w * w.L : 0);
  return vol * 7.85e-6;
}

function clone(r: DesignResult): DesignResult {
  return {
    ...r,
    flange: {
      ...r.flange, bolt: { ...r.flange.bolt }, gauge: r.flange.gauge ? { ...r.flange.gauge } : undefined,
      outerPlate: r.flange.outerPlate ? { ...r.flange.outerPlate } : undefined,
      innerPlate: r.flange.innerPlate ? { ...r.flange.innerPlate } : undefined,
    },
    web: { ...r.web, bolt: { ...r.web.bolt }, webPlate: r.web.webPlate ? { ...r.web.webPlate } : undefined },
  };
}

export function aiscOptimize(r0: DesignResult, cond: DesignCondition, limits: OptLimits = {}): AiscOptResult {
  const maxRows = limits.maxRows ?? 12;      // 플랜지 볼트행 상한(구 8 → 제작성 고려 12)
  const maxWebCols = limits.maxWebCols ?? 4;  // 웨브 볼트열(축방향) 상한
  const r = clone(r0);
  const wt0 = plateWeight(r0);
  const changes: string[] = [];
  const history: OptStep[] = [];
  let fScale = 1, wScale = 1, memberLimited = false;

  // 지오메트리 상수(재산정용)
  const fPitch = r.flange.pitch ?? 60, fEdge = r.flange.edge ?? 40, gap = r.flange.gap ?? 10;
  const Pc = r.web.Pc ?? 60, webP = r.web.pitch ?? 60, wEdge = r.web.edge ?? 40;
  const { H } = parse(r.section);
  const flangeLen = (n: number) => 2 * ((Math.round(n) - 1) * fPitch + 2 * fEdge) + gap;
  const webWidth = (nh: number) => 2 * ((nh - 1) * webP + 2 * wEdge) + gap;
  const webDepth = (mv: number) => (mv - 1) * Pc + 80;
  const maxWebVert = Math.max(2, Math.floor((H - 2 * 60) / Pc) + 1);   // 웨브볼트 수직 상한(춤 여유)

  const capBy = (res: AiscResult, ids: string[]): number => {
    const fs = res.checks.filter(c => ids.includes(c.id) && c.ok === false && c.phiRn && c.demand);
    if (!fs.length) return 1;
    return Math.min(...fs.map(c => c.phiRn! / c.demand!)) * 0.99;
  };

  for (let it = 0; it < 80; it++) {
    const res = aiscRun(r, cond, { flangeScale: fScale, webScale: wScale });
    if (res.ok) {
      history.push({ it, gov: res.govId, dcr: res.govDcr, action: '완료', wt: +plateWeight(r).toFixed(1) });
      return done(true);
    }
    const fail = res.checks.filter(c => c.ok === false).sort((a, b) => (b.dcr ?? 0) - (a.dcr ?? 0))[0];
    if (!fail) break;
    const id = fail.id;
    let action = '';
    const n = Math.round(r.flange.bolt.n);
    const addRow = () => {
      if (n >= maxRows) return false;
      r.flange.bolt = { m: r.flange.bolt.m, n: n + 1, count: r.flange.bolt.m * (n + 1) };
      if (r.flange.outerPlate) r.flange.outerPlate.L = flangeLen(n + 1);
      if (r.flange.innerPlate) r.flange.innerPlate.L = flangeLen(n + 1);
      action = `플랜지 볼트행 ${n}→${n + 1}`; return true;
    };
    const bumpOuter = () => {
      if (!r.flange.outerPlate) return false;
      const t = r.flange.outerPlate.t, nt = nextUp(t, FT); if (nt === t) return false;
      r.flange.outerPlate.t = nt; action = `외첨판 두께 ${t}→${nt}`; return true;
    };
    const bumpInner = () => {
      if (!r.flange.innerPlate) return false;
      const t = r.flange.innerPlate.t, nt = nextUp(t, FT); if (nt === t) return false;
      r.flange.innerPlate.t = nt; action = `내첨판 두께 ${t}→${nt}`; return true;
    };
    const bumpDia = () => {
      const nd = nextUp(r.boltDia, DIA); if (nd === r.boltDia) return false;
      r.boltDia = nd as DesignResult['boltDia']; action = `볼트직경 →M${nd}`; return true;
    };
    const addWebVert = () => {
      const mv = r.web.bolt.m; if (mv >= maxWebVert) return false;
      r.web.bolt = { m: mv + 1, n: r.web.bolt.n, count: (mv + 1) * r.web.bolt.n };
      if (r.web.webPlate) r.web.webPlate.w = webDepth(mv + 1);
      action = `웨브 볼트(춤) ${mv}→${mv + 1}`; return true;
    };
    const addWebHoriz = () => {
      const nh = r.web.bolt.n; if (nh >= maxWebCols) return false;
      r.web.bolt = { m: r.web.bolt.m, n: nh + 1, count: r.web.bolt.m * (nh + 1) };
      if (r.web.webPlate) r.web.webPlate.L = webWidth(nh + 1);
      action = `웨브 볼트(축) ${nh}→${nh + 1}`; return true;
    };
    const bumpWebT = () => {
      if (!r.web.webPlate) return false;
      const t = r.web.webPlate.t, nt = nextUp(t, WT); if (nt === t) return false;
      r.web.webPlate.t = nt; action = `웨브첨판 두께 ${t}→${nt}`; return true;
    };
    const capFlange = () => {
      const s = capBy(res, ['FM2', 'FM3', 'FM4', 'FM1', 'FM5']);
      if (s >= 0.999) return false;
      fScale = fScale * s; memberLimited = true; action = `플랜지 소요캡핑 ×${fScale.toFixed(2)}(부분강도)`; return true;
    };
    // 폴백: 부재(FM) 외의 플랜지 검토(FP/FI 판요소)까지 못 풀면 그 최소비로 캡핑(부분강도).
    const capFlangeAll = () => {
      const fs = res.checks.filter(c => c.id.startsWith('F') && c.ok === false && c.dcr);
      if (!fs.length) return false;
      const s = 0.99 / Math.max(...fs.map(c => c.dcr!));
      if (s >= 0.999) return false;
      fScale = fScale * s; memberLimited = true; action = `플랜지 소요캡핑(판한계) ×${fScale.toFixed(2)}(부분강도)`; return true;
    };
    const capWeb = () => {
      // 실패한 모든 웨브 검토(힘·비 모두 Vu에 선형)를 통과시키는 스케일
      const fs = res.checks.filter(c => c.id.startsWith('W') && c.ok === false && c.dcr);
      if (!fs.length) return false;
      const s = (0.99 / Math.max(...fs.map(c => c.dcr!)));
      if (s >= 0.999) return false;
      wScale = wScale * s; memberLimited = true; action = `웨브 소요캡핑 ×${wScale.toFixed(2)}(부분강도)`; return true;
    };

    let done2 = false;
    const tryLevers = (...fns: (() => boolean)[]) => { for (const f of fns) if (f()) { done2 = true; return; } };

    switch (id) {
      case 'FP1': case 'FP2': case 'FP3': case 'FP4': tryLevers(bumpOuter, addRow); break;
      case 'FP5': tryLevers(addRow, bumpOuter); break;
      case 'FI1': case 'FI2': case 'FI3': case 'FI4': tryLevers(bumpInner, bumpOuter, addRow); break;
      case 'FI5': tryLevers(addRow, bumpInner, bumpOuter); break;
      case 'FB1': case 'FB2': tryLevers(addRow, bumpDia); break;
      case 'FM1': tryLevers(addRow, capFlange); break;
      case 'FM5': tryLevers(addRow, capFlange); break;
      case 'FM2': case 'FM3': case 'FM4': tryLevers(capFlange); break;
      case 'WB1': case 'WB2': tryLevers(addWebVert, addWebHoriz, bumpWebT, capWeb); break;
      case 'WR1': tryLevers(addWebVert, addWebHoriz, bumpWebT, capWeb); break;
      case 'WP1': tryLevers(addWebVert, bumpWebT, capWeb); break;
      case 'WI1': case 'WI2': tryLevers(bumpWebT, addWebVert, capWeb); break;
      case 'WM1': tryLevers(capWeb); break;
      case 'WM2': tryLevers(addWebVert, capWeb); break;
      default: tryLevers(bumpOuter, addRow, bumpWebT);
    }
    if (!done2) {
      // 지정 레버 소진 → 폭넓은 폴백(플랜지 부재→판한계·웨브 캡핑) 시도
      tryLevers(capFlange, capFlangeAll, capWeb);
      if (!done2) { history.push({ it, gov: id, dcr: fail.dcr ?? 0, action: '보정불가(한계)', wt: +plateWeight(r).toFixed(1) }); break; }
    }
    changes.push(`[${id} DCR${(fail.dcr ?? 0).toFixed(2)}] ${action}`);
    history.push({ it, gov: id, dcr: fail.dcr ?? 0, action, wt: +plateWeight(r).toFixed(1) });
  }

  // 반복 상한 도달/레버 소진: 잔여 지배비로 강제 캡핑(부분강도) → done()이 트림·리포트 처리(하드실패 방지)
  const guard = aiscRun(r, cond, { flangeScale: fScale, webScale: wScale });
  if (!guard.ok) {
    const ff = guard.checks.filter(c => c.id.startsWith('F') && c.ok === false && c.dcr);
    const wf = guard.checks.filter(c => c.id.startsWith('W') && c.ok === false && c.dcr);
    if (ff.length) { fScale *= 0.99 / Math.max(...ff.map(c => c.dcr!)); memberLimited = true; }
    if (wf.length) { wScale *= 0.99 / Math.max(...wf.map(c => c.dcr!)); memberLimited = true; }
  }
  return done(true);

  function done(_ok: boolean): AiscOptResult {
    trimDown();   // 성공/캡핑 확정 후 국소최소로 하강(철판 최소)
    const report = aiscRun(r, cond, { flangeScale: fScale, webScale: wScale });
    return { result: r, report, history, changes, ok: report.ok, flangeScale: fScale, webScale: wScale, memberLimited, wt0, wt1: plateWeight(r) };
  }
  // 트림(하강) 패스: DCR≤1 유지하며 판두께·볼트행·웨브볼트를 한 단계씩 낮춰 국소최소(철판 최소)로 하강.
  //   그리디는 증분만 하므로 뒤늦게 불필요해진 두께·행이 남는다(과설계) → 되돌려 최소화.
  function trimDown() {
    const passOK = () => aiscRun(r, cond, { flangeScale: fScale, webScale: wScale }).ok;
    if (!passOK()) return;
    for (let g2 = 0; g2 < 40; g2++) {
      let trimmed = false;
      for (const [pl, series] of [[r.flange.outerPlate, FT], [r.flange.innerPlate, FT], [r.web.webPlate, WT]] as const) {
        if (!pl) continue;
        const t0 = pl.t, i = series.indexOf(t0);
        if (i > 0) { pl.t = series[i - 1]; if (passOK()) trimmed = true; else pl.t = t0; }
      }
      const n0 = Math.round(r.flange.bolt.n);
      if (n0 > 2) {
        const oL0 = r.flange.outerPlate?.L, iL0 = r.flange.innerPlate?.L;
        r.flange.bolt = { m: r.flange.bolt.m, n: n0 - 1, count: r.flange.bolt.m * (n0 - 1) };
        if (r.flange.outerPlate) r.flange.outerPlate.L = flangeLen(n0 - 1);
        if (r.flange.innerPlate) r.flange.innerPlate.L = flangeLen(n0 - 1);
        if (passOK()) trimmed = true;
        else { r.flange.bolt = { m: r.flange.bolt.m, n: n0, count: r.flange.bolt.m * n0 };
          if (r.flange.outerPlate && oL0 != null) r.flange.outerPlate.L = oL0;
          if (r.flange.innerPlate && iL0 != null) r.flange.innerPlate.L = iL0; }
      }
      const mv0 = r.web.bolt.m;
      if (mv0 > 1) {
        const wd0 = r.web.webPlate?.w;
        r.web.bolt = { m: mv0 - 1, n: r.web.bolt.n, count: (mv0 - 1) * r.web.bolt.n };
        if (r.web.webPlate) r.web.webPlate.w = webDepth(mv0 - 1);
        if (passOK()) trimmed = true;
        else { r.web.bolt = { m: mv0, n: r.web.bolt.n, count: mv0 * r.web.bolt.n };
          if (r.web.webPlate && wd0 != null) r.web.webPlate.w = wd0; }
      }
      if (!trimmed) break;
    }
  }
}

/** "H-400x200x8x13" → 치수 (parse 로컬 최소판) */
function parse(name: string) {
  const [H, B, tw, tf] = name.replace(/^H-/, '').split('x').map(Number);
  return { H, B, tw, tf };
}
