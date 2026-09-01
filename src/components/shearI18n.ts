// SC(전단판) 계산서 공용 한/영 번역 — 요약(ShearCalcReport)·상세(ShearDetailReport) 공유.
//   aiscI18n.ts(GS)와 같은 목적이나 SC 전용 id·그룹·용어를 다룬다(상호 간섭 방지 위해 분리).
import type { Lang } from '../i18n.ts';

// 검토 id → 영문 명칭(한글은 엔진 check.label 사용)
export const EN_LABEL_SC: Record<string, string> = {
  SB1: 'Bolt shear (eccentric group, double shear)', SB2: 'Bolt slip resistance (double shear)',
  SR1: 'Shear plate — bearing & tear-out (vertical)', SR2: 'Beam web — bearing & tear-out (vertical)',
  SR3: 'Shear plate — bearing & tear-out (horizontal)', SR4: 'Beam web — bearing & tear-out (horizontal)',
  SP1: 'Plate — shear yielding', SP2: 'Plate — shear rupture', SP3: 'Plate — flexural yielding (eccentric)',
  SP4: 'Plate — flexural rupture (net section)', SP5: 'Plate — shear+flexure yielding interaction',
  SP6: 'Plate — block shear', SP7: 'Plate thickness ductility', SP8: 'Plate — shear+flexure rupture interaction',
  SM1: 'Beam web — shear yielding',
};

const GROUP_EN_SC: [string, string][] = [
  ['A. 볼트', 'A. Bolts'], ['B. 지압·찢김', 'B. Bearing & tear-out'], ['C. 전단판', 'C. Shear plate'], ['D. 보 웨브', 'D. Beam web'],
];
export const groupTS = (g: string, lang: Lang): string => lang === 'ko' ? g : (GROUP_EN_SC.find(([k]) => k === g)?.[1] ?? g);
export const labelTS = (id: string, koLabel: string, lang: Lang): string => lang === 'ko' ? koLabel : (EN_LABEL_SC[id] ?? koLabel);

// 검토 detail·note 문자열의 한글 조각 → 영문(긴 조각 우선 매칭)
const S_TERMS: [string, string][] = [
  ['편심 볼트군', 'eccentric bolt group'], ['웨브 순높이', 'web clear height'], ['수평방향', 'horizontal'], ['수직방향', 'vertical'],
  ['전단판', 'shear plate'], ['보 웨브', 'beam web'], ['볼트군', 'bolt group'], ['편심계수', 'eccentric factor'],
  ['판 춤', 'plate depth'], ['마찰접합', 'slip-critical'], ['2면전단', 'double shear'], ['단일열', 'single line'],
  ['전단항복', 'shear yield'], ['전단파단', 'shear rupture'], ['휨항복', 'flexural yield'], ['휨파단', 'flexural rupture'],
  ['블록전단', 'block shear'], ['연성지배', 'ductility-governed'], ['상용두께', 'commercial thickness'],
  ['L형', 'L-shape'], ['U형', 'U-shape'], ['지배', 'governs'], ['여유', 'margin'], ['연단', 'edge'],
  ['판정', 'result'], ['소요', 'demand'], ['상호작용', 'interaction'], ['항복', 'yielding'], ['파단', 'rupture'],
  ['지압', 'bearing'], ['찢김', 'tear-out'], ['연성', 'ductility'], ['웨브', 'web'], ['이음판', 'plate'], ['판', 'plate'],
  ['2매', '×2 plies'], ['본', 'ea'],
];
export function trS(s: string | undefined, lang: Lang): string {
  if (s == null) return '';
  if (lang === 'ko') return s;
  let out = s;
  for (const [ko, en] of S_TERMS) if (out.includes(ko)) out = out.split(ko).join(en);
  return out;
}
