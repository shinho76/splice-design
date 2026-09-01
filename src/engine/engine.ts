// 계산 엔진 — 보/기둥 × 마찰/지압 (제5·6·7·8장). 플랜지 이음 + 웨브 이음.
// 검증: 검증 예제(보 100% SHN490 F10T)(마찰·지압).
import type { DesignCondition, HSection, CalcStep, DesignResult, JointDesign, BoltName } from './types.ts';
import { Fy, BOLT_MAT, Fu as FuSteel } from './materials.ts';
import {
  PHI_FLEX, PHI_SHEAR, PHI_COMP, PHI_BEAR, designSlipStrength_kN, BOLT_HOLE, Ab,
} from './bolts.ts';
import {
  flangeStdFor, FLANGE_PLATE_T, WEB_PLATE_T, WEB_PITCH_OPTIONS,
  PITCH_ALIGNED, PITCH_STAGGERED, roundUpThickness,
} from './standards.ts';
import { flangeLB_Mn, webLB_Mn } from './nominal.ts';

const ceil = Math.ceil;
const ceilHalf = (x: number) => Math.ceil(x * 2) / 2;
const boltDiaOf = (b: string) => parseInt(b.slice(1), 10) as import('./types.ts').BoltDia;
const boltNameOf = (d: number) => ('M' + d) as import('./types.ts').BoltName;
// AISC 360-16 표 J3.4M 최소 연단거리(mm) — 외부 이음판 폭 캡 시 횡연단 하한 보장용
const MIN_EDGE: Record<number, number> = { 16: 22, 18: 24, 20: 26, 22: 28, 24: 30, 27: 34, 30: 38 };

/**
 * 웨브용 볼트 1개 설계강도 (kN) — 마찰=미끄럼, 지압=중간부 지압강도 φRn₂ (6.8).
 * φRn₂ = min(볼트전단, 전단파괴 1.2·(60−hole)·tw·Fu, 국부압축 2.4·d·tw·Fu) × 0.75.
 * 얇은 웨브는 전단파괴가 지배 → 볼트수 증가(부록 지압 웨브 재현).
 */
function boltStrength(cond: DesignCondition, bolt: BoltName, Ns: number, tGov: number, fu: number): number {
  if (cond.jointType === '마찰') return designSlipStrength_kN(cond.bolt, bolt, Ns);
  const d = BOLT_HOLE[bolt].dia, hole = BOLT_HOLE[bolt].hole;
  const boltShear = 0.5 * BOLT_MAT[cond.bolt].Fu * Ab[bolt] * Ns;
  const bearing = Math.min(1.2 * (60 - hole) * tGov * fu, 2.4 * d * tGov * fu);
  return PHI_BEAR * Math.min(boltShear, bearing) / 1e3;
}

/**
 * 플랜지 볼트 설계강도 — 연단부 Rn1 / 중간부 Rn2 (제6.4.1).
 * 지압: min(볼트전단, 전단파괴 1.2·Lc·t·Fu, 국부압축 2.4·d·t·Fu), 모재·이음판 각각 검토.
 * 마찰: rn1=rn2=설계미끄럼강도(균일).
 */
interface BoltCap { rn1: number; rn2: number; uniform: boolean; }
function boltCap(cond: DesignCondition, bolt: BoltName, Ns: number, tMember: number, tPlate: number, fuMember: number, fuPlate: number, pitch: number): BoltCap {
  if (cond.jointType === '마찰') {
    const s = designSlipStrength_kN(cond.bolt, bolt, Ns);
    return { rn1: s, rn2: s, uniform: true };
  }
  const d = BOLT_HOLE[bolt].dia, hole = BOLT_HOLE[bolt].hole;
  const boltShear = 0.5 * BOLT_MAT[cond.bolt].Fu * Ab[bolt] * Ns;
  const Lc1 = 40 - hole / 2, Lc2 = pitch - hole;               // 연단·중간 순간격
  const bear = (t: number, Lc: number, fu: number) => Math.min(1.2 * Lc * t * fu, 2.4 * d * t * fu);
  const rn1 = Math.min(boltShear, bear(tMember, Lc1, fuMember), bear(tPlate, Lc1, fuPlate));  // 모재=fu, 이음판=pfu
  const rn2 = Math.min(boltShear, bear(tMember, Lc2, fuMember), bear(tPlate, Lc2, fuPlate));
  return { rn1: PHI_BEAR * rn1 / 1e3, rn2: PHI_BEAR * rn2 / 1e3, uniform: false };
}
/** 요구 행수: m·(rn1 + (n−1)·rn2) ≥ 소요력 */
function requiredRows(force: number, m: number, cap: BoltCap, staggered: boolean): number {
  const raw = cap.uniform
    ? force / (m * cap.rn1)
    : 1 + Math.max(0, (force - m * cap.rn1) / (m * cap.rn2));
  const r = staggered ? ceilHalf(raw) : ceil(raw);
  return Math.max(staggered ? 1 : 1, r);
}

