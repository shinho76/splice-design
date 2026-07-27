// ────────────────────────────────────────────────────────────────────────────
// 플랜지 이음 검토 (AISC 360-16, SI)
//   FB 볼트 · FP 외첨판 · FI 내첨판(×2) · FM 부재 플랜지
//   블록전단은 요소별 케이스 A/B/C/D 최소 지배(geometry.blockShear).
// 소요: Pf(볼트·부재), half=Pf/2(판군 이중전단 50:50), Mu(F13.1).
// ────────────────────────────────────────────────────────────────────────────
import type { DesignResult, DesignCondition, BoltName } from '../types.ts';
import { parseName, sectionByName } from '../sections.ts';
import { Fy as FySteel, Fu as FuSteel, BOLT_MAT } from '../materials.ts';
import { Ab, To_kN } from '../bolts.ts';
import { PHI, FNV_FACTOR, SLIP, holeDia, kN, kNm } from './constants.ts';
import { grossArea, netArea, bearing, buckling, blockShearGovern, flangeColumns } from './geometry.ts';
import type { BlockCase } from './types.ts';
import type { AiscCheck, DemandSet } from './types.ts';

/** 블록전단 지배 케이스 요약 문자열 */
export function bsDetail(bs: { gov: BlockCase; cases: BlockCase[] }): string {
  return `${bs.gov.label} 지배 · ` +
    bs.cases.map(c => `${c.label[0]}(Ubs${c.Ubs},f${c.frac.toFixed(2)}):DCR${(c.dcr ?? 0).toFixed(2)}`).join(' / ');
}

/** dcr·ok 계산 후 push */
function finalize(c: AiscCheck): AiscCheck {
  if (c.phiRn != null && c.demand != null && c.phiRn > 0) {
    c.dcr = +(c.demand / c.phiRn).toFixed(2);
    c.ok = c.dcr <= 1.0;
  }
  return c;
}

