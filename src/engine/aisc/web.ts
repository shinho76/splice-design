// ────────────────────────────────────────────────────────────────────────────
// 웨브 이음 검토 (AISC 360-16, SI) — 앱 KBC 경로엔 없던 신규 검토군
//   WB 볼트 · WR 지압 · WP 이음판 블록전단 · WI 항복/파단 상호작용 · WM 부재웨브
//   전제: 양면 이음판(이중전단 Ns=2). 볼트는 동심(C=n, 편심은 이음판이 휨으로 흡수).
//   기하: web.bolt.m=춤(수직)열, web.bolt.n=축방향열, Pc=수직피치, pitch=축피치.
//   소요: Vu(수직전단), Mux=Vu·e(이음판 편심휨).
// ────────────────────────────────────────────────────────────────────────────
import type { DesignResult, DesignCondition, BoltName } from '../types.ts';
import { parseName } from '../sections.ts';
import { Fy as FySteel, Fu as FuSteel, BOLT_MAT } from '../materials.ts';
import { Ab, To_kN } from '../bolts.ts';
import { PHI, FNV_FACTOR, SLIP, holeDia, kN, kNm } from './constants.ts';
import { bearing } from './geometry.ts';
import { bsCases } from './bsPatterns.ts';
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
  const Ns = 2;                                        // 양면 이음판 이중전단

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
  const tp = wp.t, dp = wp.w;                          // 이음판 두께·춤
  const colsAxis = Array.from({ length: nHoriz }, (_, i) => (i - (nHoriz - 1) / 2) * webP); // 축방향 열 x

  const g = `E. 웨브 이음판 PL-${tp}×${dp}×2`;

  // ── 웨브 블록전단 정책: 수평력 H=0(단순전단 이음, 축력 N=0·모멘트는 플랜지 전담)이므로
  //    H블록(구 WP2/WM3)은 검토 제외. 수직력 V에 대해서만 Web Splice Plate(WP1)·Girder Web(WM2) 2계통을 검토.
  //    ※ 웨브 축력 N≠0 또는 웨브가 모멘트를 분담하는 확장 시 H블록 부활 필요(steel-connection-engineer 판정 Q2).
  //    인장 자유단 = min(축방향 단부거리 wp.L/2, 춤방향 연단거리 dp/2) — 더 가까운 자유단으로 파단(판정 Q3).
  const vHalf = Math.min((wp.L ?? dp) / 2, dp / 2);

  // ── WB. 볼트 (동심, 이중전단) ──
  {
    const phiRn1 = PHI.V * Fnv * ab * Ns;         // 볼트 1개 설계전단강도(이중전단)
    const phiRn = phiRn1 * nb;                     // 총 = 1개 강도 × 본수
    checks.push(finalize({ id: 'WB1', region: 'web', group: 'A. 볼트(웨브)', label: '볼트 전단(이중전단)', clause: 'J3.6',
      detail: `φrₙ = 0.75·${Fnv.toFixed(0)}·${ab}·2 = ${kN(phiRn1)} kN/EA ×${nb} = ${kN(phiRn)} kN (${thread}, 동심 C=n)`, phiRn: kN(phiRn), demand: kN(Vu), unit: 'kN',
      steps: [
        S('Nominal shear stress Fnv', thread === 'X' ? '0.563·Fu(bolt)' : '0.450·Fu(bolt)', `${FNV_FACTOR[thread]}·${Fub}`, +Fnv.toFixed(0), 'MPa', 'J3.6'),
        S('Bolt group', 'concentric (plate carries eccentric moment)', `ns=2, n=${nVert}×${nHoriz}=${nb}`),
        S('Per-bolt design shear φrₙ', 'φ·Fnv·Ab·ns', `0.75·${Fnv.toFixed(0)}·${ab}·2`, kN(phiRn1), 'kN', 'J3.6'),
        S('Total φRn = φrₙ·n', 'φrₙ · n', `${kN(phiRn1)}·${nb}`, kN(phiRn), 'kN'),
      ] }));
    if (cond.jointType === '마찰') {
      const Tb = To_kN[cond.bolt][('M' + d) as BoltName] ?? 0;
      const slip1 = PHI.SL * SLIP.MU * SLIP.DU * SLIP.HF * Tb * Ns;   // 볼트 1개 설계미끄럼강도(이중면)
      const slip = slip1 * nb;                                         // 총 = 1개 강도 × 본수
      checks.push(finalize({ id: 'WB2', region: 'web', group: 'A. 볼트(웨브)', label: '볼트 미끄럼(Class B)', clause: 'J3.8',
        detail: `φrₙ = φ·μ·Du·hf·Tb·ns = 1.0·0.5·1.13·1.0·${Tb}·2 = ${slip1.toFixed(1)} kN/EA ×${nb} = ${slip.toFixed(1)} kN`, phiRn: +slip.toFixed(1), demand: kN(Vu), unit: 'kN',
        steps: [
          S('Slip coefficient μ (Class B)', 'blast-cleaned faying surface', `μ = 0.50`, SLIP.MU, '', 'J3.8'),
          S('Pretension factor Du', 'mean-to-specified pretension ratio', `Du = 1.13`, SLIP.DU, '', 'J3.8'),
          S('Filler factor hf', 'no fillers → 1.0', `hf = 1.0`, SLIP.HF, '', 'J3.8'),
          S('Min. bolt pretension Tb', 'KS design bolt tension', `M${d} ${cond.bolt}`, Tb, 'kN', 'J3.8'),
          S('Shear planes ns', 'two side plates → double slip surface', `ns = 2`, Ns),
          S('Per-bolt design slip φrₙ', 'φ·μ·Du·hf·Tb·ns (φ=1.0)', `1.0·${SLIP.MU}·${SLIP.DU}·${SLIP.HF}·${Tb}·${Ns}`, +slip1.toFixed(1), 'kN', 'J3.8'),
          S('Total φRn = φrₙ·n', 'φrₙ · n', `${slip1.toFixed(1)}·${nb}`, +slip.toFixed(1), 'kN'),
        ] }));
    } else {
      checks.push({ id: 'WB2', region: 'web', group: 'A. 볼트(웨브)', label: '볼트 미끄럼', clause: 'J3.8', detail: '지압접합 → 해당 없음', note: '지압' });
    }
  }

  // ── WR. 지압·찢김 (부재웨브 tw 단면 vs 이음판 2·tp, 최소지배) ──
  {
    const brWeb = bearing(tw, mFu, d, nHoriz, nVert, edge, Pc);     // 부재웨브(1매)
    const brPl = bearing(2 * tp, pFu, d, nHoriz, nVert, edge, Pc);  // 이음판(2매 합산 두께)
    const govWeb = brWeb.total <= brPl.total;
    checks.push(finalize({ id: 'WR1', region: 'web', group: g, label: '지압·찢김(웨브/이음판)', clause: 'J3.10',
      detail: `min(웨브 ${kN(brWeb.total)}, 이음판×2 ${kN(brPl.total)}) → ${govWeb ? '웨브' : '이음판'}`,
      phiRn: kN(Math.min(brWeb.total, brPl.total)), demand: kN(Vu), unit: 'kN',
      steps: [
        S('Member web (t = tw)', 'Σ φ·min(2.4dtFu, 1.2Lc·t·Fu)', `tw=${tw}, n=${nb}`, kN(brWeb.total), 'kN', 'J3.10'),
        S('Splice plates (t = 2·tp)', 'Σ φ·min(2.4dtFu, 1.2Lc·t·Fu)', `2tp=${2 * tp}, n=${nb}`, kN(brPl.total), 'kN'),
        S('Governing (min)', 'min(web, plates)', govWeb ? 'member web' : 'plates', kN(Math.min(brWeb.total, brPl.total)), 'kN'),
      ] }));
  }

  // ── WP1. Web Splice Plate 블록전단(×2, 수직전단 V) — Path 1 ──
  {
    const bs = bsCases({ kind: 'web', lines: colsAxis, n: nVert, pitch: Pc, edge, ym: vHalf, t: tp, dh, Fy: pFy, Fu: pFu, plates: 2 }, Vu);
    checks.push(finalize({ id: 'WP1', region: 'web', group: g, label: '블록 전단(×2)', clause: 'J4.3',
      detail: bsDetail(bs), phiRn: kN(bs.gov.phiRn), demand: kN(Vu), unit: 'kN', cases: bs.cases,
      bsGeom: { cols: colsAxis, nrow: nVert, pitch: Pc, edge, halfWidth: vHalf, dh, plates: 2, vertical: true, loadDir: 'V' } }));
  }

  // ── WI. 이음판 항복/파단 상호작용 (2매 합성단면, Mux+Vu) ──
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
    checks.push(finalize({ id: 'WI1', region: 'web', group: g, label: '항복 상호작용', clause: 'J4.2(a)/F1',
      detail: `√[(Mux/φMn)²+(Vu/φVn)²] = √[(${kNm(Mux)}/${kNm(phiMnY)})²+(${kN(Vu)}/${kN(phiVnY)})²]`,
      phiRn: 1.0, demand: +Math.sqrt(yLHS).toFixed(2), unit: 'ratio', note: `e=${e.toFixed(0)}mm · 관용 상호작용식(AISC Manual Pt.9·12)`,
      steps: [
        S('Eccentricity e', 'gap/2 + edge + (n−1)·pitch/2', `bolt group centroid → splice CL`, +e.toFixed(0), 'mm'),
        S('Eccentric moment Mux', 'Vu·e', `${kN(Vu)}·${e.toFixed(0)}`, kNm(Mux), 'kN·m'),
        S('Plastic modulus Zpl (2 plates)', '2·(t·dp²/4)', `2·${tp}·${dp}²/4`, +Zpl.toFixed(0), 'mm³'),
        S('Gross shear area Aw (2 plates)', '2·dp·t', `2·${dp}·${tp}`, +Awpl.toFixed(0), 'mm²'),
        S('Design flexural φMn', 'φ·Fy·Zpl', `0.90·${pFy}·${Zpl.toFixed(0)}`, kNm(phiMnY), 'kN·m'),
        S('Design shear φVn (connecting element)', 'φv·0.6·Fy·Aw (φv=1.0)', `1.0·0.6·${pFy}·${Awpl.toFixed(0)}`, kN(phiVnY), 'kN', 'J4.2(a)'),
        S('Interaction (Manual convention, not a Spec eq.)', '√[(Mux/φMn)² + (Vu/φVn)²] ≤ 1', `√[(${kNm(Mux)}/${kNm(phiMnY)})²+(${kN(Vu)}/${kN(phiVnY)})²]`, +Math.sqrt(yLHS).toFixed(2), 'ratio', 'Manual Pt.9'),
      ] }));
    // 파단 상호작용 (φ=0.75)
    const phiMnR = PHI.V * pFu * Snet, phiVnR = PHI.V * 0.6 * pFu * Anv;
    const rLHS = (Mux / phiMnR) ** 2 + (Vu / phiVnR) ** 2;
    checks.push(finalize({ id: 'WI2', region: 'web', group: g, label: '파단 상호작용', clause: 'J4.2(b)',
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
  //   ※ 부재웨브 블록전단(구 WM2)은 검토하지 않는다: 부재웨브는 상·하 플랜지와 일체(연속)로
  //     블록이 분리될 자유단(연단)이 없어 블록전단 파단면이 형성되지 않는다. 웨브 이음판(WP1)만
  //     자유단을 가지므로 블록전단 대상이다. (수직전단 항복 WM1만 유지)
  {
    const gm = 'F. 부재 웨브';
    const Aw = H * tw;
    checks.push(finalize({ id: 'WM1', region: 'member', group: gm, label: '웨브 전단항복', clause: 'G2.1',
      detail: `φv·0.6·Fy·Aw = 1.0·0.6·${mFy}·${Aw.toFixed(0)}`, phiRn: kN(PHI.SH * 0.6 * mFy * Aw), demand: kN(Vu), unit: 'kN',
      steps: [
        S('Gross web area Aw', 'H·tw', `${H}·${tw}`, +Aw.toFixed(0), 'mm²'),
        S('Design shear yield φVn', 'φv·0.6·Fy·Aw', `1.0·0.6·${mFy}·${Aw.toFixed(0)}`, kN(PHI.SH * 0.6 * mFy * Aw), 'kN', 'G2.1'),
      ] }));
  }

  return checks;
}

/** 이음판 휨 Fy (판두께 항복강도) — 가독성용 래퍼 */
function mFyPlate(pFy: number): number { return pFy; }