/** 통합 진입점 */
export function designConnection(cond: DesignCondition, sec: HSection, forceDia?: number): DesignResult {
  return cond.member === '보'
    ? designBeam(cond, sec, forceDia)
    : designColumn(cond, sec, forceDia);
}
export const designBeamFriction = (cond: DesignCondition, sec: HSection) =>
  designBeam({ ...cond, jointType: '마찰' }, sec); // 하위호환

// ─────────────────────────────── 보 (제5·6장) ───────────────────────────────
function designBeam(cond: DesignCondition, sec: HSection, forceDia?: number): DesignResult {
  const steps: CalcStep[] = [];
  const fy = Fy(cond.steel, sec.tf);
  const fu = FuSteel(cond.steel);
  const pGrade = cond.plateSteel ?? cond.steel;   // 이음판 강종(미지정=모재 동일)
  const pfy = Fy(pGrade, sec.tf), pfu = FuSteel(pGrade);
  const alpha = cond.strengthRatio;
  const std = forceDia ? { ...flangeStdFor(sec.B), bolt: boltNameOf(forceDia) } : flangeStdFor(sec.B);
  const bearing = cond.jointType === '지압';

  // 가) 소요휨강도 → 플랜지 소요축력
  const hasInner = std.innerW != null;
  const MnF = flangeLB_Mn(sec, fy), MnW = webLB_Mn(sec, fy);
  const Mn = Math.min(MnF, MnW);
  const Mu = alpha * PHI_FLEX * Mn;
  const dm = hasInner ? sec.H - sec.tf : sec.H;
  const Puf = (Mu * 1e6) / dm / 1e3;
  steps.push(
    { group:'가) 소요휨강도 · 플랜지 소요축력', label:'공칭휨강도', formula:'Mn = min(플랜지·웨브 국부좌굴)', substitution:`min(${MnF.toFixed(0)}, ${MnW.toFixed(0)})`, value:+Mn.toFixed(0), unit:'kN·m', ref:'5.2.1~2',
      note:'횡좌굴은 무시하고 국부좌굴만, 총단면에 대해 산정한다.' },
    { group:'가) 소요휨강도 · 플랜지 소요축력', label:'접합부 소요휨강도', formula:'Mu = α·φ·Mn', substitution:`${alpha}×0.9×${Mn.toFixed(0)}`, value:+Mu.toFixed(0), unit:'kN·m', ref:'5.2.3' },
    { group:'가) 소요휨강도 · 플랜지 소요축력', label:'플랜지 소요축력', formula:'Puf = Mu / dm', substitution:`${Mu.toFixed(0)}×10⁶ / ${dm}`, value:+Puf.toFixed(0), unit:'kN', ref:'5.2.4',
      note:`dm = ${hasInner ? '상·하 플랜지 중심거리 (H−tf)' : 'H형강 전체 춤 (외부 이음판만 사용)'}` },
  );

  const flange = designFlange(cond, sec, std, fy, fu, pfy, pfu, Puf, bearing, steps);

  // 웨브 이음 — 소요전단강도
  const Vu = alpha * PHI_SHEAR * 0.6 * fy * (sec.H * sec.tw) / 1e3;
  steps.push({ group:'마) 웨브 소요전단강도', label:'소요전단강도', formula:'Vu = α·φv·0.6·Fy·(H·tw)', substitution:`${alpha}×0.9×0.6×${fy}×${sec.H}×${sec.tw}`, value:+Vu.toFixed(0), unit:'kN', ref:'5.6' });
  const web = designWeb(cond, sec, std.bolt, fy, fu, pfy, Vu, bearing, steps);

  return { section: sec.name, boltDia: boltDiaOf(std.bolt), Mu_kNm:+Mu.toFixed(0), Vu_kN:+Vu.toFixed(0), Puf_kN:+Puf.toFixed(0), flange, web, steps };
}

