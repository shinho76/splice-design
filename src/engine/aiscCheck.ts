// AISC 360-16(15판) 플랜지 첨판 이음 — 전 한계상태 검토(편람 표준배치를 입력으로 받아 검증).
// 결정사항: 판군 소요 50:50(이중전단), 나사조건 N/X(기본 N), K=1.2(스프레드시트값), Ubs=1.0.
// 국산 볼트는 Fu로 Fnv 매핑(N=0.45·Fu, X=0.563·Fu → A325/A490 표값 재현).
import type { DesignResult, DesignCondition, BoltName } from './types.ts';
import { SECTIONS, parseName } from './sections.ts';
import { Fy, Fu as FuSteel, BOLT_MAT } from './materials.ts';
import { Ab } from './bolts.ts';
import { FLANGE_PLATE_T } from './standards.ts';

export interface AiscCheck {
  group: string; label: string; clause: string;
  detail?: string;                 // 식·치수(그림 참조)
  phiRn?: number; demand?: number;  // kN
  dcr?: number; ok?: boolean; note?: string;
  region?: 'bolt' | 'outer' | 'inner' | 'member';
}
export interface AiscReport { checks: AiscCheck[]; govDcr: number; ok: boolean; db: number; }

const PHI_V = 0.75, PHI_Y = 0.90, PHI_R = 0.75, PHI_C = 0.90, E = 200000, UBS = 1.0, K = 1.2;
const kN = (n: number) => +(n / 1000).toFixed(1);

