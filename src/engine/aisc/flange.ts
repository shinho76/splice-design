// ────────────────────────────────────────────────────────────────────────────
// 플랜지 이음 검토 (AISC 360-16, SI)
//   FB 볼트 · FP 외부 이음판 · FI 내부 이음판(×2) · FM 부재 플랜지
//   블록전단은 요소별 케이스 A/B/C/D 최소 지배(geometry.blockShear).
// 소요: Pf(볼트·부재), half=Pf/2(판군 이중전단 50:50), Mu(F13.1).
// 각 검토는 steps[](면적 세분·중간값)를 보유 → 영문 상세계산서에서 서술 렌더.
// ────────────────────────────────────────────────────────────────────────────
import type { DesignResult, DesignCondition, BoltName } from '../types.ts';
import { parseName, sectionByName } from '../sections.ts';
import { Fy as FySteel, Fu as FuSteel, BOLT_MAT } from '../materials.ts';
import { Ab, To_kN } from '../bolts.ts';
import { PHI, FNV_FACTOR, SLIP, holeDia, netDeductPerHole, kN, kNm } from './constants.ts';
import { grossArea, netArea, netAreaStag, netSectionCases, colOffsets, bearing, buckling, flangeColumns } from './geometry.ts';
import { bsCases } from './bsPatterns.ts';
import type { BsInput } from './bsPatterns.ts';
import type { AiscCheck, AiscStep, BlockCase, DemandSet, NetPath, NetSectionGeom } from './types.ts';

/** 엇모 순단면 도해 기하 생성 — 게이지선을 판폭 중심(0)으로 이동, off·행수 부여 */
function netGeom(width: number, colsOff: { x: number; off: number }[], edge: number, pitch: number, dh: number, plates: number, nHi: number, nLo: number): NetSectionGeom {
  const mean = colsOff.reduce((s, c) => s + c.x, 0) / (colsOff.length || 1);
  const lines = colsOff.map(c => ({ y: c.x - mean, off: c.off, rows: c.off > 0 ? nLo : nHi }));
  return { width, lines, edge, pitch, dh, plates };
}

/** step 팩토리 */
const S = (label: string, formula?: string, subst?: string, value?: number, unit?: string, ref?: string): AiscStep =>
  ({ label, formula, subst, value, unit, ref });

/** 엇모 순단면 후보경로 → 계산서 step 행(각 경로 순폭·순단면적, 지배(최소) 표시). mult=판수(내부판 ×2). */
function netPathSteps(width: number, t: number, cases: NetPath[], gov: NetPath, ndp: number, mult = 1): AiscStep[] {
  const M = mult > 1 ? `·${mult}` : '';
  return cases.map(c => ({
    label: `· ${c.label}`,
    formula: `(w − n·(dₕ+2)${c.gain > 0.05 ? ' + Σs²/4g' : ''})·t${M}`,
    subst: `(${width} − ${c.nHoles}·${ndp}${c.gain > 0.05 ? ` + ${c.gain.toFixed(1)}` : ''})·${t}${M}`,
    value: +(c.area * mult).toFixed(0), unit: 'mm²', ref: 'B4.3b',
    note: c.key === gov.key ? '지배(최소)' : undefined,
  }));
}

