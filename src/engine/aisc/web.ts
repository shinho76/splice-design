// ────────────────────────────────────────────────────────────────────────────
// 웨브 이음 검토 (AISC 360-16, SI) — 앱 KBC 경로엔 없던 신규 검토군
//   WB 볼트 · WR 지압 · WP 첨판 블록전단 · WI 항복/파단 상호작용 · WM 부재웨브
//   전제: 양면 첨판(이중전단 Ns=2). 볼트는 동심(C=n, 편심은 첨판이 휨으로 흡수).
//   기하: web.bolt.m=춤(수직)열, web.bolt.n=축방향열, Pc=수직피치, pitch=축피치.
//   소요: Vu(수직전단), Mux=Vu·e(첨판 편심휨).
// ────────────────────────────────────────────────────────────────────────────
import type { DesignResult, DesignCondition, BoltName } from '../types.ts';
import { parseName } from '../sections.ts';
import { Fy as FySteel, Fu as FuSteel, BOLT_MAT } from '../materials.ts';
import { Ab, To_kN } from '../bolts.ts';
import { PHI, FNV_FACTOR, SLIP, holeDia, kN, kNm } from './constants.ts';
import { bearing, blockShearGovern } from './geometry.ts';
import { bsDetail } from './flange.ts';
import type { AiscCheck, AiscStep, DemandSet } from './types.ts';

const S = (label: string, formula?: string, subst?: string, value?: number, unit?: string, ref?: string): AiscStep =>
  ({ label, formula, subst, value, unit, ref });

function finalize(c: AiscCheck): AiscCheck {
  if (c.phiRn != null && c.demand != null && c.phiRn > 0) {
    c.dcr = +(c.demand / c.phiRn).toFixed(2);
    c.ok = c.dcr <= 1.0;
  }
  return c;
}