/** AISC 360-16 플랜지 이음 검토 (편람 결과 r을 입력으로) */
export function aiscCheck(r: DesignResult, cond: DesignCondition): AiscReport {
  const sec = SECTIONS.find(s => s.name === r.section);
  const { H, B, tw, tf } = parseName(r.section);
  const Sx = sec?.Sx ?? 0, Zx = sec?.Zx ?? 0;

  const d = r.boltDia, ab = Ab[('M' + d) as BoltName], dh = d + 2;
  const Fub = BOLT_MAT[cond.bolt].Fu;
  const Fnv = (cond.threadCond === 'X' ? 0.563 : 0.450) * Fub;   // 나사조건 매핑
  const Ns = 2;                                                   // 이중전단(외판+플랜지+내판)

  const pFy = Fy(cond.plateSteel ?? cond.steel, 20), pFu = FuSteel(cond.plateSteel ?? cond.steel);
  const mFy = Fy(cond.steel, tf), mFu = FuSteel(cond.steel);

  const Pf = r.Puf_kN * 1e3, Mu = r.Mu_kNm * 1e6;                 // N, N·mm
  const half = Pf / 2;

  const m = r.flange.bolt.m, nrow = Math.max(1, Math.round(r.flange.bolt.n));
  const nb = m * nrow;                                            // 편측 볼트수
  const g1 = r.flange.gauge?.g1 ?? 90, pitch = r.flange.pitch ?? 60, edge = r.flange.edge ?? 40, gap = r.flange.gap ?? 10;
  const oT = r.flange.outerPlate?.t ?? 9, oW = r.flange.outerPlate?.w ?? B;
  const inner = r.flange.innerPlate, iT = inner?.t ?? 0, iW = inner?.w ?? 0;

  const checks: AiscCheck[] = [];
  const add = (c: AiscCheck) => { if (c.phiRn != null && c.demand != null) { c.dcr = +(c.demand / c.phiRn).toFixed(2); c.ok = c.dcr <= 1.0; } checks.push(c); };

  // 지압/찢김(볼트별)
  const bearBolt = (t: number, Fu: number) => {
    const bear = 2.4 * d * t * Fu, Lc_e = edge - dh / 2, Lc_p = pitch - dh;
    const be = PHI_R * Math.min(bear, 1.2 * Lc_e * t * Fu);     // 연단볼트
    const bs = PHI_R * Math.min(bear, 1.2 * Lc_p * t * Fu);     // 간격볼트
    return { be, bs, tot: m * be + m * (nrow - 1) * bs };
  };
  // 블록전단(대표 U블록: 2전단면 + 게이지 인장면). Case A~D 세분은 후속.
  const blockShear = (t: number, Fu: number, Fy: number) => {
    const Lgv = edge + (nrow - 1) * pitch;                      // 원단볼트→갭측 자유단
    const Agv = 2 * Lgv * t, Anv = 2 * (Lgv - (nrow - 0.5) * dh) * t, Ant = (g1 - dh) * t;
    return PHI_R * Math.min(0.6 * Fu * Anv + UBS * Fu * Ant, 0.6 * Fy * Agv + UBS * Fu * Ant);
  };
  // 압축좌굴(J4.4): KL/r≤25 → FyAg, 초과 → Chapter E
  const buckle = (t: number, Ag: number, Fy: number) => {
    const Lb = 2 * (gap / 2 + edge), rgy = t / Math.sqrt(12), slr = K * Lb / rgy;
    if (slr <= 25) return { Pn: PHI_C * Fy * Ag, slr, Fcr: Fy };
    const Fe = Math.PI ** 2 * E / slr ** 2;
    const Fcr = Fy / Fe <= 2.25 ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe;
    return { Pn: PHI_C * Fcr * Ag, slr, Fcr };
  };

  // ── A. 볼트 (편측 nb개, 이중전단, 대상 Pf) ──
  const boltShear = PHI_V * Fnv * ab * Ns * nb;
  add({ region: 'bolt', group: 'A. 볼트', label: '볼트 전단(이중전단)', clause: 'J3.6',
    detail: `φ·Fnv·Ab·Ns·n = 0.75·${Fnv.toFixed(0)}·${ab}·2·${nb} (${cond.threadCond ?? 'N'})`, phiRn: kN(boltShear), demand: kN(Pf) });
  add({ region: 'bolt', group: 'A. 볼트', label: '볼트 슬립', clause: 'J3.8',
    detail: cond.jointType === '마찰' ? 'μ·Du·hf·Tb·ns (Class B)' : '지압접합 → 해당 없음', note: cond.jointType === '마찰' ? '' : '지압' });

  // ── B. 외첨판 PL (대상 Pf/2) ──
  {
    const Ag = oW * oT, An = (oW - m * dh) * oT, Ae = Math.min(An, 0.85 * Ag);
    add({ region: 'outer', group: `B. 외첨판 PL-${oT}×${oW}`, label: '인장 항복', clause: 'J4.1', detail: `0.90·Fy·Ag = 0.90·${pFy}·${Ag}`, phiRn: kN(PHI_Y * pFy * Ag), demand: kN(half) });
    add({ region: 'outer', group: `B. 외첨판 PL-${oT}×${oW}`, label: '인장 파단', clause: 'J4.2', detail: `0.75·Fu·Ae, Ae=(${oW}−${m}·${dh})·${oT}=${Ae.toFixed(0)}`, phiRn: kN(PHI_R * pFu * Ae), demand: kN(half) });
    const bk = buckle(oT, Ag, pFy);
    add({ region: 'outer', group: `B. 외첨판 PL-${oT}×${oW}`, label: '압축 좌굴', clause: 'J4.4/E3', detail: `KL/r=${bk.slr.toFixed(1)}, Fcr=${bk.Fcr.toFixed(0)}`, phiRn: kN(bk.Pn), demand: kN(half), note: '압축플랜지 한정' });
    const br = bearBolt(oT, pFu);
    add({ region: 'outer', group: `B. 외첨판 PL-${oT}×${oW}`, label: '지압·찢김', clause: 'J3.10', detail: `연단 ${kN(br.be)}·간격 ${kN(br.bs)} /볼트`, phiRn: kN(br.tot), demand: kN(half) });
    add({ region: 'outer', group: `B. 외첨판 PL-${oT}×${oW}`, label: '블록 전단(U)', clause: 'J4.3', detail: 'Case A~D 최소(대표 U블록)', phiRn: kN(blockShear(oT, pFu, pFy)), demand: kN(half) });
  }
  // ── C. 내첨판 PL ×2 (대상 Pf/2) ──
  if (inner) {
    const Ag = 2 * iW * iT, An = 2 * (iW - Math.ceil(m / 2) * dh) * iT, Ae = Math.min(An, 0.85 * Ag);
    add({ region: 'inner', group: `C. 내첨판 PL-${iT}×${iW}×2`, label: '인장 항복', clause: 'J4.1', detail: `0.90·${pFy}·${Ag}`, phiRn: kN(PHI_Y * pFy * Ag), demand: kN(half) });
    add({ region: 'inner', group: `C. 내첨판 PL-${iT}×${iW}×2`, label: '인장 파단', clause: 'J4.2', detail: `0.75·${pFu}·Ae(${Ae.toFixed(0)})`, phiRn: kN(PHI_R * pFu * Ae), demand: kN(half) });
    const bk = buckle(iT, Ag, pFy);
    add({ region: 'inner', group: `C. 내첨판 PL-${iT}×${iW}×2`, label: '압축 좌굴', clause: 'J4.4', detail: `KL/r=${bk.slr.toFixed(1)}`, phiRn: kN(bk.Pn), demand: kN(half), note: '압축플랜지 한정' });
    const br = bearBolt(iT, pFu);
    add({ region: 'inner', group: `C. 내첨판 PL-${iT}×${iW}×2`, label: '지압·찢김', clause: 'J3.10', detail: `연단 ${kN(br.be)}·간격 ${kN(br.bs)} /볼트`, phiRn: kN(br.tot), demand: kN(half) });
    add({ region: 'inner', group: `C. 내첨판 PL-${iT}×${iW}×2`, label: '블록 전단', clause: 'J4.3', detail: '대표 U블록', phiRn: kN(blockShear(iT, pFu, pFy)), demand: kN(half) });
  }
  // ── D. 부재 H형강 플랜지 (대상 Pf, M) ──
  {
    const Afg = B * tf, Afn = (B - m * dh) * tf, Yt = mFy / mFu <= 0.8 ? 1.0 : 1.1;
    const noRed = mFu * Afn >= Yt * mFy * Afg;
    const Mn = noRed ? mFy * Zx : (mFu * Afn / Afg) * Sx;       // F13.1
    add({ region: 'member', group: 'D. 부재 H형강', label: '플랜지 휨(구멍) F13.1', clause: 'F13.1', detail: `Fu·Afn=${kN(mFu * Afn)} ${noRed ? '≥' : '<'} Yt·Fy·Afg=${kN(Yt * mFy * Afg)} → ${noRed ? '감소없음' : '파단지배'}`, phiRn: +(PHI_Y * Mn / 1e6).toFixed(0), demand: +(Mu / 1e6).toFixed(0), note: 'kN·m' });
    const br = bearBolt(tf, mFu);
    add({ region: 'member', group: 'D. 부재 H형강', label: '부재 지압', clause: 'J3.10', detail: `플랜지 tf=${tf} 지압`, phiRn: kN(br.tot), demand: kN(Pf) });
    // D2: 인장플랜지를 티(WT: 플랜지+웨브 스템)로 취급, Pf 전달 (스프레드시트 'Treat as WT')
    const Awt = B * tf + Math.max(0, H / 2 - tf) * tw;          // 티 총단면
    const U = B >= (2 / 3) * H ? 0.90 : 0.85;                   // 전단지연(D3)
    const AeWt = U * (Awt - m * dh * tf);                       // 플랜지 구멍 공제 후 유효
    add({ region: 'member', group: 'D. 부재 H형강', label: '부재 인장 항복(WT)', clause: 'D2.1', detail: `0.90·${mFy}·Awt(${Awt.toFixed(0)})`, phiRn: kN(PHI_Y * mFy * Awt), demand: kN(Pf) });
    add({ region: 'member', group: 'D. 부재 H형강', label: '부재 인장 파단(WT·전단지연)', clause: 'D2.2/D3', detail: `U=${U}, Ae=${AeWt.toFixed(0)}`, phiRn: kN(PHI_R * mFu * AeWt), demand: kN(Pf) });
    add({ region: 'member', group: 'D. 부재 H형강', label: '부재 블록 전단', clause: 'J4.3', detail: '대표 U블록', phiRn: kN(blockShear(tf, mFu, mFy)), demand: kN(Pf) });
  }

  const dcrs = checks.filter(c => c.dcr != null).map(c => c.dcr!);
  const govDcr = dcrs.length ? Math.max(...dcrs) : 0;
  return { checks, govDcr: +govDcr.toFixed(2), ok: govDcr <= 1.0, db: d };
}

