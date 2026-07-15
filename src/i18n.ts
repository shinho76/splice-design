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
  // 문장(주석)
  ['기둥은 세장비를 무시하고 항복(총단면 공칭압축강도)만 고려한다.',
    'Column: slenderness neglected; only yielding (gross-section nominal compressive strength) is considered.'],
  ['웨브 이음부는 총웨브면적(H·tw)을 부담(필렛 제외). 두꺼운 web은 ±1등급 안전측.',
    'Web splice develops the gross web area (H·tw, fillet excluded). Thick webs are ±1 size conservative.'],
  ['횡좌굴은 무시하고 국부좌굴만, 총단면에 대해 산정한다.',
    'Lateral-torsional buckling neglected; only local buckling, on the gross section.'],
  ['필렛과 간섭 — 내첨판 폭/게이지 조정 필요', 'interferes with fillet — adjust inner-plate width/gauge'],
  ['임팩트렌치 진입 간섭 우려', 'impact-wrench access may interfere'],
  ['외첨판만 사용 → 외첨판이 전 축력을 부담한다.', 'Outer plate only → it develops the full axial force.'],
  ['내·외첨판 동일 두께(합성 순단면 기준)', 'Inner = outer plate thickness (combined net section)'],
  ['상·하 플랜지 중심거리 (H−tf)', 'centroidal distance of top/bottom flanges (H−tf)'],
  ['H형강 전체 춤 (외첨판만 사용)', 'full H-section depth (outer plate only)'],
  // 3D 범례·힌트
  ['고력볼트(머리·너트·와셔2·여장)', 'H.S. bolt (head·nut·2 washers·stickout)'],
  ['평면(90°)·정면·측면 + 3D 등각 (화면맞춤)', 'Plan(90°)·Front·Side + 3D iso (fit)'],
  ['드래그=회전 · 휠=줌 · 플랜지/웨브=치수', 'Drag=rotate · Wheel=zoom · Flange/Web=dims'],
  ['H형강(필렛R)', 'H-beam (fillet R)'],
  // 검토 항목(3D)
  ['조임 소켓여유(내측볼트→필렛)', 'Wrench-socket clearance (inner bolt→fillet)'],
  ['내첨판 안쪽 ↔ 필렛 끝단', 'Inner-plate face ↔ fillet toe'],
  ['플레이트 길이(외/내/웨브)', 'Plate length (outer/inner/web)'],
  ['연단거리(볼트→판끝)', 'Edge distance (bolt→plate edge)'],
  ['체결 검토 · AISC clearance', 'Installation check · AISC clearance'],
  ['플랜지 볼트 피치', 'Flange bolt pitch'],
  ['웨브 볼트 피치', 'Web bolt pitch'],
  // 2D 뷰 캡션
  ['플랜지 평면도 (외첨판)', 'Flange plan (outer plate)'],
  ['웨브 입면도', 'Web elevation'],
  ['정면도(입면)', 'Front (elev.)'],
  ['측면도(단면)', 'Side (section)'],
  ['3D 등각', '3D iso'],
  ['평면도', 'Plan'],
  // 그룹(계산서)
  ['소요휨강도 · 플랜지 소요축력', 'Required Flexural Strength · Flange Axial Force'],
  ['플랜지 소요압축강도', 'Flange Required Compressive Strength'],
  ['플랜지 첨판 폭·두께', 'Flange Splice-Plate Width·Thickness'],
  ['플랜지 볼트 설계강도·배열', 'Flange Bolt Design Strength·Layout'],
  ['플랜지 첨판 길이', 'Flange Splice-Plate Length'],
  ['웨브 소요전단강도', 'Web Required Shear Strength'],
  ['웨브 이음 소요력', 'Web Splice Demand'],
  ['웨브 볼트 · 첨판', 'Web Bolt · Splice Plate'],
  // 라벨(계산서)
  ['설계지압강도 φRn₁/φRn₂ (연단/중간)', 'Design Bearing Strength φRn₁/φRn₂ (edge/interior)'],
  ['웨브 첨판 (두께×춤×너비)', 'Web Splice Plate (t×depth×width)'],
  ['첨판 두께(내·외 동일)', 'Splice-Plate Thickness (inner = outer)'],
  ['접합부 소요휨강도', 'Connection Required Flexural Strength'],
  ['첨판 소요단면적', 'Splice-Plate Required Area'],
  ['공칭휨강도', 'Nominal Flexural Strength'],
  ['소요전단강도', 'Required Shear Strength'],
  ['요구 볼트개수', 'Required Number of Bolts'],
  ['요구 행수', 'Required Rows'],
  ['웨브 볼트 배열', 'Web Bolt Layout'],
  ['플랜지 볼트 배열', 'Flange Bolt Layout'],
  ['플랜지 소요축력', 'Flange Required Axial Force'],
  ['설계지압강도', 'Design Bearing Strength'],
  ['설계미끄럼강도', 'Design Slip Resistance'],
  // 치수 라벨(3D) 복합어 — 반드시 일반 단어보다 먼저
  ['내첨판~웨브볼트', 'inner PL~web bolt'],
  ['내첨판끝~필렛', 'inner PL edge~fillet'],
  ['외첨판 L=', 'outer PL L='], ['웨브 H=', 'web H='], ['웨브 L=', 'web L='],
  ['웨브판t', 'web PL t'],
  ['외첨판폭', 'outer PL w'], ['외첨판t', 'outer PL t'],
  ['내첨판폭', 'inner PL w'], ['내첨판t', 'inner PL t'],
  ['내첨판 두께', 'Inner Splice-Plate Thickness'], ['외첨판 두께', 'Outer Splice-Plate Thickness'],
  ['플랜지 첨판', 'Flange plate'], ['웨브 첨판', 'Web plate'],
  ['첨판 길이', 'Splice-Plate Length'],
  ['연단(직각)', 'edge (transv.)'],
  ['가로볼트', 'transv. bolts'], ['가로피치', 'transv. pitch'],
  // 수식·단위·단어
  ['볼트전단', 'bolt shear'],
  ['소요력', 'demand'],
  ['국부좌굴', 'local buckling'],
  ['여유권장', 'recommended'], ['여유 부족', 'insufficient clearance'],
  ['외폭', 'outer w'], ['내폭', 'inner w'],
  ['연단', 'edge'], ['중간', 'interior'],
  ['엇모', 'staggered'], ['정렬', 'aligned'], ['올림', 'round-up'],
  ['첨판', 'plate'], ['플랜지', 'flange'], ['웨브', 'web'],
  ['너비', 'width'], ['춤', 'depth'], ['폭', 'width'],
  ['피치', 'pitch'], ['갭', 'gap'], ['틈', 'gap'], ['참고', 'ref.'],
  ['접합', ' connection'], ['(수직)', '(vertical)'],
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
