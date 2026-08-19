// ────────────────────────────────────────────────────────────────────────────
// AISC 360-16 상수 (SI: mm·N·MPa)
// 상수 정의(SI).
// KBC-09 경로와 완전 독립 — 이 디렉토리(engine/aisc)는 AISC 전용.
// ────────────────────────────────────────────────────────────────────────────

/** 강도저감계수 φ (LRFD) */
export const PHI = {
  V: 0.75, // 볼트 전단·지압·파단 (J3, J4.2)
  Y: 0.90, // 총단면 항복 (J4.1, D2.1)
  R: 0.75, // 순단면 파단·블록전단 (J4.2, J4.3, D2.2)
  C: 0.90, // 압축 (E, J4.4)
  SL: 1.00, // 미끄럼 (J3.8, 표준구멍)
  SH: 1.00, // 전단항복 (G2.1(a), 압연 I형강 h/tw 제한 내)
  F: 0.90, // 휨 (F)
} as const;

export const E_STEEL = 200_000; // 강재 탄성계수 (MPa)

/** 유효좌굴길이계수 K (스프레드시트 채택값) */
export const K_BUCKLE = 1.2;

/**
 * 나사조건별 공칭전단강도계수 (Fnv = f·Fu_bolt).
 * N(나사부 전단면 통과)=0.450·Fu, X(제외)=0.563·Fu.
 * → A325/A490 표(J3.2) 값을 볼트 Fu로부터 재현.
 */
export const FNV_FACTOR = { N: 0.450, X: 0.563 } as const;

/**
 * 블록전단 인장응력 불균일계수 Ubs (J4.3).
 * 균일(대칭 2전단면 페어) = 1.0, 불균일(단일 인장선 L블록) = 0.5.
 */
export const UBS = { UNIFORM: 1.0, NONUNIFORM: 0.5 } as const;

/**
 * 순단면 산정 시 구멍 손상여유 (B4.3b).
 * 순폭 공제 = 볼트구멍지름 dh + NET_HOLE_ADD.  1/16in ≈ 1.6mm → SI 2mm.
 */
export const NET_HOLE_ADD = 2; // mm

/** 표준구멍 지름 dh = d + STD_HOLE_ADD (M24 이하) */
export const STD_HOLE_ADD = 2; // mm

/** 마찰접합 계수 (J3.8) */
export const SLIP = {
  MU: 0.50, // 미끄럼계수 μ (Class B, 블라스트)
  DU: 1.13, // 인장력계수 Du
  HF: 1.00, // 필러계수 hf
} as const;

/** 볼트구멍 지름 (mm) */
export const holeDia = (d: number): number => d + STD_HOLE_ADD;

/** 순단면 공제폭 1구멍당 (mm) */
export const netDeductPerHole = (d: number): number => holeDia(d) + NET_HOLE_ADD;

/** kN 변환(표시용, N→kN) */
export const kN = (n_N: number): number => +(n_N / 1000).toFixed(1);
/** kN·m 변환(표시용, N·mm→kN·m) */
export const kNm = (nmm: number): number => +(nmm / 1e6).toFixed(1);