// ── 자동보정: DCR>1.0 → 강재 중량 최소 방향으로 표준증분 조정(판두께·볼트행·직경) ──
const DIAS = [16, 20, 22, 24];
const nextUp = (v: number, series: number[]) => series.find(x => x > v) ?? v;
const plateWt = (r: DesignResult) => {
  const o = r.flange.outerPlate, i = r.flange.innerPlate;
  return ((o ? o.t * o.w * o.L : 0) + (i ? 2 * i.t * i.w * i.L : 0)) * 7.85e-6; // kg/부재(플랜지판)
};
export interface AiscAutoResult { result: DesignResult; report: AiscReport; changes: string[]; ok: boolean; memberLimited: boolean; wt0: number; wt1: number; }

export function aiscAutoCorrect(r0: DesignResult, cond: DesignCondition): AiscAutoResult {
  // 얕은 복제(플랜지 지오메트리만 조정)
  const clone = (r: DesignResult): DesignResult => ({
    ...r, flange: { ...r.flange, bolt: { ...r.flange.bolt },
      outerPlate: r.flange.outerPlate ? { ...r.flange.outerPlate } : undefined,
      innerPlate: r.flange.innerPlate ? { ...r.flange.innerPlate } : undefined },
  });
  const r = clone(r0);
  const wt0 = plateWt(r0);
  const changes: string[] = [];
  const pitch = r.flange.pitch ?? 60, edge = r.flange.edge ?? 40, gap = r.flange.gap ?? 10;
  const relenL = (n: number) => 2 * ((Math.round(n) - 1) * pitch + 2 * edge) + gap;
  let memberLimited = false;

  for (let it = 0; it < 20; it++) {
    const rep = aiscCheck(r, cond);
    if (rep.ok) return { result: r, report: rep, changes, ok: true, memberLimited, wt0, wt1: plateWt(r) };
    const fail = rep.checks.filter(c => c.ok === false).sort((a, b) => (b.dcr ?? 0) - (a.dcr ?? 0))[0];
    if (!fail) break;
    const memberSection = fail.clause === 'F13.1' || fail.clause.startsWith('D2');
    const addRows = () => {                           // 볼트행 추가(→ 지압·블록전단·볼트전단 해소)
      const n = Math.round(r.flange.bolt.n);
      if (n < 6) {
        r.flange.bolt = { m: r.flange.bolt.m, n: n + 1, count: r.flange.bolt.m * (n + 1) };
        if (r.flange.outerPlate) r.flange.outerPlate.L = relenL(n + 1);
        if (r.flange.innerPlate) r.flange.innerPlate.L = relenL(n + 1);
        changes.push(`플랜지 볼트행 ${n}→${n + 1} (${fail.label})`); return true;
      }
      const nd = nextUp(r.boltDia, DIAS);
      if (nd === r.boltDia) return false;
      r.boltDia = nd as DesignResult['boltDia']; changes.push(`볼트직경 →M${nd} (${fail.label})`); return true;
    };

    if (memberSection) { memberLimited = true; break; }   // 부재 단면 한계(F13·D2) → 첨판으로 해소 불가
    else if (fail.region === 'outer' && r.flange.outerPlate) {
      const t = r.flange.outerPlate.t, nt = nextUp(t, FLANGE_PLATE_T);
      if (nt === t) break;
      r.flange.outerPlate.t = nt; changes.push(`외첨판 두께 ${t}→${nt} (${fail.label})`);
    } else if (fail.region === 'inner' && r.flange.innerPlate) {
      const t = r.flange.innerPlate.t, nt = nextUp(t, FLANGE_PLATE_T);
      if (nt === t) break;
      r.flange.innerPlate.t = nt; changes.push(`내첨판 두께 ${t}→${nt} (${fail.label})`);
    } else {                                          // 볼트전단·부재 지압·부재 블록전단 → 볼트 추가
      if (!addRows()) break;
    }
  }
  const report = aiscCheck(r, cond);
  return { result: r, report, changes, ok: report.ok, memberLimited, wt0, wt1: plateWt(r) };
}
