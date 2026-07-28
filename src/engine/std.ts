// 설계기준(designStd) 헬퍼.
// KDS 14 31 25(하중저항계수설계법)은 AISC 360-16 Chapter J를 준용 — 볼트 전단/지압·찢김·
// 미끄럼, 인장항복(φ0.90)·파단(φ0.75), 블록전단(φ0.75, 0.6Fu·Anv+Ubs·Fu·Ant ≤ 0.6Fy·Agv+…)
// 이 모두 동일 공식·저항계수. 따라서 KDS는 AISC 한계상태 엔진을 공유하되 표기만 KDS로 한다.
export type DesignStd = 'KBC' | 'KDS' | 'AISC';

/** AISC 360-16 한계상태 엔진(aiscCheck/aiscRun/aiscAutoCorrect)을 사용하는 기준 여부 */
export const usesLimitState = (std?: DesignStd): boolean => std === 'AISC' || std === 'KDS';

/** 리포트·팝업 표기용 기준 명칭 */
export const stdLabel = (std?: DesignStd): string =>
  std === 'AISC' ? 'AISC 360-16' : std === 'KDS' ? 'KDS 14 31 25' : 'KBC-09';

/** 기준 명칭(부제 포함) — KDS는 AISC 준용임을 명시 */
export const stdLabelLong = (std?: DesignStd): string =>
  std === 'AISC' ? 'AISC 360-16 (15th ed.)' : std === 'KDS' ? 'KDS 14 31 25 (AISC 360-16 준용)' : 'KBC-09';
