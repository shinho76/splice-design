// AISC 리포트 공용 한/영 번역 — 요약(AiscCalcReport)·상세(AiscDetailReport) 공유.
// 엔진(engine/aisc)은 그룹·라벨을 한글로, 옵티마이저 changes·검토 detail/note에 한글 조각을 emit.
// 영어 모드에서 이를 치환한다. (KBC용 i18n tr()과는 별도 — 상호 간섭 방지)
import type { Lang } from '../i18n.ts';

// 검토 id → 영문 명칭(한글은 엔진 check.label 사용)
export const EN_LABEL: Record<string, string> = {
  FB1: 'Bolt shear (double shear)', FB2: 'Bolt slip resistance (Class B)',
  FP1: 'Outer plate — tension yielding', FP2: 'Outer plate — tension rupture', FP3: 'Outer plate — compression buckling', FP4: 'Outer plate — bearing & tear-out', FP5: 'Outer plate — block shear',
  FI1: 'Inner plates — tension yielding', FI2: 'Inner plates — tension rupture', FI3: 'Inner plates — compression buckling', FI4: 'Inner plates — bearing & tear-out', FI5: 'Inner plates — block shear',
  FM1: 'Beam flange — bearing & tear-out', FM2: 'Beam flange — flexural rupture (F13.1)', FM3: 'Beam flange (WT) — tension yielding', FM4: 'Beam flange (WT) — tension rupture', FM5: 'Beam flange — block shear',
  WB1: 'Web bolt shear (double shear)', WB2: 'Web bolt slip resistance', WR1: 'Web — bearing & tear-out', WP1: 'Web splice plate — block shear (V, Path 1)', WI1: 'Web plates — yielding interaction', WI2: 'Web plates — rupture interaction', WM1: 'Beam web — shear yielding', WM2: 'Girder web — block shear (V, Path 4·5)',
};

const CASE_EN: Record<string, string> = {
  '전열 U블록': 'full U-block (2 shear planes)', '외연 L블록': 'outer L-block', '중앙 L블록': 'central L-block',
  '내측 페어': 'inner pair U-block', '양연 U블록': 'twin U-block',
};
export const caseLabel = (label: string, lang: Lang): string => {
  if (lang === 'ko') return label;
  const letter = label[0];
  const inner = label.slice(label.indexOf('(') + 1, label.lastIndexOf(')'));
  return `${letter} — ${CASE_EN[inner] ?? inner}`;
};

// 그룹 헤더 영문화(치수·기호 유지)
export const groupEn = (g: string): string => g
  .replace('볼트(웨브)', 'Bolts (web)').replace('볼트', 'Bolts')
  .replace('외부 이음판', 'Outer plate').replace('내부 이음판', 'Inner plates').replace('웨브 이음판', 'Web plates')
  .replace('부재 H형강', 'H-beam member').replace('부재 웨브', 'Beam web');
export const groupT = (g: string, lang: Lang) => lang === 'ko' ? g : groupEn(g);
export const labelT = (id: string, koLabel: string, lang: Lang) => lang === 'ko' ? koLabel : (EN_LABEL[id] ?? koLabel);

// 옵티마이저 changes·검토 detail/note의 한글 조각 → 영문 (긴 조각 우선)
const A_TERMS: [string, string][] = [
  ['플랜지 소요캡핑', 'flange demand cap'], ['웨브 소요캡핑', 'web demand cap'],
  ['플랜지 볼트행', 'flange bolt rows'], ['웨브 볼트(춤)', 'web bolts(depth)'], ['웨브 볼트(축)', 'web bolts(long.)'],
  ['웨브 이음판 두께', 'web plate t'], ['외부 이음판 두께', 'outer plate t'], ['내부 이음판 두께', 'inner plate t'],
  ['볼트직경', 'bolt dia'], ['보정불가(한계)', 'no more correction (limit)'], ['(부분강도)', ' (partial-strength)'],
  ['전열 U블록', 'full U-block'], ['외연 L블록', 'outer L-block'], ['중앙 L블록', 'central L-block'],
  ['내측 페어', 'inner pair'], ['양연 U블록', 'twin U-block'],
  ['지압접합 → 해당 없음', 'bearing-type → N/A'], ['단일열 → 인장파단(FI2)이 지배', 'single line → net rupture (FI2) governs'],
  ['압축플랜지 한정', 'compression flange only'], ['감소없음', 'no reduction'], ['파단지배', 'rupture governs'],
  ['지배', 'gov'], ['연단', 'edge'], ['간격', 'spaced'], ['동심', 'concentric'],
  ['외부 이음판', 'outer plate'], ['내부 이음판', 'inner plate'], ['웨브', 'web'], ['이음판', 'plate'],
  ['플랜지', 'flange'], ['부재', 'member'],
  ['완료', 'done'], ['단일열', 'single line'], ['지압', 'bearing'],
];
/** AISC 엔진 한글 조각 치환(영어 모드). detail·note·changes 문자열에 적용. */
export function trA(s: string | undefined, lang: Lang): string {
  if (s == null) return '';
  if (lang === 'ko') return s;
  let out = s;
  for (const [ko, en] of A_TERMS) if (out.includes(ko)) out = out.split(ko).join(en);
  return out;
}
