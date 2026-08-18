// ────────────────────────────────────────────────────────────────────────────
// AISC 360-16 엔진 공용 타입 (SI)
// ────────────────────────────────────────────────────────────────────────────

/** 검토 대상 부위 (계산서·도해 색인) */
export type Region = 'bolt' | 'outer' | 'inner' | 'web' | 'member';

/** 블록전단 파단경로 요소 컨텍스트 (AISIsplice Appendix C Path 명명용) */
export type BsRegion = 'outer' | 'inner' | 'member-flange' | 'web-plate' | 'member-web';

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
  group: string;      // 표시 그룹 "A. 볼트" / "B. 외부 이음판 PL-12×300"
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
  bsGeom?: BlockShearGeom; // 블록전단 실제 기하(도해용) — 있으면 파단선 실측 작도
  nsPaths?: NetPath[];     // 엇모 순단면 후보경로(있으면) — 인장파단 도해
  nsGeom?: NetSectionGeom; // 순단면 도해 기하
  note?: string;
}

/** 블록전단 실제 기하 — 상세계산서 파단선 도해가 실 볼트배치로 작도 */
export interface BlockShearGeom {
  cols: number[];    // 전단선 직각방향 볼트열 위치(mm, 판/부재 중심 기준)
  nrow: number;      // 전단선 방향 볼트수(열당)
  pitch: number;     // 전단선 방향 볼트피치(mm)
  edge: number;      // 자유단 연단거리(mm)
  halfWidth: number; // 판/부재 반폭(mm)
  dh: number;        // 볼트구멍 지름(mm)
  plates: number;    // 판수(외/부재=1, 내부·웨브 이음판=2)
  vertical?: boolean;  // 도해 방향: true=수직 전단(웨브 이음판 — Vu 수직)
  loadDir?: 'H' | 'V'; // 하중 방향(웨브 H블록=축방향 H / 기존 V블록=수직) — 도해 라벨용
  staggered?: boolean; // 엇모배치 — 파단선 지그재그 + s²/4g 표기
  gauge?: number;      // 인접 볼트열 게이지(mm) — 엇모 s²/4g·도해용
  nHi?: number;        // 외측열 행수(엇모, 3D/DXF 정합)
  nLo?: number;        // 내측열 행수(엇모)
}

/** 순단면 파단경로 후보 (B4.3b) — 엇모 인장파단 전수검토 */
export interface NetPath {
  key: string;        // 'k<홀수>' | 'gross'
  label: string;      // 표기용 라벨
  nHoles: number;     // 이 경로가 지나는 구멍수(폭방향)
  gain: number;       // Σs²/4g (엇모 대각 회복)
  netWidth: number;   // 순폭 (mm)
  area: number;       // 순단면적 (mm², 1매)
  lineIdx: number[];  // 이 경로가 지나는(공제) 게이지선의 cols 인덱스(도해용)
}

/** 순단면 도해 기하 — 엇모 인장파단(FP2·FI2) 후보경로 실측 작도 */
export interface NetSectionGeom {
  width: number;      // 그릴 판 폭(mm)
  lines: { y: number; off: number; rows: number }[]; // 게이지선(y=폭좌표[중심0], off=길이오프셋, rows=행수)
  edge: number;       // 자유단 연단거리(mm)
  pitch: number;      // 응력방향 피치(mm)
  dh: number;         // 볼트구멍 지름(mm)
  plates: number;     // 판수(외부=1, 내부=2) — 라벨용
}

/** 블록전단 면적 산출 내역 (계산서 Agv·Anv·Ant 전개용) */
export interface BsAreaCalc {
  t: number;          // 요소 두께(mm)
  dh: number;         // 구멍 지름(mm)
  shear: { L: number; rows: number }[];               // 전단면별 {길이 L, 볼트행수}
  tension: { width: number; holes: number; gain: number }[]; // 인장면별 {폭, 공제 구멍수, Σs²/4g}
}

/** 블록전단 한 케이스 결과 (AISIsplice Appendix C Path) */
export interface BlockCase {
  key: string;        // 내부 기하 판별자 'L1'|'U2a'|'U2b'|'B3'|'webV' (도해·표기 무관)
  label?: string;     // (구) 블록 유형 서술 — 표기는 path만 사용, 하위호환용
  path?: string;      // AISIsplice Appendix C 파단경로 표기 "Path 1|2a|2b|3…"(요소별)
  Ubs: number;        // 0.5 | 1.0
  Agv: number;        // 총전단면적 mm²
  Anv: number;        // 순전단면적 mm²
  Ant: number;        // 순인장면적 mm²
  Rn: number;         // 공칭강도 (N)
  phiRn: number;      // 설계강도 (N)
  Fu?: number;        // 요소 Fu (MPa) — 계산서 수식 전개용
  Fy?: number;        // 요소 Fy (MPa)
  plates?: number;    // φRn 곱수(외부·부재=1, 웨브=2)
  areaCalc?: BsAreaCalc;  // Agv·Anv·Ant 산출 내역(계산서 전개용)
  frac: number;       // 이 블록이 분리시키는 하중분담 = 블록내 볼트수/전체 볼트수
  dcr?: number;       // (frac·소요)/φRn — 케이스 판정
  gov?: boolean;      // 이 요소에서 지배(최대 DCR)
  viz?: {             // 파단선 도해(bsPatterns 단일 소스) — x=하중축, y=폭
    shear: { y: number; x0: number; x1: number }[];
    tension: [number, number][][];
    tear: [number, number][][];
  };
}

/** 소요력 세트 (demand.ts에서 산정, 단일 소스) */
export interface DemandSet {
  Pf: number;         // 플랜지 소요축력 (N)  = M/(d−tf) + P/2
  half: number;       // 판군 분담 Pf/2 (N)   (초기설계=이중전단 50:50)
  halfOuter: number;  // 외부 이음판 분담 (N) = Pf·(A외/(A외+A내)) — 판 총단면적 비례분배
  halfInner: number;  // 내부 이음판쌍 분담 (N) = Pf·(A내/(A외+A내))
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
