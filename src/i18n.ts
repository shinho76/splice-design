// 한/영 전환 — 언어 컨텍스트 + 엔진 스텝 용어 치환(AISC 공식 용어)
import { createContext, useContext } from 'react';

export type Lang = 'ko' | 'en';
export const LangContext = createContext<Lang>('ko');
export const useLang = () => useContext(LangContext);

// 부재·접합 enum 표시값(AISC)
export function tMember(m: string, lang: Lang): string {
  if (lang === 'ko') return m;
  return m === '기둥' ? 'Column' : 'Beam';
}
export function tJoint(j: string, lang: Lang): string {
  if (lang === 'ko') return j;
  return j === '지압' ? 'Bearing' : 'Slip-critical';   // AISC: bearing-type / slip-critical
}

// 엔진이 생성하는 계산서 스텝 문자열(group·label·formula·note·unit)의 한→영 용어 치환.
// 긴 구/문장을 먼저 치환(부분 매칭 방지). 수식·기호(φRn, Aupf, Lc, Fu …)는 그대로 둔다.
const TERMS: [string, string][] = [
  // 주석(문장)
  ['기둥은 세장비를 무시하고 항복(총단면 공칭압축강도)만 고려한다.',
    'Column: slenderness neglected; only yielding (gross-section nominal compressive strength) is considered.'],
  ['웨브 이음부는 총웨브면적(H·tw)을 부담(필렛 제외). 두꺼운 web은 ±1등급 안전측.',
    'Web splice develops the gross web area (H·tw, fillet excluded). Thick webs are ±1 size conservative.'],
  ['횡좌굴은 무시하고 국부좌굴만, 총단면에 대해 산정한다.',
    'Lateral-torsional buckling neglected; only local buckling, on the gross section.'],
  ['외첨판만 사용 → 외첨판이 전 축력을 부담한다.', 'Outer plate only → it develops the full axial force.'],
  ['내·외첨판 동일 두께(합성 순단면 기준)', 'Inner = outer plate thickness (combined net section)'],
  ['상·하 플랜지 중심거리 (H−tf)', 'centroidal distance of top/bottom flanges (H−tf)'],
  ['H형강 전체 춤 (외첨판만 사용)', 'full H-section depth (outer plate only)'],
  // 그룹(구획)
  ['소요휨강도 · 플랜지 소요축력', 'Required Flexural Strength · Flange Axial Force'],
  ['플랜지 소요압축강도', 'Flange Required Compressive Strength'],
  ['플랜지 첨판 폭·두께', 'Flange Splice-Plate Width·Thickness'],
  ['플랜지 볼트 설계강도·배열', 'Flange Bolt Design Strength·Layout'],
  ['플랜지 첨판 길이', 'Flange Splice-Plate Length'],
  ['웨브 소요전단강도', 'Web Required Shear Strength'],
  ['웨브 이음 소요력', 'Web Splice Demand'],
  ['웨브 볼트 · 첨판', 'Web Bolt · Splice Plate'],
  // 라벨(항목)
  ['설계지압강도 φRn₁/φRn₂ (연단/중간)', 'Design Bearing Strength φRn₁/φRn₂ (edge/interior)'],
  ['웨브 첨판 (두께×춤×너비)', 'Web Splice Plate (t×depth×width)'],
  ['첨판 두께(내·외 동일)', 'Splice-Plate Thickness (inner = outer)'],
  ['접합부 소요휨강도', 'Connection Required Flexural Strength'],
  ['첨판 소요단면적', 'Splice-Plate Required Area'],
  ['공칭휨강도', 'Nominal Flexural Strength'],
  ['내첨판 두께', 'Inner Splice-Plate Thickness'],
  ['외첨판 두께', 'Outer Splice-Plate Thickness'],
  ['소요전단강도', 'Required Shear Strength'],
  ['요구 볼트개수', 'Required Number of Bolts'],
  ['요구 행수', 'Required Rows'],
  ['웨브 볼트 배열', 'Web Bolt Layout'],
  ['플랜지 볼트 배열', 'Flange Bolt Layout'],
  ['플랜지 소요축력', 'Flange Required Axial Force'],
  ['첨판 길이', 'Splice-Plate Length'],
  ['설계지압강도', 'Design Bearing Strength'],
  ['설계미끄럼강도', 'Design Slip Resistance'],
  // 수식·단위 조각
  ['볼트전단', 'bolt shear'],
  ['소요력', 'demand'],
  ['국부좌굴', 'local buckling'],
  ['외폭', 'outer w'], ['내폭', 'inner w'],
  ['연단', 'edge'], ['중간', 'interior'],
  ['엇모', 'staggered'], ['정렬', 'aligned'], ['올림', 'round-up'],
  ['첨판', 'plate'], ['플랜지', 'flange'], ['웨브', 'web'],
  ['너비', 'width'], ['춤', 'depth'], ['폭', 'width'],
  ['열', ' col'], ['행', ' row'], ['축', 'long.'],
  ['개', 'ea'],
  ['(1면)', '(single shear)'], ['(2면)', '(double shear)'], ['면', ' planes'],
];

export function tr(s: string | undefined, lang: Lang): string {
  if (s == null) return '';
  if (lang === 'ko') return s;
  let out = s;
  for (const [ko, en] of TERMS) if (out.includes(ko)) out = out.split(ko).join(en);
  return out;
}