/** 블록전단 지배 Path 요약 문자열 (Path·Ubs·DCR만) */
export function bsDetail(bs: { gov: BlockCase; cases: BlockCase[] }): string {
  return `${bs.gov.path ?? ''} 지배 · ` +
    bs.cases.map(c => `${c.path}(U${'ᵇˢ'}${c.Ubs.toFixed(1)}):DCR${(c.dcr ?? 0).toFixed(2)}`).join(' / ');
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

  const d = r.boltDia, ab = Ab[('M' + d) as BoltName], dh = holeDia(d), ndp = netDeductPerHole(d);
  const Fub = BOLT_MAT[cond.bolt].Fu;
  const thread = cond.threadCond ?? 'N';
  const Fnv = FNV_FACTOR[thread] * Fub;
  const Ns = 2; // 이중전단

  const pSteel = cond.plateSteel ?? cond.steel;
  const pFy = FySteel(pSteel, 20), pFu = FuSteel(pSteel);
  const mFy = FySteel(cond.steel, tf), mFu = FuSteel(cond.steel);

  const Pf = dem.Pf, Mu = dem.Mu;
  const halfOut = dem.halfOuter, halfIn = dem.halfInner;   // 외/내부 이음판 비례분배 소요

  const m = r.flange.bolt.m, nrow = Math.max(1, Math.round(r.flange.bolt.n));
  const nb = m * nrow;
  const g1 = r.flange.gauge?.g1 ?? 90, g2 = r.flange.gauge?.g2 ?? 0;
  const pitch = r.flange.pitch ?? 60, edge = r.flange.edge ?? 40, gap = r.flange.gap ?? 10;
  const nHi = Math.ceil(r.flange.bolt.n), nLo = Math.floor(r.flange.bolt.n);   // 엇모 외/내측 행수(3D/DXF 정합)
  const unbraced = gap + 2 * edge;                    // 압축 좌굴 비지지 길이
  const cols = flangeColumns(m, g1, g2);
  const stagF = r.flange.staggered ?? false;              // 엇모 여부 → B4.3b 순단면
  const colsOff = colOffsets(cols, stagF);                // 전 열 {x, off}
  const innerColsOff = colsOff.filter(c => c.x > 0);      // 내부 이음판 1매(웨브 한쪽) 열들

  const oT = r.flange.outerPlate?.t ?? 9, oW = r.flange.outerPlate?.w ?? B;
  const inner = r.flange.innerPlate, iT = inner?.t ?? 0, iW = inner?.w ?? 0;

  const checks: AiscCheck[] = [];

  // ── FB. 볼트 ──
  {
    const phiRn1 = PHI.V * Fnv * ab * Ns;         // 볼트 1개 설계전단강도(이중전단)
    const phiRn = phiRn1 * nb;                     // 총 설계강도 = 1개 강도 × 본수
    checks.push(finalize({
      id: 'FB1', region: 'bolt', group: 'A. 볼트', label: '볼트 전단(이중전단)', clause: 'J3.6',
      detail: `φrₙ = 0.75·${Fnv.toFixed(0)}·${ab}·2 = ${kN(phiRn1)} kN/EA ×${nb} = ${kN(phiRn)} kN (${thread})`,
      phiRn: kN(phiRn), demand: kN(Pf), unit: 'kN',
      steps: [
        S('Nominal shear stress Fnv', thread === 'X' ? '0.563·Fu(bolt)' : '0.450·Fu(bolt)', `${FNV_FACTOR[thread]}·${Fub}`, +Fnv.toFixed(0), 'MPa', 'J3.6'),
        S('Bolt shear area Ab', 'π/4·d²', `M${d}`, ab, 'mm²'),
        S('Per-bolt design shear φrₙ', 'φ·Fnv·Ab·ns', `0.75·${Fnv.toFixed(0)}·${ab}·2`, kN(phiRn1), 'kN', 'J3.6'),
        S('Total φRn = φrₙ·n', 'φrₙ · n', `${kN(phiRn1)}·${nb}`, kN(phiRn), 'kN'),
      ],
    }));
    if (cond.jointType === '마찰') {
      const Tb = To_kN[cond.bolt][('M' + d) as BoltName] ?? 0;
      const slip1 = PHI.SL * SLIP.MU * SLIP.DU * SLIP.HF * Tb * Ns;   // 볼트 1개 설계미끄럼강도(이중면)
      const slip = slip1 * nb;                                         // 총 = 1개 강도 × 본수
      checks.push(finalize({
        id: 'FB2', region: 'bolt', group: 'A. 볼트', label: '볼트 미끄럼(Class B)', clause: 'J3.8',
        detail: `φrₙ = 1.0·0.5·1.13·${Tb}·2 = ${slip1.toFixed(1)} kN/EA ×${nb} = ${slip.toFixed(1)} kN`,
        phiRn: +slip.toFixed(1), demand: kN(Pf), unit: 'kN',
        steps: [
          S('Min. bolt pretension Tb', 'KS design bolt tension', `M${d} ${cond.bolt}`, Tb, 'kN', 'J3.8'),
          S('Per-bolt design slip φrₙ', 'φ·μ·Du·hf·Tb·ns', `1.0·0.50·1.13·1.0·${Tb}·2`, +slip1.toFixed(1), 'kN', 'J3.8'),
          S('Total φRn = φrₙ·n', 'φrₙ · n', `${slip1.toFixed(1)}·${nb}`, +slip.toFixed(1), 'kN'),
        ],
      }));
    } else {
      checks.push({ id: 'FB2', region: 'bolt', group: 'A. 볼트', label: '볼트 미끄럼', clause: 'J3.8', detail: '지압접합 → 해당 없음', note: '지압' });
    }
  }

  // ── FP. 외부 이음판 PL (half) ──
  {
    const g = `B. 외부 이음판 PL-${oT}×${oW}`;
    const nsc = netSectionCases(oW, oT, colsOff, ndp), An = nsc.gov.area, Ag = grossArea(oW, oT), Ae = Math.min(An, 0.85 * Ag);
    checks.push(finalize({
      id: 'FP1', region: 'outer', group: g, label: '인장 항복', clause: 'J4.1',
      detail: `φFyAg = 0.90·${pFy}·${Ag.toFixed(0)}`, phiRn: kN(PHI.Y * pFy * Ag), demand: kN(halfOut), unit: 'kN',
      steps: [
        S('Gross area Ag', 'width × thickness', `${oW}·${oT}`, +Ag.toFixed(0), 'mm²'),
        S('Design yield φRn', 'φ·Fy·Ag', `0.90·${pFy}·${Ag.toFixed(0)}`, kN(PHI.Y * pFy * Ag), 'kN', 'J4.1'),
      ],
    }));
    checks.push(finalize({
      id: 'FP2', region: 'outer', group: g, label: '인장 파단', clause: 'J4.2',
      detail: `φFuAe, Ae=min(An,0.85Ag)=${Ae.toFixed(0)}${stagF ? ` · 순단면 지배=${nsc.gov.label}` : ''}`, phiRn: kN(PHI.V * pFu * Ae), demand: kN(halfOut), unit: 'kN',
      steps: [
        S('Gross area Ag', 'width × thickness', `${oW}·${oT}`, +Ag.toFixed(0), 'mm²'),
        ...(stagF
          ? [S('Net area An — 후보 파단경로 전수검토 (B4.3b)', '', '', undefined, undefined, 'B4.3b'), ...netPathSteps(oW, oT, nsc.cases, nsc.gov, ndp)]
          : [S('Net area An (deduct m holes)', '(w − m·(dₕ+2mm))·t', `(${oW} − ${m}·${ndp})·${oT}`, +An.toFixed(0), 'mm²', 'B4.3b')]),
        S('Effective area Ae', 'min(An, 0.85·Ag)', `min(${An.toFixed(0)}, ${(0.85 * Ag).toFixed(0)})`, +Ae.toFixed(0), 'mm²'),
        S('Design rupture φRn', 'φ·Fu·Ae', `0.75·${pFu}·${Ae.toFixed(0)}`, kN(PHI.V * pFu * Ae), 'kN', 'J4.2'),
      ],
      nsPaths: stagF ? nsc.cases : undefined,
      nsGeom: stagF ? netGeom(oW, colsOff, edge, pitch, dh, 1, nHi, nLo) : undefined,
    }));
    const bk = buckling(oT, Ag, pFy, unbraced);
    checks.push(finalize({
      id: 'FP3', region: 'outer', group: g, label: '압축 좌굴', clause: 'J4.4/E3',
      detail: `KL/r=${bk.slr.toFixed(1)}, Fcr=${bk.Fcr.toFixed(0)}`, phiRn: kN(bk.phiPn), demand: kN(halfOut), unit: 'kN', note: '압축플랜지 한정',
      steps: [
        S('Radius of gyration r', 't/√12', `${oT}/√12`, +(oT / Math.sqrt(12)).toFixed(2), 'mm'),
        S('Slenderness KL/r', 'K·Lunbraced/r', `1.2·${unbraced}/${(oT / Math.sqrt(12)).toFixed(2)}`, +bk.slr.toFixed(1)),
        S('Critical stress Fcr', bk.slr <= 25 ? 'Fy (KL/r≤25)' : 'E3', '', +bk.Fcr.toFixed(0), 'MPa', 'J4.4/E3'),
        S('Design compression φRn', 'φ·Fcr·Ag', `0.90·${bk.Fcr.toFixed(0)}·${Ag.toFixed(0)}`, kN(bk.phiPn), 'kN'),
      ],
    }));
    const br = bearing(oT, pFu, d, m, nrow, edge, pitch);
    checks.push(finalize({
      id: 'FP4', region: 'outer', group: g, label: '지압·찢김', clause: 'J3.10', detail: br.detail, phiRn: kN(br.total), demand: kN(halfOut), unit: 'kN',
      steps: [
        S('Bearing limit φ·2.4dtFu (all bolts)', 'φ·2.4·d·t·Fu', `0.75·2.4·${d}·${oT}·${pFu}`, kN(br.brg), 'kN', 'J3.10'),
        S('Edge bolt (tearout/bearing)', 'min(bearing, φ·1.2·Lc,e·t·Fu)', `tear=0.75·1.2·${br.LcEdge.toFixed(1)}·${oT}·${pFu}=${kN(br.tearEdge)} (Lc,e=${edge}−${dh}/2); min→${kN(br.edge)} [${br.govEdge}]`, kN(br.edge), 'kN'),
        S('Interior bolt', 'min(bearing, φ·1.2·Lc,p·t·Fu)', `tear=0.75·1.2·${br.LcPitch.toFixed(1)}·${oT}·${pFu}=${kN(br.tearPitch)} (Lc,p=${pitch}−${dh}); min→${kN(br.spaced)} [${br.govPitch}]`, kN(br.spaced), 'kN'),
        S('Total (m edge + m(n−1) interior)', 'nₑ·edge + nᵢ·interior', `${br.nEdge}·${kN(br.edge)} + ${br.nSpaced}·${kN(br.spaced)}`, kN(br.total), 'kN'),
      ],
    }));
    const bs = bsCases({ kind: 'outer', lines: cols, n: nrow, pitch, edge, staggered: stagF, nHi, nLo, ym: oW / 2, t: oT, dh, Fy: pFy, Fu: pFu, plates: 1 }, halfOut);
    checks.push(finalize({
      id: 'FP5', region: 'outer', group: g, label: '블록 전단', clause: 'J4.3',
      detail: bsDetail(bs), phiRn: kN(bs.gov.phiRn), demand: kN(halfOut), unit: 'kN', cases: bs.cases,
      bsGeom: { cols, nrow, pitch, edge, halfWidth: oW / 2, dh, plates: 1, staggered: stagF, gauge: g1, nHi, nLo },
    }));
  }

  // ── FI. 내부 이음판 PL ×2 (half) ──
  if (inner) {
    const g = `C. 내부 이음판 PL-${iT}×${iW}×2`;
    const nHalf = Math.ceil(m / 2);                 // 내판 1매당 열수
    const nscI = netSectionCases(iW, iT, innerColsOff, ndp);   // 내판 1매 B4.3b 순단면(후보경로 전수)
    const Ag = 2 * grossArea(iW, iT), An = 2 * nscI.gov.area, Ae = Math.min(An, 0.85 * Ag);
    checks.push(finalize({
      id: 'FI1', region: 'inner', group: g, label: '인장 항복', clause: 'J4.1',
      detail: `φFy·2Ag = 0.90·${pFy}·${Ag.toFixed(0)}`, phiRn: kN(PHI.Y * pFy * Ag), demand: kN(halfIn), unit: 'kN',
      steps: [
        S('Gross area (2 plates) Ag', '2·(width × thickness)', `2·${iW}·${iT}`, +Ag.toFixed(0), 'mm²'),
        S('Design yield φRn', 'φ·Fy·Ag', `0.90·${pFy}·${Ag.toFixed(0)}`, kN(PHI.Y * pFy * Ag), 'kN', 'J4.1'),
      ],
    }));
    checks.push(finalize({
      id: 'FI2', region: 'inner', group: g, label: '인장 파단', clause: 'J4.2',
      detail: `φFu·Ae, Ae=${Ae.toFixed(0)}${stagF ? ` · 순단면 지배=${nscI.gov.label}` : ''}`, phiRn: kN(PHI.V * pFu * Ae), demand: kN(halfIn), unit: 'kN',
      steps: [
        S('Gross area (2 plates) Ag', '2·w·t', `2·${iW}·${iT}`, +Ag.toFixed(0), 'mm²'),
        ...(stagF
          ? [S('Net area An (×2매) — 후보 파단경로 전수검토 (B4.3b)', '', '', undefined, undefined, 'B4.3b'), ...netPathSteps(iW, iT, nscI.cases, nscI.gov, ndp, 2)]
          : [S('Net area An (deduct n holes/plate)', '2·(w − n·(dₕ+2mm))·t', `2·(${iW} − ${nHalf}·${ndp})·${iT} (n=${nHalf}열, dₕ=${dh}=d+2, +2mm B4.3b → ${ndp})`, +An.toFixed(0), 'mm²', 'B4.3b')]),
        S('Effective area Ae', 'min(An, 0.85·Ag)', `min(${An.toFixed(0)}, ${(0.85 * Ag).toFixed(0)})`, +Ae.toFixed(0), 'mm²'),
        S('Design rupture φRn', 'φ·Fu·Ae', `0.75·${pFu}·${Ae.toFixed(0)}`, kN(PHI.V * pFu * Ae), 'kN', 'J4.2'),
      ],
      nsPaths: stagF ? nscI.cases : undefined,
      nsGeom: stagF ? netGeom(iW, innerColsOff, edge, pitch, dh, 2, nHi, nLo) : undefined,
    }));
    const bk = buckling(iT, Ag, pFy, unbraced);
    checks.push(finalize({
      id: 'FI3', region: 'inner', group: g, label: '압축 좌굴', clause: 'J4.4/E3',
      detail: `KL/r=${bk.slr.toFixed(1)}`, phiRn: kN(bk.phiPn), demand: kN(halfIn), unit: 'kN', note: '압축플랜지 한정',
      steps: [
        S('Slenderness KL/r', 'K·Lunbraced/(t/√12)', `1.2·${unbraced}/(${iT}/√12)`, +bk.slr.toFixed(1)),
        S('Critical stress Fcr', bk.slr <= 25 ? 'Fy (KL/r≤25)' : 'E3', '', +bk.Fcr.toFixed(0), 'MPa'),
        S('Design compression φRn', 'φ·Fcr·Ag', `0.90·${bk.Fcr.toFixed(0)}·${Ag.toFixed(0)}`, kN(bk.phiPn), 'kN'),
      ],
    }));
    const br = bearing(iT, pFu, d, m, nrow, edge, pitch);
    checks.push(finalize({
      id: 'FI4', region: 'inner', group: g, label: '지압·찢김', clause: 'J3.10', detail: br.detail, phiRn: kN(br.total), demand: kN(halfIn), unit: 'kN',
      steps: [
        S('Bearing limit φ·2.4dtFu (all bolts)', 'φ·2.4·d·t·Fu', `0.75·2.4·${d}·${iT}·${pFu}`, kN(br.brg), 'kN', 'J3.10'),
        S('Edge bolt', 'min(bearing, φ·1.2·Lc,e·t·Fu)', `tear=0.75·1.2·${br.LcEdge.toFixed(1)}·${iT}·${pFu}=${kN(br.tearEdge)} (Lc,e=${edge}−${dh}/2); min→${kN(br.edge)} [${br.govEdge}]`, kN(br.edge), 'kN'),
        S('Interior bolt', 'min(bearing, φ·1.2·Lc,p·t·Fu)', `tear=0.75·1.2·${br.LcPitch.toFixed(1)}·${iT}·${pFu}=${kN(br.tearPitch)} (Lc,p=${pitch}−${dh}); min→${kN(br.spaced)} [${br.govPitch}]`, kN(br.spaced), 'kN'),
        S('Total', 'nₑ·edge + nᵢ·interior', `${br.nEdge}·${kN(br.edge)} + ${br.nSpaced}·${kN(br.spaced)}`, kN(br.total), 'kN'),
      ],
    }));
    {
      // 내부판 = 웨브 양측 2매(상·하 스트립). 게이지선=플랜지열(cols), 각 스트립 [끝선 iE, 외측연단 oE].
      const aOutI = Math.max(...cols.map(Math.abs)), oE = aOutI + 35, iE = Math.max(6, oE - iW);
      const bs = bsCases({ kind: 'inner', lines: cols, n: nrow, pitch, edge, staggered: stagF, nHi, nLo, ym: oE, innerEdge: iE, outerEdge: oE, webBar: tw / 2 + 4, t: iT, dh, Fy: pFy, Fu: pFu, plates: 1 }, halfIn);
      checks.push(finalize({
        id: 'FI5', region: 'inner', group: g, label: '블록 전단(×2)', clause: 'J4.3',
        detail: bsDetail(bs), phiRn: kN(bs.gov.phiRn), demand: kN(halfIn), unit: 'kN', cases: bs.cases,
        bsGeom: { cols, nrow, pitch, edge, halfWidth: oE, dh, plates: 2, staggered: stagF, gauge: g2 || g1, nHi, nLo, webBar: tw / 2 + 4, innerEdge: iE } as any,
      }));
    }
  }

  // ── FM. 부재 H형강 플랜지 (Pf, Mu) ──
  {
    const g = 'D. 부재 H형강';
    const br = bearing(tf, mFu, d, m, nrow, edge, pitch);
    checks.push(finalize({
      id: 'FM1', region: 'member', group: g, label: '부재 지압·찢김', clause: 'J3.10',
      detail: `플랜지 tf=${tf}, ${br.detail}`, phiRn: kN(br.total), demand: kN(Pf), unit: 'kN',
      steps: [
        S('Bearing limit φ·2.4dtf·Fu (all bolts)', 'φ·2.4·d·tf·Fu', `0.75·2.4·${d}·${tf}·${mFu}`, kN(br.brg), 'kN', 'J3.10'),
        S('Edge bolt on flange (t=tf)', 'min(bearing, φ·1.2·Lc,e·tf·Fu)', `tear=0.75·1.2·${br.LcEdge.toFixed(1)}·${tf}·${mFu}=${kN(br.tearEdge)} (Lc,e=${edge}−${dh}/2); min→${kN(br.edge)} [${br.govEdge}]`, kN(br.edge), 'kN'),
        S('Interior bolt', 'min(bearing, φ·1.2·Lc,p·tf·Fu)', `tear=0.75·1.2·${br.LcPitch.toFixed(1)}·${tf}·${mFu}=${kN(br.tearPitch)} (Lc,p=${pitch}−${dh}); min→${kN(br.spaced)} [${br.govPitch}]`, kN(br.spaced), 'kN'),
        S('Total', 'nₑ·edge + nᵢ·interior', `${br.nEdge}·${kN(br.edge)} + ${br.nSpaced}·${kN(br.spaced)}`, kN(br.total), 'kN'),
      ],
    }));
    // F13.1 인장플랜지 휨파단
    const nsF = netAreaStag(B, tf, colsOff, ndp), Afn = nsF.area;   // 플랜지 순단면 B4.3b(엇모 s²/4g)
    const Afg = B * tf, Yt = mFy / mFu <= 0.8 ? 1.0 : 1.1;
    const noRed = mFu * Afn >= Yt * mFy * Afg;
    const Mn = noRed ? mFy * Zx : (mFu * Afn / Afg) * Sx;
    checks.push(finalize({
      id: 'FM2', region: 'member', group: g, label: '플랜지 휨파단', clause: 'F13.1',
      detail: `FuAfn=${kN(mFu * Afn)} ${noRed ? '≥' : '<'} YtFyAfg=${kN(Yt * mFy * Afg)} → ${noRed ? '감소없음' : '파단지배'}`,
      phiRn: kNm(PHI.F * Mn), demand: kNm(Mu), unit: 'kN·m',
      steps: [
        S('Gross flange area Afg', 'B·tf', `${B}·${tf}`, +Afg.toFixed(0), 'mm²'),
        S('Net flange area Afn', stagF ? '(B − m·(dₕ+2) + Σs²/4g)·tf' : '(B − m·(dₕ+2))·tf', stagF ? `(${B} − ${m}·${ndp} + ${nsF.gain.toFixed(1)})·${tf}` : `(${B} − ${m}·${ndp})·${tf}`, +Afn.toFixed(0), 'mm²', 'B4.3b'),
        S('Hole-reduction test', 'Fu·Afn vs Yt·Fy·Afg', `${kN(mFu * Afn)} vs ${kN(Yt * mFy * Afg)} (Yt=${Yt})`, undefined, 'kN', 'F13.1'),
        S('Nominal moment Mn', noRed ? 'Fy·Zx (no reduction)' : '(Fu·Afn/Afg)·Sx', noRed ? `${mFy}·${Zx}` : `(${mFu}·${Afn.toFixed(0)}/${Afg.toFixed(0)})·${Sx}`, kNm(Mn), 'kN·m'),
        S('Design φMn', 'φ·Mn', `0.90·${kNm(Mn)}`, kNm(PHI.F * Mn), 'kN·m'),
      ],
    }));
    // D2 인장(WT: 플랜지+웨브 스템)
    const stem = Math.max(0, H / 2 - tf) * tw;
    const Awt = B * tf + stem;
    const U = B >= (2 / 3) * H ? 0.90 : 0.85;
    const AeWt = U * (Awt - m * dh * tf);
    checks.push(finalize({
      id: 'FM3', region: 'member', group: g, label: '부재 인장 항복(WT)', clause: 'D2.1',
      detail: `φFyAwt = 0.90·${mFy}·${Awt.toFixed(0)}`, phiRn: kN(PHI.Y * mFy * Awt), demand: kN(Pf), unit: 'kN',
      steps: [
        S('WT flange part', 'B·tf', `${B}·${tf}`, +(B * tf).toFixed(0), 'mm²'),
        S('WT web-stem part', '(H/2 − tf)·tw', `(${H}/2 − ${tf})·${tw}`, +stem.toFixed(0), 'mm²'),
        S('WT gross area Awt', 'flange + stem', `${(B * tf).toFixed(0)} + ${stem.toFixed(0)}`, +Awt.toFixed(0), 'mm²'),
        S('Design yield φRn', 'φ·Fy·Awt', `0.90·${mFy}·${Awt.toFixed(0)}`, kN(PHI.Y * mFy * Awt), 'kN', 'D2.1'),
      ],
    }));
    checks.push(finalize({
      id: 'FM4', region: 'member', group: g, label: '부재 인장 파단(WT·전단지연)', clause: 'D2.2/D3',
      detail: `U=${U}, Ae=${AeWt.toFixed(0)}`, phiRn: kN(PHI.V * mFu * AeWt), demand: kN(Pf), unit: 'kN',
      steps: [
        S('Shear-lag factor U', B >= (2 / 3) * H ? '0.90 (bf ≥ ⅔d)' : '0.85 (bf < ⅔d)', `bf=${B}, ⅔d=${((2 / 3) * H).toFixed(0)}`, U, '', 'D3'),
        S('Net WT area (holes in flange)', 'Awt − m·dₕ·tf', `${Awt.toFixed(0)} − ${m}·${dh}·${tf}`, +(Awt - m * dh * tf).toFixed(0), 'mm²'),
        S('Effective net area Ae', 'U·(net WT area)', `${U}·${(Awt - m * dh * tf).toFixed(0)}`, +AeWt.toFixed(0), 'mm²'),
        S('Design rupture φRn', 'φ·Fu·Ae', `0.75·${mFu}·${AeWt.toFixed(0)}`, kN(PHI.V * mFu * AeWt), 'kN', 'D2.2'),
      ],
    }));
    // 끝선 = 내부 이음판 끝선(FI5와 동일 위치 ±iE). 내부판 없으면 웨브 경계로 대체.
    const iEm = iW > 0 ? Math.max(6, Math.max(...cols.map(Math.abs)) + 35 - iW) : tw / 2 + 4;
    const bs = bsCases({ kind: 'girder', lines: cols, n: nrow, pitch, edge, staggered: stagF, nHi, nLo, ym: B / 2, webBar: tw / 2 + 4, t: tf, dh, Fy: mFy, Fu: mFu, plates: 1 }, Pf);
    checks.push(finalize({
      id: 'FM5', region: 'member', group: g, label: '부재 블록 전단', clause: 'J4.3',
      detail: bsDetail(bs), phiRn: kN(bs.gov.phiRn), demand: kN(Pf), unit: 'kN', cases: bs.cases,
      bsGeom: { cols, nrow, pitch, edge, halfWidth: B / 2, dh, plates: 1, staggered: stagF, gauge: g1, nHi, nLo, webBar: tw / 2 + 4, innerEdge: iEm } as any,
    }));
  }

  return checks;
}
