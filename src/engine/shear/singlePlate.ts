// ────────────────────────────────────────────────────────────────────────────
// 전단판(Shear Tab) 전단접합 설계 — AISC 360-16 15th Ed (SI)
//   보 웨브 양측에 전단판 2매를 볼트접합(2면전단, Ns=2 — 지지부에는 용접 가정. 본 모듈은
//   볼트·판·보 검토). 볼트군 자체는 여전히 편심(지지면~볼트군 offset a, 탄성벡터법 C계수) —
//   2면전단은 볼트/판의 "전단면·두께" 배수만 바꿀 뿐 지지면 offset에 따른 편심은 그대로 존재.
//   소요전단 V = α·φv·0.6·Fy·(H·tw)  (기존 splice 앱과 동일한 웨브전단 발현 기준)
//   PDF p19~20(Thornton Tomasetti Single Plate) 검토항목(원래 단전단 1매 기준)을 SI·전
//   부재로 이식 후 2면전단(양측판)으로 확장 — 볼트 전단·미끄럼 ×Ns(=2), 판 관련 전단적·
//   단면계수는 2매 합산 두께(tp2=2·tp) 기준(GS 웨브이음 aisc/web.ts와 동일 관례). 판 두께
//   연성(SP7)만 매(枚)당 tp 그대로 검토(볼트 연성은 개별 판 두께에 좌우).
//   자동설계: 판두께 tp = 연성상한(db/2+1.6) 이하 상용두께 고정 → 볼트행수 NR을
//             모든 한계상태 DCR≤1 될 때까지 증가(볼트 연성지배 확보).
// ────────────────────────────────────────────────────────────────────────────
import type { DesignCondition, HSection, BoltName, BoltDia } from '../types.ts';
import { Fy, Fu as FuSteel, BOLT_MAT } from '../materials.ts';
import { Ab, boltNameByDia, designSlipStrength_kN } from '../bolts.ts';
import { PHI, FNV_FACTOR, holeDia } from '../aisc/constants.ts';
import { standardLength, boltSetWeight } from '../bolt_spec.ts';
import { WEB_PITCH_OPTIONS } from '../standards.ts';
import type { AiscCheck, AiscStep } from '../aisc/types.ts';

const AVAIL_T = [6, 8, 9, 10, 12, 14, 16, 19, 22, 25, 28, 32];
// 볼트 수평·수직 피치(직경별 고정표, GS 웨브이음과 동일 관례) — M22 이하 60mm, M24 70mm, M27 75mm, M30 80mm.
const PITCH_BY_DIA: Record<number, number> = { 16: 60, 18: 60, 20: 60, 22: 60, 24: 70, 27: 75, 30: 80 };
const EDGE = 40;   // 이음판·부재측·상하 연단거리(고정, mm) — GS 웨브이음 EDGE_DIST와 동일 관례. 참조 CAD
                   // (docs/shear connection_detail_01.dxf) 실측 결과 상·하 연단거리도 40으로 확인.
const kN = (n: number) => +(n / 1e3).toFixed(1);
const kNm = (n: number) => +(n / 1e6).toFixed(1);

export interface ShearPlate { t: number; L: number; w: number; }   // t = 판 1매 두께(양측 2매, 2PL-t×L×w)
/** SC 서브타입 — 이번 phase는 라벨·설명 문구만 분기(볼트/판 계산식은 3타입 공통). */
export type ScSubtype = 'beam-beam' | 'beam-col-strong' | 'beam-col-weak';
export interface ShearResult {
  section: string;
  V_kN: number;
  boltName: BoltName;
  boltDia: number;
  NR: number;
  NC: number;
  Pc: number;           // 볼트 수직피치(≈3d, mm) — GS 웨브의 Pc와 동일 개념
  a: number;
  gap: number;          // 이음부 이격(mm, cond.gap) — a=EDGE(40)+gap 분해값, 3D/2D 갭 연장 표시용
  sh: number;           // 볼트 수평간격(NC=2일 때 열간 거리, mm) — 도면용
  Lev: number;          // 수직 연단거리(mm) — 도면용
  Leh: number;          // 수평 연단거리(플레이트 원단, mm) — 도면용
  eBolt: number;       // 지지면→최원단 볼트열 편심("e,bolt", 볼트군 C계수용)
  ePlate: number;       // 지지면→볼트군 도심 편심("e,plate", 판휨 M=V·e용)
  plate: ShearPlate;
  config: 'Conventional' | 'Extended';
  fitsWeb: boolean;    // 판 춤이 보 웨브 순높이 T 이내인가
  clearH: number;      // 보 웨브 순높이 T (mm)
  boltCount: number;   // 총 볼트 본수(NC×NR — 그립을 2매+웨브가 관통하므로 ×2 아님)
  boltGrip: number;    // 그립(2×tp+tw, mm)
  boltLen: number;     // 표준 제작길이(KS B 1010, 5mm 올림)
  boltSetKg: number;   // 세트 1개 중량(볼트+너트+와셔2매, kg)
  boltTotalKg: number; // 볼트 총중량(kg)
  subtype: ScSubtype;
  checks: AiscCheck[];
  govId: string;
  govDcr: number;
  ok: boolean;
}