// ─────────────────────────────── 기둥 (제7·8장) ───────────────────────────────
function designColumn(cond: DesignCondition, sec: HSection, forceDia?: number): DesignResult {
  const steps: CalcStep[] = [];
  const fy = Fy(cond.steel, sec.tf);
  const fu = FuSteel(cond.steel);
  const pGrade = cond.plateSteel ?? cond.steel;   // 이음판 강종(미지정=모재 동일)
  const pfy = Fy(pGrade, sec.tf), pfu = FuSteel(pGrade);
  const alpha = cond.strengthRatio;
  const std = forceDia ? { ...flangeStdFor(sec.B), bolt: boltNameOf(forceDia) } : flangeStdFor(sec.B);
  const bearing = cond.jointType === '지압';

  // 가) 플랜지 소요압축강도
  const Puf = alpha * PHI_COMP * sec.B * sec.tf * fy / 1e3;
  steps.push({ group:'가) 플랜지 소요압축강도', label:'플랜지 소요압축강도', formula:'Puf = α·φc·bf·tf·Fy', substitution:`${alpha}×0.9×${sec.B}×${sec.tf}×${fy}`, value:+Puf.toFixed(0), unit:'kN', ref:'7.2',
    note:'기둥은 세장비를 무시하고 항복(총단면 공칭압축강도)만 고려한다.' });

  const flange = designFlange(cond, sec, std, fy, fu, pfy, pfu, Puf, bearing, steps);

  // 웨브 이음 소요력 = α·φc·H·tw·Fy (총web). 부록 「전단력」 컬럼과 평균 3% 일치(얇은 web 정확).
  const Pauw = alpha * PHI_COMP * (sec.H * sec.tw) * fy / 1e3;
  steps.push({ group:'마) 웨브 이음 소요력', label:'웨브 이음 소요력', formula:'Vw = α·φc·H·tw·Fy', substitution:`${alpha}×0.9×${sec.H}×${sec.tw}×${fy}`, value:+Pauw.toFixed(0), unit:'kN', ref:'7.6',
    note:'웨브 이음부는 총웨브면적(H·tw)을 부담(필렛 제외). 두꺼운 web은 ±1등급 안전측.' });
  const web = designWeb(cond, sec, std.bolt, fy, fu, pfy, Pauw, bearing, steps);

  return { section: sec.name, boltDia: boltDiaOf(std.bolt), Mu_kNm:0, Vu_kN:+Pauw.toFixed(0), Puf_kN:+Puf.toFixed(0), flange, web, steps };
}