export function webChecks(r: DesignResult, cond: DesignCondition, dem: DemandSet): AiscCheck[] {
  const wp = r.web.webPlate;
  const checks: AiscCheck[] = [];
  if (!wp || !r.web.bolt) return checks;              // 웨브 이음 없음(초소형 단면)

  const { H, tw } = parseName(r.section);
  const d = r.boltDia, ab = Ab[('M' + d) as BoltName], dh = holeDia(d);
  const Fub = BOLT_MAT[cond.bolt].Fu;
  const thread = cond.threadCond ?? 'N';
  const Fnv = FNV_FACTOR[thread] * Fub;
  const Ns = 2;                                        // 양면 첨판 이중전단

  const pSteel = cond.plateSteel ?? cond.steel;
  const pFy = FySteel(pSteel, 20), pFu = FuSteel(pSteel);
  const mFy = FySteel(cond.steel, tw), mFu = FuSteel(cond.steel);

  const Vu = dem.Vu, Mux = dem.MuxWeb, e = dem.e;
  const nVert = Math.max(1, r.web.bolt.m);            // 춤방향 볼트수(수직)
  const nHoriz = Math.max(1, r.web.bolt.n);           // 축방향 열수
  const nb = nVert * nHoriz;
  const Pc = r.web.Pc ?? 60;                           // 수직 피치
  const webP = r.web.pitch ?? 60;                      // 축 피치
  const edge = r.web.edge ?? 40;
  const tp = wp.t, dp = wp.w;                          // 첨판 두께·춤
  const LvVert = edge + (nVert - 1) * Pc;             // 수직 전단선 길이
  const colsAxis = Array.from({ length: nHoriz }, (_, i) => (i - (nHoriz - 1) / 2) * webP); // 축방향 열 x

  const g = `E. 웨브 첨판 PL-${tp}×${dp}×2`;

  // ── WB. 볼트 (동심, 이중전단) ──
  {
    const phiRn = PHI.V * Fnv * ab * Ns * nb;
    checks.push(finalize({ id: 'WB1', region: 'web', group: 'A. 볼트(웨브)', label: '볼트 전단(이중전단)', clause: 'J3.6',
      detail: `φFnvAb·ns·n = 0.75·${Fnv.toFixed(0)}·${ab}·2·${nb} (${thread}, 동심 C=n)`, phiRn: kN(phiRn), demand: kN(Vu), unit: 'kN',
      steps: [
        S('Nominal shear stress Fnv', thread === 'X' ? '0.563·Fu(bolt)' : '0.450·Fu(bolt)', `${FNV_FACTOR[thread]}·${Fub}`, +Fnv.toFixed(0), 'MPa', 'J3.6'),
        S('Bolt group', 'concentric (plate carries eccentric moment)', `ns=2, n=${nVert}×${nHoriz}=${nb}`),
        S('Design shear φRn', 'φ·Fnv·Ab·ns·n', `0.75·${Fnv.toFixed(0)}·${ab}·2·${nb}`, kN(phiRn), 'kN'),
      ] }));
    if (cond.jointType === '마찰') {
      const Tb = To_kN[cond.bolt][('M' + d) as BoltName] ?? 0;
      const slip = PHI.SL * SLIP.MU * SLIP.DU * SLIP.HF * Tb * Ns * nb;
      checks.push(finalize({ id: 'WB2', region: 'web', group: 'A. 볼트(웨브)', label: '볼트 미끄럼(Class B)', clause: 'J3.8',
        detail: `φμDu·Tb·ns·n = 1.0·0.5·1.13·${Tb}·2·${nb}`, phiRn: +slip.toFixed(1), demand: kN(Vu), unit: 'kN' }));
    } else {
      checks.push({ id: 'WB2', region: 'web', group: 'A. 볼트(웨브)', label: '볼트 미끄럼', clause: 'J3.8', detail: '지압접합 → 해당 없음', note: '지압' });
    }
  }

  // ── WR. 지압·찢김 (부재웨브 tw 단면 vs 첨판 2·tp, 최소지배) ──
  {
    const brWeb = bearing(tw, mFu, d, nHoriz, nVert, edge, Pc);     // 부재웨브(1매)
    const brPl = bearing(2 * tp, pFu, d, nHoriz, nVert, edge, Pc);  // 첨판(2매 합산 두께)
    const govWeb = brWeb.total <= brPl.total;
    checks.push(finalize({ id: 'WR1', region: 'web', group: g, label: '지압·찢김(웨브/첨판)', clause: 'J3.10',
      detail: `min(웨브 ${kN(brWeb.total)}, 첨판×2 ${kN(brPl.total)}) → ${govWeb ? '웨브' : '첨판'}`,
      phiRn: kN(Math.min(brWeb.total, brPl.total)), demand: kN(Vu), unit: 'kN',
      steps: [
        S('Member web (t = tw)', 'Σ φ·min(2.4dtFu, 1.2Lc·t·Fu)', `tw=${tw}, n=${nb}`, kN(brWeb.total), 'kN', 'J3.10'),
        S('Splice plates (t = 2·tp)', 'Σ φ·min(2.4dtFu, 1.2Lc·t·Fu)', `2tp=${2 * tp}, n=${nb}`, kN(brPl.total), 'kN'),
        S('Governing (min)', 'min(web, plates)', govWeb ? 'member web' : 'plates', kN(Math.min(brWeb.total, brPl.total)), 'kN'),
      ] }));
  }

  // ── WP. 첨판 블록전단(×2, 수직 전단·수평 인장) Case A/B/C ──
  {
    const bs = blockShearGovern({ t: tp, Fy: pFy, Fu: pFu, d, nrow: nVert, Lv: LvVert, halfWidth: (wp.L ?? dp) / 2, cols: colsAxis }, Vu, 2);
    checks.push(finalize({ id: 'WP1', region: 'web', group: g, label: '블록 전단(×2)', clause: 'J4.3',
      detail: bsDetail(bs), phiRn: kN(bs.phiRn), demand: kN(bs.demand), unit: 'kN', cases: bs.cases }));
  }

  // ── WI. 첨판 항복/파단 상호작용 (2매 합성단면, Mux+Vu) ──
  {
    const Zpl = 2 * (tp * dp * dp / 4);        // 소성단면계수(2매)
    const Ipl = 2 * (tp * dp ** 3 / 12);
    const Awpl = 2 * dp * tp;                  // 전단면적(2매)
    // 순단면: 수직선상 nVert개 구멍 공제(파단)
    const yPos = Array.from({ length: nVert }, (_, i) => (i - (nVert - 1) / 2) * Pc);
    const Ihole = yPos.reduce((s, y) => s + nHoriz * (dh * tp) * y * y, 0) * 2; // 2매
    const Inet = Math.max(0.4 * Ipl, Ipl - Ihole);          // 순단면 관성 하한 0.4Ig(붕괴 방지)
    const Snet = Inet / (dp / 2);
    const Anv = 2 * Math.max(0.25 * dp, dp - nVert * dh) * tp; // 순전단폭 하한 0.25dp

    // 항복 상호작용 (φ=0.9 휨, φv=1.0 전단항복)
    const phiMnY = PHI.F * pFy * Zpl, phiVnY = PHI.SH * 0.6 * pFy * Awpl;
    const yLHS = (Mux / phiMnY) ** 2 + (Vu / phiVnY) ** 2;
    checks.push(finalize({ id: 'WI1', region: 'web', group: g, label: '항복 상호작용', clause: 'J4.4/G2',
      detail: `√[(Mux/φMn)²+(Vu/φVn)²] = √[(${kNm(Mux)}/${kNm(phiMnY)})²+(${kN(Vu)}/${kN(phiVnY)})²]`,
      phiRn: 1.0, demand: +Math.sqrt(yLHS).toFixed(2), unit: 'ratio', note: `e=${e.toFixed(0)}mm`,
      steps: [
        S('Eccentricity e', 'gap/2 + edge + (n−1)·pitch/2', `bolt group centroid → splice CL`, +e.toFixed(0), 'mm'),
        S('Eccentric moment Mux', 'Vu·e', `${kN(Vu)}·${e.toFixed(0)}`, kNm(Mux), 'kN·m'),
        S('Plastic modulus Zpl (2 plates)', '2·(t·dp²/4)', `2·${tp}·${dp}²/4`, +Zpl.toFixed(0), 'mm³'),
        S('Gross shear area Aw (2 plates)', '2·dp·t', `2·${dp}·${tp}`, +Awpl.toFixed(0), 'mm²'),
        S('Design flexural φMn', 'φ·Fy·Zpl', `0.90·${pFy}·${Zpl.toFixed(0)}`, kNm(phiMnY), 'kN·m'),
        S('Design shear φVn', 'φv·0.6·Fy·Aw', `1.0·0.6·${pFy}·${Awpl.toFixed(0)}`, kN(phiVnY), 'kN', 'G2.1'),
        S('Interaction', '√[(Mux/φMn)² + (Vu/φVn)²] ≤ 1', `√[(${kNm(Mux)}/${kNm(phiMnY)})²+(${kN(Vu)}/${kN(phiVnY)})²]`, +Math.sqrt(yLHS).toFixed(2), 'ratio', 'J4.4'),
      ] }));
    // 파단 상호작용 (φ=0.75)
    const phiMnR = PHI.V * pFu * Snet, phiVnR = PHI.V * 0.6 * pFu * Anv;
    const rLHS = (Mux / phiMnR) ** 2 + (Vu / phiVnR) ** 2;
    checks.push(finalize({ id: 'WI2', region: 'web', group: g, label: '파단 상호작용', clause: 'J4.2/J4.3',
      detail: `√[(Mux/φMnₙₑₜ)²+(Vu/φVnₙₑₜ)²] = √[(${kNm(Mux)}/${kNm(phiMnR)})²+(${kN(Vu)}/${kN(phiVnR)})²]`,
      phiRn: 1.0, demand: +Math.sqrt(rLHS).toFixed(2), unit: 'ratio',
      steps: [
        S('Net shear width', 'dp − nVert·dₕ (floor 0.25dp)', `${dp} − ${nVert}·${dh}`, +Math.max(0.25 * dp, dp - nVert * dh).toFixed(0), 'mm'),
        S('Net shear area Anv (2 plates)', '2·(net width)·t', `2·${Math.max(0.25 * dp, dp - nVert * dh).toFixed(0)}·${tp}`, +Anv.toFixed(0), 'mm²', 'B4.3b'),
        S('Net elastic modulus Snet', 'Inet/(dp/2), Inet=Ig−Iholes', `holes at ±y deducted`, +Snet.toFixed(0), 'mm³'),
        S('Design flexural rupture φMn', 'φ·Fu·Snet', `0.75·${pFu}·${Snet.toFixed(0)}`, kNm(phiMnR), 'kN·m', 'J4.2'),
        S('Design shear rupture φVn', 'φ·0.6·Fu·Anv', `0.75·0.6·${pFu}·${Anv.toFixed(0)}`, kN(phiVnR), 'kN', 'J4.2'),
        S('Interaction', '√[(Mux/φMn)² + (Vu/φVn)²] ≤ 1', `√[(${kNm(Mux)}/${kNm(phiMnR)})²+(${kN(Vu)}/${kN(phiVnR)})²]`, +Math.sqrt(rLHS).toFixed(2), 'ratio'),
      ] }));
  }

  // ── WM. 부재 웨브 ──
  {
    const gm = 'F. 부재 웨브';
    const Aw = H * tw;
    checks.push(finalize({ id: 'WM1', region: 'member', group: gm, label: '웨브 전단항복', clause: 'G2.1',
      detail: `φv·0.6·Fy·Aw = 1.0·0.6·${mFy}·${Aw.toFixed(0)}`, phiRn: kN(PHI.SH * 0.6 * mFy * Aw), demand: kN(Vu), unit: 'kN',
      steps: [
        S('Gross web area Aw', 'H·tw', `${H}·${tw}`, +Aw.toFixed(0), 'mm²'),
        S('Design shear yield φVn', 'φv·0.6·Fy·Aw', `1.0·0.6·${mFy}·${Aw.toFixed(0)}`, kN(PHI.SH * 0.6 * mFy * Aw), 'kN', 'G2.1'),
      ] }));
    const bs = blockShearGovern({ t: tw, Fy: mFy, Fu: mFu, d, nrow: nVert, Lv: LvVert, halfWidth: dp / 2, cols: colsAxis }, Vu, 1);
    checks.push(finalize({ id: 'WM2', region: 'member', group: gm, label: '웨브 블록 전단', clause: 'J4.3',
      detail: bsDetail(bs), phiRn: kN(bs.phiRn), demand: kN(bs.demand), unit: 'kN', cases: bs.cases }));
  }

  return checks;
}

/** 첨판 휨 Fy (판두께 항복강도) — 가독성용 래퍼 */
function mFyPlate(pFy: number): number { return pFy; }