function pickDia(H: number): BoltDia {
  if (H < 400) return 20;
  if (H < 600) return 22;
  return 24;
}

export function designSinglePlate(cond: DesignCondition, sec: HSection, subtype: ScSubtype = 'beam-beam'): ShearResult {
  const alpha = cond.strengthRatio;
  const mFy = Fy(cond.steel, sec.tw);
  const mFu = FuSteel(cond.steel);
  const pGrade = cond.plateSteel ?? cond.steel;
  const pFy = Fy(pGrade, 20), pFu = FuSteel(pGrade);

  const V = alpha * PHI.SH * 0.6 * mFy * (sec.H * sec.tw);   // 소요전단 (N)

  const d = pickDia(sec.H);
  const name = boltNameByDia[d];
  const ab = Ab[name];
  const thread = cond.threadCond ?? 'N';
  const Fub = BOLT_MAT[cond.bolt].Fu;
  const Fnv = FNV_FACTOR[thread] * Fub;
  const dh = holeDia(d);

  const sBase = PITCH_BY_DIA[d] ?? 60;                   // 볼트 수직피치 기본값(직경별 고정표)
  const sh = PITCH_BY_DIA[d] ?? 60;                      // 볼트 수평간격(2열, 직경별 고정표)
  const Lev = EDGE;                                      // 수직 연단(상·하 볼트~판 끝, 고정 40)
  const Leh = EDGE;                                      // 수평 연단(플레이트 원단, 고정 40)
  const gap = cond.gap ?? 5;                             // 이음부 이격(mm) — 설계조건 공용 갭(기본 5)
  const a = EDGE + gap;                                  // 편심(지지면~근접 볼트열) = 연단거리(40, 고정) + 갭

  // 판두께: 연성상한(db/2+1.6mm) 이하 상용두께 중 최대
  const tDuct = d / 2 + 1.6;
  const tp = [...AVAIL_T].reverse().find(t => t <= tDuct) ?? AVAIL_T[0];

  const Ns = 2;                                          // 전단면 수(양측판 2면전단)
  const phiRnBolt1 = PHI.V * Fnv * ab * Ns;             // 볼트 1개 설계전단(2면전단, N)
  const rnSlip1 = cond.jointType === '마찰' ? designSlipStrength_kN(cond.bolt, name, Ns) * 1e3 : 0;

  // 편심 볼트군 유효계수 C (탄성벡터법, 단열/2열) = V / R_max(임계볼트)
  const eccC = (NR: number, NC: number, s: number): number => {
    const n = NR * NC;
    if (n <= 1) return 1;
    const ymax = s * (NR - 1) / 2;
    const xhalf = NC === 2 ? sh / 2 : 0;                 // 개별 볼트 극좌표(도심~열, J·Sx2용)
    const e = a + (NC === 2 ? sh : 0);                   // 편심 "e,bolt"(지지면~최원단 볼트열) — 원자료(Thornton
                                                          // Tomasetti Single Plate Capacity, PDF p.20) 대조 확인:
                                                          // 볼트군 C계수는 도심(a+sh/2)이 아닌 최원단열 거리를 사용.
    const Sy2 = NC * s * s * (NR * (NR * NR - 1)) / 12;
    const Sx2 = NC === 2 ? 2 * NR * xhalf * xhalf : 0;
    const J = Sx2 + Sy2;
    const Rx = e * ymax / J;                             // 단위 V당 임계볼트 힘 성분
    const Ry = 1 / n + e * xhalf / J;
    return 1 / Math.sqrt(Rx * Rx + Ry * Ry);
  };

  // 주어진 (NR,NC,s)로 전 한계상태 검토 조립 — s(세로피치)는 강도 재확인을 위해 인자로 받는다.
  const build = (NR: number, NC: number, s: number): { checks: AiscCheck[]; govId: string; govDcr: number } => {
    const n = NR * NC;
    const Lp = (NR - 1) * s + 2 * Lev;
    const C = eccC(NR, NC, s);
    const eCen = a + (NC === 2 ? sh / 2 : 0);
    const Mecc = V * eCen;
    const checks: AiscCheck[] = [];
    const S = (label: string, formula: string, subst: string, v: number, unit: string, ref?: string): AiscStep =>
      ({ label, formula, subst, phiRn: v, unit, ref });
    const push = (c: Omit<AiscCheck, 'dcr' | 'ok'> & { phiRn: number; demand: number }) => {
      const dcr = c.phiRn > 0 ? +(c.demand / c.phiRn).toFixed(3) : 99;
      checks.push({ ...c, dcr, ok: dcr <= 1 });
    };

    // 1. 볼트 전단(편심, 2면전단) J3.6
    push({
      id: 'SB1', region: 'bolt', group: 'A. 볼트', label: '볼트 전단(편심 볼트군·2면전단)', clause: 'J3.6',
      phiRn: kN(phiRnBolt1 * C), demand: kN(V), unit: 'kN',
      detail: `φrₙ=0.75·${Fnv.toFixed(0)}·${ab}·${Ns}=${kN(phiRnBolt1)} kN/EA · ${NC}열×${NR}행=${n}본 · 편심계수 C=${C.toFixed(2)}(유효 ${C.toFixed(1)}본)`,
      steps: [
        S('공칭전단응력 Fnv', thread === 'X' ? '0.563·Fu(볼트)' : '0.450·Fu(볼트)', `${FNV_FACTOR[thread]}·${Fub}`, +Fnv.toFixed(0), 'MPa', 'J3.6'),
        S('볼트 1개 φrₙ(2면전단)', 'φ·Fnv·Ab·Ns', `0.75·${Fnv.toFixed(0)}·${ab}·${Ns}`, kN(phiRnBolt1), 'kN', 'J3.6'),
        S('편심 볼트군 φRn', 'φrₙ·C', `${kN(phiRnBolt1)}·${C.toFixed(2)}`, kN(phiRnBolt1 * C), 'kN'),
      ],
    });
    // 2. 볼트 미끄럼 J3.8 (마찰만, 2면)
    if (cond.jointType === '마찰') {
      push({
        id: 'SB2', region: 'bolt', group: 'A. 볼트', label: '볼트 미끄럼(마찰접합·2면)', clause: 'J3.8',
        phiRn: kN(rnSlip1 * C), demand: kN(V), unit: 'kN',
        detail: `φRn=${kN(rnSlip1)} kN/EA(2면) · 편심계수 C=${C.toFixed(2)}`,
        steps: [
          S('볼트 1개 설계미끄럼강도(2면)', 'φ·μ·Du·hf·Tb·ns', `KS B 1010 ${cond.bolt} M${d}`, kN(rnSlip1), 'kN', 'J3.8'),
          S('편심 볼트군 φRn', 'φrₙ·C', `${kN(rnSlip1)}·${C.toFixed(2)}`, kN(rnSlip1 * C), 'kN'),
        ],
      });
    }
    // 3. 지압·찢김 — 전단판 J3.10 (양측판 2매 합산두께 tp2 기준 — GS 웨브이음 관례와 동일)
    const tp2 = 2 * tp;
    const bearMin = (t: number, Fu: number): number => {
      const brg = PHI.V * 2.4 * d * t * Fu;
      const tearEdge = PHI.V * 1.2 * (Lev - dh / 2) * t * Fu;
      const tearInt = PHI.V * 1.2 * (s - dh) * t * Fu;
      const edge = Math.min(brg, tearEdge), intr = Math.min(brg, tearInt);
      return NC * (edge + (NR - 1) * intr);             // 전 볼트 지압합(수직 직접전단, NC열)
    };
    push({
      id: 'SR1', region: 'web', group: 'B. 지압·찢김', label: '지압·찢김 — 전단판(2매)', clause: 'J3.10',
      phiRn: kN(bearMin(tp2, pFu)), demand: kN(V), unit: 'kN',
      detail: `Σ min(φ2.4dtFu, φ1.2Lc·tFu) · t=2×${tp}=${tp2}, Lc,e=${(Lev - dh / 2).toFixed(1)}, Lc,p=${s - dh}`,
      steps: [
        S('지압 상한(볼트 1개)', 'φ·2.4·d·t·Fu', `0.75·2.4·${d}·${tp2}·${pFu}`, kN(PHI.V * 2.4 * d * tp2 * pFu), 'kN', 'J3.10'),
        S('연단볼트 찢김', 'φ·1.2·(Lev−dh/2)·t·Fu', `0.75·1.2·${(Lev - dh / 2).toFixed(1)}·${tp2}·${pFu}`, kN(PHI.V * 1.2 * (Lev - dh / 2) * tp2 * pFu), 'kN', 'J3.10'),
        S('내부볼트 찢김', 'φ·1.2·(s−dh)·t·Fu', `0.75·1.2·${s - dh}·${tp2}·${pFu}`, kN(PHI.V * 1.2 * (s - dh) * tp2 * pFu), 'kN', 'J3.10'),
        S('합계 φRn', `${NC}열×[연단 1 + 내부 ${NR - 1}]×min(지압,찢김)`, `${NC}·(edge+${NR - 1}·intr)`, kN(bearMin(tp2, pFu)), 'kN'),
      ],
    });
    // 4. 지압·찢김 — 보 웨브 J3.10
    push({
      id: 'SR2', region: 'member', group: 'B. 지압·찢김', label: '지압·찢김 — 보 웨브', clause: 'J3.10',
      phiRn: kN(bearMin(sec.tw, mFu)), demand: kN(V), unit: 'kN',
      detail: `보 웨브 tw=${sec.tw} 기준 지압·찢김`,
      steps: [
        S('지압 상한(볼트 1개)', 'φ·2.4·d·tw·Fu', `0.75·2.4·${d}·${sec.tw}·${mFu}`, kN(PHI.V * 2.4 * d * sec.tw * mFu), 'kN', 'J3.10'),
        S('합계 φRn(SR1과 동일 산식, t=tw)', `${NC}열×[연단 1 + 내부 ${NR - 1}]×min(지압,찢김)`, `tw=${sec.tw}`, kN(bearMin(sec.tw, mFu)), 'kN'),
      ],
    });
    // 4b·4c. 지압·찢김 — 수평방향(J3.10, 원자료 PDF p.20 "Horizontal Direction" 대응).
    //   NC≤2열이라 열간 사이 낀 볼트가 없어(원자료 Spacing Bolt tearout=0) 전 볼트가 연단(Leh) 찢김 대상.
    //   판은 근접열(지지측 Leh)·원단열(반대측 Leh, 폭 산식상 대칭) 모두, 보 웨브는 미접합(uncoped) 전제라
    //   연속 부재 특성상 수평 자유단이 없음 — 판측만 지배, 보웨브측은 참고용으로 함께 산출.
    const bearMinHoriz = (t: number, Fu: number): number => {
      const brg = PHI.V * 2.4 * d * t * Fu;
      const tearEdge = PHI.V * 1.2 * (Leh - dh / 2) * t * Fu;
      const edge = Math.min(brg, tearEdge);
      return NC * NR * edge;
    };
    push({
      id: 'SR3', region: 'web', group: 'B. 지압·찢김', label: '지압·찢김(수평) — 전단판(2매)', clause: 'J3.10',
      phiRn: kN(bearMinHoriz(tp2, pFu)), demand: kN(V), unit: 'kN',
      detail: `NC×NR×min(φ2.4dtFu, φ1.2·(Leh−dh/2)·tFu) · t=2×${tp}=${tp2}, Leh=${Leh}`,
      steps: [
        S('연단볼트 찢김(수평)', 'φ·1.2·(Leh−dh/2)·t·Fu', `0.75·1.2·${(Leh - dh / 2).toFixed(1)}·${tp2}·${pFu}`, kN(PHI.V * 1.2 * (Leh - dh / 2) * tp2 * pFu), 'kN', 'J3.10'),
        S('합계 φRn', 'NC×NR×min(지압,찢김)', `${NC}·${NR}·edge`, kN(bearMinHoriz(tp2, pFu)), 'kN'),
      ],
    });
    push({
      id: 'SR4', region: 'member', group: 'B. 지압·찢김', label: '지압·찢김(수평) — 보 웨브', clause: 'J3.10',
      phiRn: kN(bearMinHoriz(sec.tw, mFu)), demand: kN(V), unit: 'kN',
      detail: `보 웨브 tw=${sec.tw} 기준(무코프 전제 — 실질 미지배, 참고용)`,
      steps: [
        S('합계 φRn(SR3과 동일 산식, t=tw)', 'NC×NR×min(지압,찢김)', `tw=${sec.tw}`, kN(bearMinHoriz(sec.tw, mFu)), 'kN'),
      ],
    });
    // 5. 판 전단항복 J4.3 (2매 합산두께 tp2)
    const Agv = tp2 * Lp;
    push({
      id: 'SP1', region: 'web', group: 'C. 전단판', label: '판 전단항복(2매)', clause: 'J4.3',
      phiRn: kN(PHI.SH * 0.6 * pFy * Agv), demand: kN(V), unit: 'kN',
      detail: `φ·0.6·Fy·Ag = 1.0·0.6·${pFy}·${Agv.toFixed(0)} (Ag=2×${tp}×${Lp})`,
      steps: [
        S('총전단면적(2매) Ag', '2·tp·Lp', `2·${tp}·${Lp}`, +Agv.toFixed(0), 'mm²'),
        S('설계전단항복 φVn', 'φv·0.6·Fy·Ag', `1.0·0.6·${pFy}·${Agv.toFixed(0)}`, kN(PHI.SH * 0.6 * pFy * Agv), 'kN', 'J4.3'),
      ],
    });
    // 6. 판 전단파단 J4.4 (2매)
    const Anv = tp2 * (Lp - NR * dh);
    const phiVnRup = PHI.R * 0.6 * pFu * Anv;            // SP8(파단 상호작용)에서 재사용
    push({
      id: 'SP2', region: 'web', group: 'C. 전단판', label: '판 전단파단(2매)', clause: 'J4.4',
      phiRn: kN(phiVnRup), demand: kN(V), unit: 'kN',
      detail: `φ·0.6·Fu·Anv = 0.75·0.6·${pFu}·${Anv.toFixed(0)} (Anv=2×${tp}×(${Lp}−${NR}·${dh}))`,
      steps: [
        S('순전단면적(2매) Anv', '2·tp·(Lp−NR·dh)', `2·${tp}·(${Lp}−${NR}·${dh})`, +Anv.toFixed(0), 'mm²', 'B4.3b'),
        S('설계전단파단 φVn', 'φ·0.6·Fu·Anv', `0.75·0.6·${pFu}·${Anv.toFixed(0)}`, kN(phiVnRup), 'kN', 'J4.4'),
      ],
    });
    // 7. 판 휨항복(편심) F11 (2매)
    const Zpl = tp2 * Lp * Lp / 4;
    const phiMy = PHI.F * pFy * Zpl;
    push({
      id: 'SP3', region: 'web', group: 'C. 전단판', label: '판 휨항복(편심·2매)', clause: 'F11',
      phiRn: kNm(phiMy), demand: kNm(Mecc), unit: 'kN·m',
      detail: `φ·Fy·Z = 0.9·${pFy}·${Zpl.toFixed(0)} · M=V·a=${kN(V)}·${a}mm (Z=2×${tp}×${Lp}²/4)`,
      steps: [
        S('편심모멘트 Mecc', 'V·e,plate', `${kN(V)}·${eCen.toFixed(0)}`, kNm(Mecc), 'kN·m'),
        S('소성단면계수(2매) Z', '2·tp·Lp²/4', `2·${tp}·${Lp}²/4`, +Zpl.toFixed(0), 'mm³'),
        S('설계휨항복 φMn', 'φ·Fy·Z', `0.9·${pFy}·${Zpl.toFixed(0)}`, kNm(phiMy), 'kN·m', 'F11'),
      ],
    });
    // 8. 판 휨파단(순단면) J4.2 (2매)
    const Znet = Math.max(0, Zpl - tp2 * dh * sumRowDist(NR, s));
    const phiMnRup = PHI.R * pFu * Znet;                 // SP8(파단 상호작용)에서 재사용
    push({
      id: 'SP4', region: 'web', group: 'C. 전단판', label: '판 휨파단(순단면·2매)', clause: 'J4.2',
      phiRn: kNm(phiMnRup), demand: kNm(Mecc), unit: 'kN·m',
      detail: `φ·Fu·Znet = 0.75·${pFu}·${Znet.toFixed(0)}`,
      steps: [
        S('순단면계수(2매) Znet', 'Z − 2·tp·dh·Σ|yi|', `${Zpl.toFixed(0)} − 2·${tp}·${dh}·${sumRowDist(NR, s).toFixed(0)}`, +Znet.toFixed(0), 'mm³', 'B4.3b'),
        S('설계휨파단 φMn', 'φ·Fu·Znet', `0.75·${pFu}·${Znet.toFixed(0)}`, kNm(phiMnRup), 'kN·m', 'J4.2'),
      ],
    });
    // 9. 판 전단+휨 항복 상호작용 (Manual Eq 10-5, 원자료 "Yielding Interaction"에 대응 —
    //    SC는 TF=0·My=0이라 4항[전단·축력·강축휨·약축휨]이 전단+강축휨 2항으로 축소)
    const shY = PHI.SH * 0.6 * pFy * Agv;
    const ia = Math.sqrt((V / shY) ** 2 + (Mecc / phiMy) ** 2);
    push({
      id: 'SP5', region: 'web', group: 'C. 전단판', label: '판 전단+휨 항복 상호작용', clause: 'H1.1/10-5',
      phiRn: 1, demand: +ia.toFixed(3), unit: 'ratio',
      detail: `√[(V/φVn)²+(M/φMn)²] = √[(${kN(V)}/${kN(shY)})²+(${kNm(Mecc)}/${kNm(phiMy)})²]`,
      steps: [
        S('전단항 (V/φVn)', 'V / (φv·0.6·Fy·Ag)', `${kN(V)}/${kN(shY)}`, +(V / shY).toFixed(3), '', 'H1.1'),
        S('휨항 (M/φMn)', 'Mecc / (φ·Fy·Z)', `${kNm(Mecc)}/${kNm(phiMy)}`, +(Mecc / phiMy).toFixed(3), '', 'H1.1'),
        S('이용률', '√[(V/φVn)²+(M/φMn)²]', '', +ia.toFixed(3), 'ratio'),
      ],
    });
    // 9b. 판 전단+휨 파단 상호작용 (원자료 "Rupture Interaction"에 대응 — 기존 코드에 누락돼 있던 항목)
    const iaR = Math.sqrt((V / phiVnRup) ** 2 + (Mecc / phiMnRup) ** 2);
    push({
      id: 'SP8', region: 'web', group: 'C. 전단판', label: '판 전단+휨 파단 상호작용', clause: 'H1.1/10-5',
      phiRn: 1, demand: +iaR.toFixed(3), unit: 'ratio',
      detail: `√[(V/φVn,파단)²+(M/φMn,파단)²] = √[(${kN(V)}/${kN(phiVnRup)})²+(${kNm(Mecc)}/${kNm(phiMnRup)})²]`,
      steps: [
        S('전단항 (V/φVn,파단)', 'V / (φ·0.6·Fu·Anv)', `${kN(V)}/${kN(phiVnRup)}`, +(V / phiVnRup).toFixed(3), '', 'H1.1'),
        S('휨항 (M/φMn,파단)', 'Mecc / (φ·Fu·Znet)', `${kNm(Mecc)}/${kNm(phiMnRup)}`, +(Mecc / phiMnRup).toFixed(3), '', 'H1.1'),
        S('이용률', '√[(V/φVn,파단)²+(M/φMn,파단)²]', '', +iaR.toFixed(3), 'ratio'),
      ],
    });
    // 10. 판 블록전단 J4.5 — 원자료(PDF p.20 Block Shear Case A) 대조 확인: 지배 경로는 단일 볼트열
    //   L형 블록(전단면 1개, Ubs=0.5, 비균일 인장 — 전형적 shear-tab 블록전단 형태)이며,
    //   기존 코드의 NC열 U형(Ubs=1.0)만으로는 이 경로를 놓친다. AISC J4.5는 전 파단경로 중
    //   최솟값을 지배로 하므로, NC=2일 때 L형·U형을 모두 계산해 governing(최소 φRn)을 채택한다.
    const Lsh = (NR - 1) * s + Lev;
    // L형(단일 근접열, Ubs=0.5): 전단면=근접열, 인장면=근접열→지지측 자유단(폭 a) — 2매(tp2) 기준
    const AgvL = tp2 * Lsh, AnvL = tp2 * (Lsh - (NR - 0.5) * dh);
    const AntL = tp2 * Math.max(0, a - 0.5 * dh);
    const bsL = Math.min(0.6 * pFu * AnvL, 0.6 * pFy * AgvL) + 0.5 * pFu * AntL;
    let phiBs = PHI.R * bsL;
    let bsDetail = `L형(단일열,Ubs=0.5,지배,2매): φ[min(0.6Fu·Anv,0.6Fy·Agv)+0.5Fu·Ant], Agv=2×${tp}×${Lsh.toFixed(0)}, Ant폭=${a}`;
    let govShape = 'L', govAgv = AgvL, govAnv = AnvL, govAnt = AntL, govUbs = 0.5;
    if (NC === 2) {
      // U형(2열, Ubs=1.0): 전단면=양열, 인장면=열간+양측 연단 전폭 — 2매(tp2) 기준
      const AgvU = 2 * tp2 * Lsh, AnvU = 2 * tp2 * (Lsh - (NR - 0.5) * dh);
      const AntU = tp2 * ((NC - 1) * sh + 2 * Leh - dh);
      const bsU = Math.min(0.6 * pFu * AnvU, 0.6 * pFy * AgvU) + 1.0 * pFu * AntU;
      if (PHI.R * bsU < phiBs) {
        phiBs = PHI.R * bsU; bsDetail = `U형(2열,Ubs=1.0,지배,2매): φ[min(0.6Fu·Anv,0.6Fy·Agv)+1.0Fu·Ant]`;
        govShape = 'U'; govAgv = AgvU; govAnv = AnvU; govAnt = AntU; govUbs = 1.0;
      } else bsDetail += ` (U형 φRn=${kN(PHI.R * bsU)}kN보다 지배적)`;
    }
    push({
      id: 'SP6', region: 'web', group: 'C. 전단판', label: '판 블록전단(2매)', clause: 'J4.5',
      phiRn: kN(phiBs), demand: kN(V), unit: 'kN',
      detail: bsDetail,
      steps: [
        S('지배 파단경로', govShape === 'L' ? '단일 근접열(지지측 자유단)' : '2열(열간+양측 연단)', `${govShape}형`, govUbs, 'Ubs'),
        S('총전단면적 Agv', govShape === 'L' ? '2·tp·Lsh' : '2×(2·tp·Lsh)', `${govAgv.toFixed(0)}`, +govAgv.toFixed(0), 'mm²'),
        S('순전단면적 Anv', 'Agv 기준 − (NR−0.5)·dh 공제', `${govAnv.toFixed(0)}`, +govAnv.toFixed(0), 'mm²', 'B4.3b'),
        S('순인장면적 Ant', govShape === 'L' ? '2·tp·(a−0.5dh)' : '2·tp·((NC−1)sh+2Leh−dh)', `${govAnt.toFixed(0)}`, +govAnt.toFixed(0), 'mm²'),
        S('설계블록전단 φRn', 'φ·[min(0.6FuAnv,0.6FyAgv)+Ubs·Fu·Ant]', `0.75·[...]`, kN(phiBs), 'kN', 'J4.5'),
      ],
    });
    // 11. 판 두께 연성 (Manual pg 10-89) — 매(枚)당 두께로 검토(볼트 연성은 개별 판 두께에 좌우)
    push({
      id: 'SP7', region: 'web', group: 'C. 전단판', label: '판 두께 연성(매당)', clause: 'Manual 10-89',
      phiRn: +tDuct.toFixed(1), demand: tp, unit: 'mm',
      detail: `t_max = db/2+1.6 = ${tDuct.toFixed(1)} mm ≥ tp=${tp}(매당) (볼트 연성지배 확보)`,
      steps: [
        S('연성상한 t_max', 'db/2 + 1.6', `${d}/2 + 1.6`, +tDuct.toFixed(1), 'mm', 'Manual 10-89'),
        S('채택 판두께(매당) tp', '상용두께 중 t_max 이하 최대', `AVAIL_T ≤ ${tDuct.toFixed(1)}`, tp, 'mm'),
      ],
    });
    // 12. 보 웨브 전단항복 G2.1
    push({
      id: 'SM1', region: 'member', group: 'D. 보 웨브', label: '보 웨브 전단항복', clause: 'G2.1',
      phiRn: kN(PHI.SH * 0.6 * mFy * sec.H * sec.tw), demand: kN(V), unit: 'kN',
      detail: `φ·0.6·Fy·(H·tw) = 1.0·0.6·${mFy}·${(sec.H * sec.tw).toFixed(0)}`,
      steps: [
        S('총전단면적 Aw', 'H·tw', `${sec.H}·${sec.tw}`, +(sec.H * sec.tw).toFixed(0), 'mm²'),
        S('설계전단항복 φVn', 'φv·0.6·Fy·Aw', `1.0·0.6·${mFy}·${(sec.H * sec.tw).toFixed(0)}`, kN(PHI.SH * 0.6 * mFy * sec.H * sec.tw), 'kN', 'G2.1'),
      ],
    });

    let govId = '', govDcr = 0;
    for (const c of checks) if ((c.dcr ?? 0) > govDcr) { govDcr = c.dcr ?? 0; govId = c.id; }
    return { checks, govId, govDcr };
  };

  // 자동설계: NC=1(단열) 최소 NR 탐색(강도 기준) → 강도 미달 시 NC=2(2열)로 확장(기존 로직).
  // 여기에 더해: 강도는 만족하지만 그 행수의 판 길이가 웨브 순높이(T)를 넘는 경우도 NC=2로
  // 자동 전환(1열 행수를 2열로 분산 → 같은 강도를 더 짧은 판으로 확보). 실무 표준 상세도의
  // WG1(1열)↔WG3(2열) 분류 역산 결과와 동일한 판정 기준. 단, T 자체가 최소 2행조차 못 담을
  // 만큼 협소한 단면(fitsAt(2)=false)은 2열로도 해결되지 않으므로(판 길이는 NR에만 좌우, NC
  // 무관) 대상에서 제외 — 종전과 같이 NC=1·fitsWeb=false(NG)로 남겨 별도 소형 상세 필요를 표시.
  const clearH = sec.H - 2 * sec.tf - 2 * sec.r;                   // 웨브 순높이 T(실치수)
  // 이음판 최대 높이 = 웨브 순높이를 10mm 단위로 내림(첫째자리 절사) — 제작용 정형 치수.
  // 볼트군(상하 연단거리 Lev 포함)이 이 최대높이 안에서 위·아래 각 3mm 이상 여장을 남겨야
  // 채택 가능 → 여장 확보 시 판 높이는 볼트 소요치가 아닌 이 정형 최대높이로 확정.
  const plateHmax = Math.floor(clearH / 10) * 10;
  const EDGE_MARGIN = 3;                                            // 상·하 각 여장(mm)
  const MAXR = 12;
  const fitsAt = (nr: number, sVal: number) => (nr - 1) * sVal + 2 * Lev <= plateHmax - 2 * EDGE_MARGIN;
  const solve = (NC: number) => {
    let nr = 2, r = build(nr, NC, sBase);
    for (nr = 2; nr <= MAXR; nr++) { r = build(nr, NC, sBase); if (r.govDcr <= 1) return { nr, r, ok: true }; }
    return { nr: MAXR, r, ok: false };
  };
  let NC = 1;
  let sol = solve(1);
  if (!sol.ok) {
    NC = 2; sol = solve(2);
  } else if (!fitsAt(sol.nr, sBase) && fitsAt(2, sBase)) {
    const sol2 = solve(2);
    if (sol2.ok) { NC = 2; sol = sol2; }
  }
  let NR = sol.nr, res = sol.r, s = sBase;

  // 최소 이음판 높이 확보(Lp ≥ 0.6·H, 부재 춤 기준) — 볼트 수량(NR)이 강도상으로는 충분하지만
  // 부재 춤에 비해 이음판이 짧은 경우, 볼트를 더 추가하기 전에 먼저 같은 NR로 WEB_PITCH_OPTIONS
  // (=[60,90,120], GS 웨브이음과 동일 표)의 더 넓은 피치로 스프레드해 채운다(경제적 — 볼트 추가보다
  // 저렴). 스프레드는 편심(C계수)·판휨을 악화시킬 수 있어 매 후보마다 build()로 강도(govDcr≤1)를
  // 재확인한 값만 채택. 가장 넓은 옵션(120)까지 확장해도 0.6H·강도를 동시에 못 채우면 그때 NR을
  // 1행씩 늘려 재시도(판 높이 상한 도달 시 중단 → 기존과 동일하게 fitsWeb=false(NG)로 노출).
  const minLp = 0.6 * sec.H;
  const pitchDesc = [...WEB_PITCH_OPTIONS].filter(p => p >= sBase).sort((x, y) => y - x);
  for (let guard = 0; guard < MAXR; guard++) {
    if ((NR - 1) * s + 2 * Lev >= minLp) break;                     // 이미 0.6H 충족
    let spread: { p: number; r: typeof res } | null = null;
    for (const p of pitchDesc) {
      if (!fitsAt(NR, p)) continue;                                 // 판 높이 상한 초과
      const trial = build(NR, NC, p);
      if (trial.govDcr > 1) continue;                               // 강도 미달 — 이 피치 채택 불가
      spread = { p, r: trial };
      break;                                                        // 넓은 값부터라 첫 적합값 채택
    }
    if (spread) { s = spread.p; res = spread.r; }
    if ((NR - 1) * s + 2 * Lev >= minLp) break;                     // 스프레드만으로 확보 성공
    if (NR >= MAXR || !fitsAt(NR + 1, sBase)) break;                // 더 늘리면 판 높이 상한 초과 — 타협
    NR++;
    s = sBase; res = build(NR, NC, s);                              // 새 행수로 재검토(피치는 기본값부터 재탐색)
  }

  const Lp = (NR - 1) * s + 2 * Lev;
  const fitsWeb = fitsAt(NR, s);
  const plateL = fitsWeb ? plateHmax : Lp;    // 여장 확보 시 정형 최대높이, 미확보(NG) 시 소요치 그대로 표시
  // Conventional/Extended 판정 — 원자료(PDF p.20) "a,max"=3.5in(88.9mm)와 "e,bolt"(최원단열 편심) 비교.
  const eBolt = a + (NC === 2 ? sh : 0);
  const ePlate = a + (NC === 2 ? sh / 2 : 0);
  const A_MAX = 88.9; // mm (3.5in, AISC Manual Part 10 conventional configuration 상한)

  // 고력볼트 물량(KS B 1010) — 그립=웨브+양측판 2매(2면전단), 본수=NC×NR(볼트 1본이 판 2매+웨브를 관통).
  const boltCount = NC * NR;
  const boltGrip = sec.tw + 2 * tp;
  const boltLen = standardLength(boltGrip, name);
  const boltSetKg = boltSetWeight(name, boltLen);
  const boltTotalKg = +(boltSetKg * boltCount).toFixed(2);

  return {
    section: sec.name, V_kN: kN(V), boltName: name, boltDia: d, NR, NC, Pc: s, a, gap, sh, Lev, Leh,
    eBolt: +eBolt.toFixed(0), ePlate: +ePlate.toFixed(0),
    plate: { t: tp, L: plateL, w: a + (NC - 1) * sh + Leh },
    config: eBolt > A_MAX ? 'Extended' : 'Conventional',
    fitsWeb, clearH: +clearH.toFixed(0),
    boltCount, boltGrip, boltLen, boltSetKg: +boltSetKg.toFixed(3), boltTotalKg, subtype,
    checks: res.checks, govId: res.govId, govDcr: +res.govDcr.toFixed(2),
    ok: res.govDcr <= 1 && fitsWeb,
  };
}

/** 단열 볼트군 소성 순단면 근사용 Σ|y_i| */
function sumRowDist(NR: number, s: number): number {
  let sum = 0;
  for (let i = 0; i < NR; i++) sum += Math.abs(s * (i - (NR - 1) / 2));
  return sum;
}