// ─────────────────────────────── 플랜지 이음 (공용) ───────────────────────────────
function designFlange(cond: DesignCondition, sec: HSection, std: ReturnType<typeof flangeStdFor>, fy: number, fu: number, pfy: number, pfu: number, Puf: number, bearing: boolean, steps: CalcStep[]): JointDesign {
  // W형강: 표준 공칭폭(최근접 반올림)이 실 플랜지폭보다 클 수 있어 외부 이음판이 플랜지를 넘어감(오버행).
  //   → W형강만 실 플랜지폭으로 캡. 단, 최외곽 볼트열 횡연단이 최소치(AISC J3.4M) 이상이 되도록 하한 보장.
  //     (협폭 단면은 표준게이지 자체가 넓어, 최소연단 확보를 위해 소폭 오버행 잔존 — 연단 우선)
  //   → H형강은 KS 공칭=실폭이라 불변(검증셋 보존).
  // ── 배치 결정: 표준 '엇모' 폭(공칭300)을 정렬 요청 시 대체배치로 전환 ──
  // 공칭300 표준은 4열 엇모(g2=50). 정렬하면 짝지은 열 간격 50<58.7(2⅔·M22)로 AISC J3.3 위반 →
  // 사용자 '엇모 제외' 또는 기둥 지압(밀착)일 때는 4열 대신 '2열 @ g1=180'(간격180·횡연단60) 대체배치 사용.
  const wantAligned = !!cond.noStagger || (cond.member === '기둥' && cond.jointType === '지압');
  const alt300 = std.layout === '엇모' && wantAligned;
  const m = alt300 ? 2 : std.m;                         // 유효 볼트 열수
  const g1 = alt300 ? 180 : std.g1;                     // 유효 게이지(2열: 열간격=180)
  const g2 = alt300 ? null : std.g2;
  const staggered = std.layout === '엇모' && !wantAligned;   // 엇모 표준은 정렬요청 없으면 엇모 유지

  // W형강: 표준 공칭폭이 실 플랜지폭보다 클 수 있어 외부 이음판 오버행 → W만 실폭으로 캡(횡연단 하한 보장).
  const dia0 = boltDiaOf(std.bolt), minE0 = MIN_EDGE[dia0] ?? 30;
  const outerColOff = m === 2 ? g1 / 2 : g1 / 2 + (g2 ?? 0);  // 최외곽 볼트열 중심 오프셋(유효 배치)
  const minOuterW = Math.ceil(2 * (outerColOff + minE0));     // 횡연단 최소 확보 하한
  const outerW = cond.profile === 'W'
    ? Math.min(std.outerW, Math.max(Math.floor(sec.B), minOuterW))
    : std.outerW;
  // 내부 이음판 폭 = 플랜지끝(B/2)~필렛선단 거리에서 권장 여유 3mm 확보 후 이하 10mm 단위 (필렛 간섭 회피)
  // 필렛선단: W형강은 AISC 공표 k1(mm) 사용(기하근사 tw/2+r는 공표 대비 평균 8.5mm 과소평가 → 침범).
  //           H형강은 KS 실측 필렛이 정확하여 tw/2+r 폴백 유지(검증셋 보존).
  const INNER_CLEAR = 3;   // 필렛선단 이격 권장 여유(mm)
  const filletToe = sec.k1 ?? (sec.tw / 2 + sec.r);
  const flatHalf = sec.B / 2 - filletToe - INNER_CLEAR;
  const innerW = std.innerW != null ? Math.max(10, Math.floor(flatHalf / 10) * 10) : null;
  const Aupf = (Puf * 1e3) / (PHI_FLEX * pfy);                   // 총단면 항복(이음판 강종)
  const equalT = innerW != null && !!cond.equalPlateT;          // 내·외부 이음판 동일 두께 옵션
  // 동일두께: 외·내 합성 순단면(외폭 + 2·내폭)이 Aupf 부담 → 단일 두께. 개별: 외 50% / 내 50%(2장).
  const tOuter0 = equalT ? Aupf / (outerW + 2 * (innerW ?? 0)) : (innerW ? 0.5 * Aupf / outerW : Aupf / outerW);
  const tInner0 = equalT ? tOuter0 : (innerW ? 0.5 * Aupf / (2 * innerW) : 0);
  const tOuter = roundUpThickness(Math.max(tOuter0, equalT ? 9 : 6), FLANGE_PLATE_T);
  const tInner = innerW ? roundUpThickness(Math.max(tInner0, 9), FLANGE_PLATE_T) : 0;
  steps.push(
    { group:'나) 플랜지 이음판 폭·두께', label:'이음판 소요단면적', formula:'Aupf = Puf/(φ·Fy·이음판)', substitution:`${Puf.toFixed(0)}×10³/(0.9×${pfy})`, value:+Aupf.toFixed(0), unit:'mm²', ref:'5.3.1' },
    { group:'나) 플랜지 이음판 폭·두께', label: equalT?'이음판 두께(내·외 동일)':'외부 이음판 두께', formula: equalT?'Aupf/(외폭+2·내폭)':(innerW?'0.5·Aupf/폭':'Aupf/폭'), substitution: equalT?`${Aupf.toFixed(0)}/(${outerW}+2×${innerW})=${tOuter0.toFixed(1)}`:`${innerW?'0.5×':''}${Aupf.toFixed(0)}/${outerW}=${tOuter0.toFixed(1)}`, value:tOuter, unit:'mm', ref:'5.3.3',
      note: equalT?'내·외부 이음판 동일 두께(합성 순단면 기준)':(innerW?'':'외부 이음판만 사용 → 외부 이음판이 전 축력을 부담한다.') },
    ...(innerW&&!equalT?[{ group:'나) 플랜지 이음판 폭·두께', label:'내부 이음판 두께', formula:'0.5·Aupf/(2·폭)', substitution:`0.5×${Aupf.toFixed(0)}/(2×${innerW})=${tInner0.toFixed(1)}`, value:tInner, unit:'mm', ref:'5.3.3' } as CalcStep]:[]),
  );

  const Ns = innerW ? 2 : 1;
  // C안: 정렬 피치를 직경별 최소간격(2.667d, 5mm 올림) 이상으로 — 표준(≤M22)은 60 불변, M24만 상향
  const alignP = Math.max(PITCH_ALIGNED, Math.ceil(2.667 * boltDiaOf(std.bolt) / 5) * 5);
  const pitchEff = staggered ? 90 : alignP;   // 중간부 순간격 기준(엇모=동일선상 2×45=90)
  const tPlate = innerW ? tOuter + tInner : tOuter;            // 이음판 두께 합(6.4.1-3)
  const cap = boltCap(cond, std.bolt, Ns, sec.tf, tPlate, fu, pfu, pitchEff); // 모재 tf(fu)·이음판(pfu)
  const n = requiredRows(Puf, m, cap, staggered);
  steps.push(
    bearing
      ? { group:'다) 플랜지 볼트 설계강도·배열', label:'설계지압강도 φRn₁/φRn₂ (연단/중간)', formula:'min(볼트전단, 1.2Lc·t·Fu, 2.4d·t·Fu)×0.75', substitution:`${cap.rn1.toFixed(0)} / ${cap.rn2.toFixed(0)}`, unit:'kN', ref:'6.4.1' }
      : { group:'다) 플랜지 볼트 설계강도·배열', label:`설계미끄럼강도 φRn (${Ns}면)`, formula:'φ·μ·hsc·To·Ns', value:+cap.rn1.toFixed(0), unit:'kN', ref:'5.4.1' },
    { group:'다) 플랜지 볼트 설계강도·배열', label:'요구 행수', formula: bearing?'m(φRn₁+(n−1)φRn₂) ≥ Puf':'n = Puf/(m·φRn)', value:n, unit:`행 (${staggered?'엇모 0.5올림':'올림'})`, ref:bearing?'6.4.2':'5.4.3' },
    { group:'다) 플랜지 볼트 설계강도·배열', label:'플랜지 볼트 배열', value:m, unit:`열 × ${n} 행 = ${m*n}개`, ref:'5.4' },
  );

  const gap = cond.gap ?? 5;
  const pitch = staggered ? PITCH_STAGGERED : alignP;
  const Lpf = staggered ? 2*((2*n-1)*pitch+2*40)+gap : 2*((n-1)*pitch+2*40)+gap;
  steps.push({ group:'라) 플랜지 이음판 길이', label:'이음판 길이', formula: staggered?`2[(2n−1)·45+80]+${gap}`:`2[(n−1)·${alignP}+80]+${gap}`, value:Lpf, unit:'mm', ref:'5.5.2' });

  return {
    bolt:{ m, n, count:m*n }, gauge:{ g1, g2: g2 ?? undefined },
    outerPlate:{ t:tOuter, w:outerW, L:Lpf },
    innerPlate: innerW ? { t:tInner, w:innerW, L:Lpf } : undefined,
    staggered, gap, pitch: pitchEff, edge: 40,   // 도면 배치용
  };
}

