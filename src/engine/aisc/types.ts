// ────────────────────────────────────────────────────────────────────────────
// AISC 360-16 엔진 공용 타입 (SI)
// ────────────────────────────────────────────────────────────────────────────

/** 검토 대상 부위 (계산서·도해 색인) */
export type Region = 'bolt' | 'outer' | 'inner' | 'web' | 'member';

/**
 * 추적 가능한 계산 단계 (CalcStep).
 * 식 → 대입 → φ·공칭 → 판정을 모두 보존해 계산서/검증에 사용.
 */
export interface AiscStep {
  label: string;      // 항목명 (영문 서술 계산서용)
  formula?: string;   // 일반식  "φ·Fnv·Ab·Ns·n"
  subst?: string;     // 수치 대입  "0.75·450·380·2·6"
  value?: number;     // 중간 스칼라(면적·Fcr·계수 등)
  Rn?: number;        // 공칭강도 (kN 또는 kN·m)
  phi?: number;       // 적용 φ
  phiRn?: number;     // 설계강도 (kN 또는 kN·m)
  demand?: number;    // 소요 (kN 또는 kN·m)
  dcr?: number;       // 소요/설계
  ok?: boolean;
  unit?: string;      // 'mm²' | 'kN' | 'kN·m' | 'MPa' …
  ref?: string;       // 조항 "J3.6"
  note?: string;
}

/** 한 한계상태 검토 (여러 CalcStep 포함 가능) */
export interface AiscCheck {
  id: string;         // "FB1", "FI2", "WI1" …
  region: Region;
  group: string;      // 표시 그룹 "A. 볼트" / "B. 외첨판 PL-12×300"
  label: string;      // "볼트 전단(이중전단)"
  clause: string;     // "J3.6"
  phiRn?: number;     // 지배 설계강도 (kN / kN·m)
  demand?: number;    // 지배 소요
  dcr?: number;
  ok?: boolean;
  unit?: string;      // 'kN' | 'kN·m' | 'ratio'
  detail?: string;    // 한 줄 요약(식·치수)
  steps?: AiscStep[]; // 세부 추적 단계
  cases?: BlockCase[];// 블록전단 요소별 케이스(있으면)
  note?: string;
}

/** 블록전단 한 케이스 결과 (요소별 A/B/C/D) */
export interface BlockCase {
  label: string;      // "Case A(외연 L블록)"
  Ubs: number;        // 0.5 | 1.0
  Agv: number;        // 총전단면적 mm²
  Anv: number;        // 순전단면적 mm²
  Ant: number;        // 순인장면적 mm²
  Rn: number;         // 공칭강도 (N)
  phiRn: number;      // 설계강도 (N)
  frac: number;       // 이 블록이 분리시키는 하중분담 = 블록내 볼트수/전체 볼트수
  dcr?: number;       // (frac·소요)/φRn — 케이스 판정
  gov?: boolean;      // 이 요소에서 지배(최대 DCR)
}

/** 소요력 세트 (demand.ts에서 산정, 단일 소스) */
export interface DemandSet {
  Pf: number;         // 플랜지 소요축력 (N)  = M/(d−tf) + P/2
  half: number;       // 판군 분담 Pf/2 (N)   (이중전단 50:50)
  Mu: number;         // 부재 소요휨 (N·mm)
  Vu: number;         // 웨브 소요전단 (N)
  MuxWeb: number;     // 웨브 편심모멘트 Vu·e (N·mm)
  e: number;          // 웨브 볼트군 편심 (mm)
  capScale: number;   // 부재강도 캡핑 배율(1=무캡핑)
}

/** AISC 검토 전체 결과 */
export interface AiscResult {
  checks: AiscCheck[];
  demand: DemandSet;
  govId: string;      // 지배 검토 id
  govDcr: number;
  ok: boolean;
  db: number;         // 볼트 직경(mm)
}