export function flangeChecks(r: DesignResult, cond: DesignCondition, dem: DemandSet): AiscCheck[] {
  const { H, B, tw, tf } = parseName(r.section);
  const sec = sectionByName(r.section);
  const Sx = sec?.Sx ?? 0, Zx = sec?.Zx ?? 0;

  const d = r.boltDia, ab = Ab[('M' + d) as BoltName], dh = holeDia(d);
  const Fub = BOLT_MAT[cond.bolt].Fu;
  const thread = cond.threadCond ?? 'N';
  const Fnv = FNV_FACTOR[thread] * Fub;
  const Ns = 2; // 이중전단

  const pSteel = cond.plateSteel ?? cond.steel;
  const pFy = FySteel(pSteel, 20), pFu = FuSteel(pSteel);
  const mFy = FySteel(cond.steel, tf), mFu = FuSteel(cond.steel);

  const Pf = dem.Pf, half = dem.half, Mu = dem.Mu;

  const m = r.flange.bolt.m, nrow = Math.max(1, Math.round(r.flange.bolt.n));
  const nb = m * nrow;
  const g1 = r.flange.gauge?.g1 ?? 90, g2 = r.flange.gauge?.g2 ?? 0;
  const pitch = r.flange.pitch ?? 60, edge = r.flange.edge ?? 40, gap = r.flange.gap ?? 10;
  const Lv = edge + (nrow - 1) * pitch;               // 블록전단 전단선 길이
  const unbraced = gap + 2 * edge;                    // 압축 좌굴 비지지 길이
  const cols = flangeColumns(m, g1, g2);

  const oT = r.flange.outerPlate?.t ?? 9, oW = r.flange.outerPlate?.w ?? B;
  const inner = r.flange.innerPlate, iT = inner?.t ?? 0, iW = inner?.w ?? 0;

  const checks: AiscCheck[] = [];

  // ── FB. 볼트 ──
  {
    const phiRn = PHI.V * Fnv * ab * Ns * nb;
    checks.push(finalize({
      id: 'FB1', region: 'bolt', group: 'A. 볼트', label: '볼트 전단(이중전단)', clause: 'J3.6',
      detail: `φFnvAb·ns·n = 0.75·${Fnv.toFixed(0)}·${ab}·2·${nb} (${thread})`,
      phiRn: kN(phiRn), demand: kN(Pf), unit: 'kN',
      steps: [{ label: '볼트 전단', formula: 'φ·Fnv·Ab·ns·n', subst: `0.75·${Fnv.toFixed(0)}·${ab}·2·${nb}`, phi: PHI.V, phiRn: kN(phiRn), demand: kN(Pf), unit: 'kN', ref: 'J3.6' }],
    }));
    if (cond.jointType === '마찰') {
      const Tb = To_kN[cond.bolt][('M' + d) as BoltName] ?? 0;
      const slip = PHI.SL * SLIP.MU * SLIP.DU * SLIP.HF * Tb * Ns * nb; // kN (Tb가 kN)
      checks.push(finalize({
        id: 'FB2', region: 'bolt', group: 'A. 볼트', label: '볼트 미끄럼(Class B)', clause: 'J3.8',
        detail: `φμDu·hf·Tb·ns·n = 1.0·0.5·1.13·${Tb}·2·${nb}`,
        phiRn: +slip.toFixed(1), demand: kN(Pf), unit: 'kN',
      }));
    } else {
      checks.push({ id: 'FB2', region: 'bolt', group: 'A. 볼트', label: '볼트 미끄럼', clause: 'J3.8', detail: '지압접합 → 해당 없음', note: '지압' });
    }
  }

  // ── FP. 외첨판 PL (half) ──
  {
    const g = `B. 외첨판 PL-${oT}×${oW}`;
    const Ag = grossArea(oW, oT), An = netArea(oW, oT, m, d), Ae = Math.min(An, 0.85 * Ag);
    checks.push(finalize({ id: 'FP1', region: 'outer', group: g, label: '인장 항복', clause: 'J4.1',
      detail: `φFyAg = 0.90·${pFy}·${Ag.toFixed(0)}`, phiRn: kN(PHI.Y * pFy * Ag), demand: kN(half), unit: 'kN' }));
    checks.push(finalize({ id: 'FP2', region: 'outer', group: g, label: '인장 파단', clause: 'J4.2',
      detail: `φFuAe, Ae=min(An,0.85Ag)=${Ae.toFixed(0)}`, phiRn: kN(PHI.V * pFu * Ae), demand: kN(half), unit: 'kN' }));
    const bk = buckling(oT, Ag, pFy, unbraced);
    checks.push(finalize({ id: 'FP3', region: 'outer', group: g, label: '압축 좌굴', clause: 'J4.4/E3',
      detail: `KL/r=${bk.slr.toFixed(1)}, Fcr=${bk.Fcr.toFixed(0)}`, phiRn: kN(bk.phiPn), demand: kN(half), unit: 'kN', note: '압축플랜지 한정' }));
    const br = bearing(oT, pFu, d, m, nrow, edge, pitch);
    checks.push(finalize({ id: 'FP4', region: 'outer', group: g, label: '지압·찢김', clause: 'J3.10',
      detail: br.detail, phiRn: kN(br.total), demand: kN(half), unit: 'kN' }));
    const bs = blockShearGovern({ t: oT, Fy: pFy, Fu: pFu, d, nrow, Lv, halfWidth: oW / 2, cols }, half, 1);
    checks.push(finalize({ id: 'FP5', region: 'outer', group: g, label: '블록 전단', clause: 'J4.3',
      detail: bsDetail(bs), phiRn: kN(bs.phiRn), demand: kN(bs.demand), unit: 'kN', cases: bs.cases }));
  }

  // ── FI. 내첨판 PL ×2 (half) ──
  if (inner) {
    const g = `C. 내첨판 PL-${iT}×${iW}×2`;
    const nHalf = Math.ceil(m / 2);                 // 내판 1매당 열수
    const Ag = 2 * grossArea(iW, iT), An = 2 * netArea(iW, iT, nHalf, d), Ae = Math.min(An, 0.85 * Ag);
    checks.push(finalize({ id: 'FI1', region: 'inner', group: g, label: '인장 항복', clause: 'J4.1',
      detail: `φFy·2Ag = 0.90·${pFy}·${Ag.toFixed(0)}`, phiRn: kN(PHI.Y * pFy * Ag), demand: kN(half), unit: 'kN' }));
    checks.push(finalize({ id: 'FI2', region: 'inner', group: g, label: '인장 파단', clause: 'J4.2',
      detail: `φFu·Ae, Ae=${Ae.toFixed(0)}`, phiRn: kN(PHI.V * pFu * Ae), demand: kN(half), unit: 'kN' }));
    const bk = buckling(iT, Ag, pFy, unbraced);
    checks.push(finalize({ id: 'FI3', region: 'inner', group: g, label: '압축 좌굴', clause: 'J4.4/E3',
      detail: `KL/r=${bk.slr.toFixed(1)}`, phiRn: kN(bk.phiPn), demand: kN(half), unit: 'kN', note: '압축플랜지 한정' }));
    const br = bearing(iT, pFu, d, m, nrow, edge, pitch);
    checks.push(finalize({ id: 'FI4', region: 'inner', group: g, label: '지압·찢김', clause: 'J3.10',
      detail: br.detail, phiRn: kN(br.total), demand: kN(half), unit: 'kN' }));
    if (nHalf >= 2) {
      const iCols = [-g2 / 2, g2 / 2];
      const bs = blockShearGovern({ t: iT, Fy: pFy, Fu: pFu, d, nrow, Lv, halfWidth: iW / 2, cols: iCols }, half, 2);
      checks.push(finalize({ id: 'FI5', region: 'inner', group: g, label: '블록 전단(×2)', clause: 'J4.3',
        detail: bsDetail(bs), phiRn: kN(bs.phiRn), demand: kN(bs.demand), unit: 'kN', cases: bs.cases }));
    } else {
      checks.push({ id: 'FI5', region: 'inner', group: g, label: '블록 전단', clause: 'J4.3', detail: '단일열 → 인장파단(FI2)이 지배', note: '단일열' });
    }
  }

  // ── FM. 부재 H형강 플랜지 (Pf, Mu) ──
  {
    const g = 'D. 부재 H형강';
    const br = bearing(tf, mFu, d, m, nrow, edge, pitch);
    checks.push(finalize({ id: 'FM1', region: 'member', group: g, label: '부재 지압·찢김', clause: 'J3.10',
      detail: `플랜지 tf=${tf}, ${br.detail}`, phiRn: kN(br.total), demand: kN(Pf), unit: 'kN' }));
    // F13.1 인장플랜지 휨파단
    const Afg = B * tf, Afn = netArea(B, tf, m, d), Yt = mFy / mFu <= 0.8 ? 1.0 : 1.1;
    const noRed = mFu * Afn >= Yt * mFy * Afg;
    const Mn = noRed ? mFy * Zx : (mFu * Afn / Afg) * Sx;
    checks.push(finalize({ id: 'FM2', region: 'member', group: g, label: '플랜지 휨파단', clause: 'F13.1',
      detail: `FuAfn=${kN(mFu * Afn)} ${noRed ? '≥' : '<'} YtFyAfg=${kN(Yt * mFy * Afg)} → ${noRed ? '감소없음' : '파단지배'}`,
      phiRn: kNm(PHI.F * Mn), demand: kNm(Mu), unit: 'kN·m' }));
    // D2 인장(WT: 플랜지+웨브 스템)
    const Awt = B * tf + Math.max(0, H / 2 - tf) * tw;
    const U = B >= (2 / 3) * H ? 0.90 : 0.85;
    const AeWt = U * (Awt - m * dh * tf);
    checks.push(finalize({ id: 'FM3', region: 'member', group: g, label: '부재 인장 항복(WT)', clause: 'D2.1',
      detail: `φFyAwt = 0.90·${mFy}·${Awt.toFixed(0)}`, phiRn: kN(PHI.Y * mFy * Awt), demand: kN(Pf), unit: 'kN' }));
    checks.push(finalize({ id: 'FM4', region: 'member', group: g, label: '부재 인장 파단(WT·전단지연)', clause: 'D2.2/D3',
      detail: `U=${U}, Ae=${AeWt.toFixed(0)}`, phiRn: kN(PHI.V * mFu * AeWt), demand: kN(Pf), unit: 'kN' }));
    const bs = blockShearGovern({ t: tf, Fy: mFy, Fu: mFu, d, nrow, Lv, halfWidth: B / 2, cols }, Pf, 1);
    checks.push(finalize({ id: 'FM5', region: 'member', group: g, label: '부재 블록 전단', clause: 'J4.3',
      detail: bsDetail(bs), phiRn: kN(bs.phiRn), demand: kN(bs.demand), unit: 'kN', cases: bs.cases }));
  }

  return checks;
}