// ─────────────────────────────── 웨브 이음 (공용) ───────────────────────────────
function designWeb(cond: DesignCondition, sec: HSection, bolt: BoltName, fy: number, fu: number, pfy: number, soryeok: number, bearing: boolean, steps: CalcStep[]): JointDesign {
  const { H, tw, tf, r } = sec;
  const phiRnW = boltStrength(cond, bolt, 2, tw, fu);   // 지압: 모재 웨브(tw) 지배
  const Nreq = Math.max(2, ceil(soryeok / phiRnW));
  // 웨브 이음판이 웨브 필렛을 침범하지 않도록 춤 상한(플랫 웨브 높이 − 2·클리어런스).
  // H형강은 검증셋 유지 위해 제한 없음(진단상 0건). W형강만 필렛 클리어런스 강제.
  const FCL = 8;                                  // 필렛 클리어런스(mm)
  const isW = cond.profile === 'W';
  const chumCap = isW ? (H - 2 * (tf + r) - 2 * FCL) : Infinity;

  let mW: number, nW: number, Pc: number | null, stagger: boolean, chum: number;
  if (H <= 150) {
    mW = 1; nW = Nreq; Pc = null; stagger = H <= 125;
    chum = Math.round(Math.min(H <= 100 ? 60 : 80, chumCap));
  } else {
    stagger = H <= 210;
    const C = (stagger && isW) ? 2*(tf+r+40+FCL) : (stagger ? 2*(tf+r+40) : 2*(60+tf+r));
    mW = 1; nW = Nreq; Pc = 60; let found = false;
    for (let nn=1; nn<=8 && !found; nn++) {
      const mm = ceil(Nreq/nn);
      const feas = WEB_PITCH_OPTIONS.filter(p => (mm-1)*p + C <= H);
      if (feas.length) { mW=mm; nW=nn; Pc=Math.max(...feas); found=true; }
    }
    chum = Math.round(Math.min((mW-1)*(Pc ?? 60) + 80, chumCap));
  }
  if (mW === 1) Pc = null;   // 춤방향 단일볼트 → 피치 무의미(표·도면 혼동 방지)
  const dpw = chum;
  // KBC-09 [그림3.3·3.4]: l = 웨브첨판 상단 ~ 플랜지 내부 이음판 수직간격 = H/2 − tf − dpw/2.
  //   웨브 제1열 볼트~내첨판은 60mm 이상이어야 하며, 부재 춤이 작아 l<60(H<200)이면 렌치(체결공구)
  //   간섭 → 웨브볼트를 플랜지볼트 대비 절반피치(30mm) 바깥으로 엇갈림(첨판폭 +60로 외측 연단 40 유지).
  const lWeb = H / 2 - tf - dpw / 2;
  const webBoltStag = H < 200 && lWeb < 60;
  const webP = Math.max(60, Math.ceil(2.667 * boltDiaOf(bolt) / 5) * 5);   // C안: 웨브 가로피치
  const wpw = 2*((nW-1)*webP + 2*40) + (cond.gap ?? 5) + (webBoltStag ? 60 : 0);   // 엇갈림 시 +60(30mm 이동분, 연단 40 유지)
  // 보=전단(0.6Fy), 기둥=압축(Fy). 양면 이음판이 소요력의 절반씩 분담.
  const nomFactor = cond.member === '기둥' ? 1.0 : 0.6;
  const tpw = roundUpThickness(Math.max(0.5*(soryeok*1e3)/(0.9*nomFactor*pfy*dpw), 6), WEB_PLATE_T);   // 웨브 이음판 강종(pfy)
  steps.push(
    { group:'바) 웨브 볼트 · 이음판', label:`설계${bearing?'지압':'미끄럼'}강도 φRn (2면)`, value:+phiRnW.toFixed(0), unit:'kN', ref:bearing?'6.8':'5.7' },
    { group:'바) 웨브 볼트 · 이음판', label:'요구 볼트개수', formula:'⌈소요력/φRn⌉', substitution:`⌈${soryeok.toFixed(0)}/${phiRnW.toFixed(0)}⌉`, value:Nreq, unit:'개', ref:'5.8.1' },
    { group:'바) 웨브 볼트 · 이음판', label:'웨브 볼트 배열', value:mW, unit:`(춤)×${nW}(축), Pc=${Pc ?? '—'}${webBoltStag?' · 엇모(l<60)':''}`, ref:'5.8.2' },
    { group:'바) 웨브 볼트 · 이음판', label:'웨브 이음판 (두께×춤×너비)', value:tpw, unit:`× ${dpw} × ${wpw}`, ref:'5.9' },
  );
  if (webBoltStag) steps.push({ group:'바) 웨브 볼트 · 이음판', label:'웨브볼트 엇갈림([그림3.4])',
    formula:'l = H/2 − tf − dpw/2 < 60mm', substitution:`l=${Math.round(lWeb)} < 60 → 절반피치 30mm 엇갈림·첨판폭 +60`, ref:'그림3.4', note:'렌치 간섭 회피' });
  // webBoltStag: 웨브볼트를 플랜지볼트 대비 절반피치(30mm) 바깥으로 엇갈림([그림3.4]).
  //   → 이음판폭 +60(=2×30)이 이 이동분을 포함 → 도면(connParts·dxf·SVG)에서 실제 30mm 이동해 연단 40 유지.
  return { bolt:{ m:mW, n:nW, count:mW*nW }, Pc:Pc ?? undefined, webPlate:{ t:tpw, w:dpw, L:wpw }, staggered: webBoltStag, pitch: webP, edge: 40 };
}
