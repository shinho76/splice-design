// 고력볼트 표준접합 설계 — 공용 타입
// 근거: docs/01_설계조건_표준화방안_1-4장.md, docs/02_설계_프로시저_5-8장.md

export type Member = '보' | '기둥';
export type JointType = '마찰' | '지압';
export type SteelGrade = 'SS400' | 'SM490' | 'SM520' | 'SM570' | 'SN490' | 'SHN490';
export type BoltGrade = 'F10T' | 'F13T';
export type BoltName = 'M16' | 'M18' | 'M20' | 'M22' | 'M24';
export type BoltDia = 16 | 18 | 20 | 22 | 24;
export type SectionType = '압연' | '용접';
/** 부분강도비 α (0.1~1.0). 프리셋 50/60/70/80/90/100% 또는 직접 입력. */
export type StrengthRatio = number;

/** H형강 단면 (치수 + 단면성능) */
export interface HSection {
  name: string;      // "H-386x299x9x14"
  H: number;         // 춤 (mm)
  B: number;         // 폭 (mm)
  tw: number;        // 웨브 두께 (mm)
  tf: number;        // 플랜지 두께 (mm)
  r: number;         // 필렛 반경 (mm)
  Ag: number;        // 총단면적 (mm²)
  Aw: number;        // 웨브 유효단면적 = H·tw (전단용, mm²)
  Sx: number;        // 탄성 단면계수 (mm³)
  Zx: number;        // 소성 단면계수 (mm³)
  /** 단면성능 출처: 'ks'=KS 규격표 확정값, 'calc'=치수 기반 계산값 */
  propSource: 'ks' | 'calc';
}

/** 설계조건 (필터 → 엔진 입력) */
export interface DesignCondition {
  member: Member;
  jointType: JointType;
  steel: SteelGrade;
  bolt: BoltGrade;
  strengthRatio: StrengthRatio;
  sectionType: SectionType;
}

/** 첨판 치수 (두께 × 폭[or 춤] × 길이[or 너비]) */
export interface Plate {
  t: number;   // 두께
  w: number;   // 폭(플랜지) 또는 춤(웨브)
  L: number;   // 길이(플랜지) 또는 너비(웨브)
}

/** 볼트 배열 */
export interface BoltArray {
  m: number;   // 열수
  n: number;   // 행수 (0.5 단위 가능: 엇모배치)
  count: number; // 총 개수
}

/** 한 이음(플랜지 또는 웨브)의 설계 결과 */
export interface JointDesign {
  bolt: BoltArray;
  gauge?: { g1: number; g2?: number }; // 플랜지 게이지
  Pc?: number;                          // 웨브 상하 피치
  outerPlate?: Plate;                   // 플랜지 외첨판
  innerPlate?: Plate;                   // 플랜지 내첨판
  webPlate?: Plate;                     // 웨브 첨판
  staggered?: boolean;                  // 엇모배치 여부(플랜지) — 도면 볼트 배치용
  gap?: number;                         // 이음부 이격(첨판 길이에 반영된 값)
  pitch?: number;                       // 볼트 응력방향 피치(정렬=60, 엇모=90, Custom 대구경 상향)
  edge?: number;                        // 연단거리(응력방향, mm)
}

/** 계산서 한 단계 */
export interface CalcStep {
  group: string;        // "가) 소요휨강도" 등 구획
  label: string;        // 항목명
  formula?: string;     // 수식
  substitution?: string;// 대입
  value?: number;       // 결과값
  unit?: string;        // 단위
  ref?: string;         // 근거조항 "5.2.3"
  check?: 'OK' | 'NG';  // 판정
  note?: string;
}

/** 최종 설계 결과 (목록표 행 + 계산서) */
export interface DesignResult {
  section: string;
  boltDia: BoltDia;
  Mu_kNm: number;   // 설계 휨모멘트 (보) / — (기둥)
  Vu_kN: number;    // 설계 전단력 (보) / 소요압축 (기둥)
  Puf_kN: number;   // 플랜지 소요축력
  flange: JointDesign;
  web: JointDesign;
  steps: CalcStep[];
}
