// ────────────────────────────────────────────────────────────────────────────
// 표준도(모멘트접합 이음) 스케줄 — GIRDER/COLUMN_SPLICE 표준도 DXF에서 추출.
//   'S'(표준) 모드 전용: 부재 리스트 + 볼트직경 + 배열타입(A/B/C).
//   ※ Phase 1: 단면·볼트직경·타입 (신뢰 추출). 판두께/사이즈(t3·t4·t5·plate)는 Phase 2.
//   접합방식은 '전볼트'(GSA/CSA) 기준. 재질은 275계/355계 2택.
// ────────────────────────────────────────────────────────────────────────────
import type { HSection, Member, DesignCondition, DesignResult } from '../types.ts';
import { buildSection, catalogFor } from '../sections.ts';
import { STD_PLATE_BEAM, STD_PLATE_COLUMN } from './plateData.ts';

export type ArrType = 'A' | 'B' | 'C';
export interface StdEntry { name: string; dia: number; type: ArrType; }

/** 보(GIRDER) 이음 표준 부재 — 29종 */
export const STD_BEAM: StdEntry[] = [
  { name: 'H-175x175x7.5x11', dia: 20, type: 'A' },
  { name: 'H-194x150x6x9', dia: 20, type: 'A' },
  { name: 'H-200x200x8x12', dia: 20, type: 'A' },
  { name: 'H-244x175x7x11', dia: 20, type: 'A' },
  { name: 'H-250x125x6x9', dia: 16, type: 'A' },
  { name: 'H-250x250x9x14', dia: 20, type: 'A' },
  { name: 'H-294x200x8x12', dia: 20, type: 'A' },
  { name: 'H-300x150x6.5x9', dia: 20, type: 'A' },
  { name: 'H-300x300x10x15', dia: 24, type: 'B' },
  { name: 'H-340x250x9x14', dia: 20, type: 'A' },
  { name: 'H-350x175x7x11', dia: 20, type: 'A' },
  { name: 'H-390x300x10x16', dia: 24, type: 'B' },
  { name: 'H-400x200x8x13', dia: 20, type: 'A' },
  { name: 'H-440x300x11x18', dia: 24, type: 'B' },
  { name: 'H-450x200x9x14', dia: 20, type: 'A' },
  { name: 'H-482x300x11x15', dia: 24, type: 'B' },
  { name: 'H-488x300x11x18', dia: 24, type: 'B' },
  { name: 'H-500x200x10x16', dia: 20, type: 'A' },
  { name: 'H-506x201x11x19', dia: 20, type: 'A' },
  { name: 'H-582x300x12x17', dia: 24, type: 'B' },
  { name: 'H-588x300x12x20', dia: 24, type: 'B' },
  { name: 'H-600x200x11x17', dia: 20, type: 'A' },
  { name: 'H-612x202x13x23', dia: 20, type: 'A' },
  { name: 'H-692x300x13x20', dia: 24, type: 'B' },
  { name: 'H-700x300x13x24', dia: 24, type: 'B' },
  { name: 'H-792x300x14x22', dia: 24, type: 'B' },
  { name: 'H-800x300x14x26', dia: 24, type: 'B' },
  { name: 'H-900x300x16x28', dia: 24, type: 'B' },
  { name: 'H-912x302x18x34', dia: 24, type: 'B' },
];

/** 기둥(COLUMN) 이음 표준 부재 — 35종 (Type C = 광폭 정사각 기둥단면) */
export const STD_COLUMN: StdEntry[] = [
  { name: 'H-150x150x7x10', dia: 20, type: 'A' },
  { name: 'H-175x175x7.5x11', dia: 20, type: 'A' },
  { name: 'H-194x150x6x9', dia: 20, type: 'A' },
  { name: 'H-200x100x5.5x8', dia: 16, type: 'A' },
  { name: 'H-200x200x8x12', dia: 20, type: 'A' },
  { name: 'H-244x175x7x11', dia: 20, type: 'A' },
  { name: 'H-250x125x6x9', dia: 16, type: 'A' },
  { name: 'H-250x250x9x14', dia: 20, type: 'A' },
  { name: 'H-294x200x8x12', dia: 20, type: 'A' },
  { name: 'H-300x150x6.5x9', dia: 20, type: 'A' },
  { name: 'H-300x300x10x15', dia: 24, type: 'B' },
  { name: 'H-340x250x9x14', dia: 20, type: 'A' },
  { name: 'H-350x175x7x11', dia: 20, type: 'A' },
  { name: 'H-350x350x12x19', dia: 24, type: 'C' },
  { name: 'H-390x300x10x16', dia: 24, type: 'B' },
  { name: 'H-400x200x8x13', dia: 20, type: 'A' },
  { name: 'H-400x400x13x21', dia: 24, type: 'C' },
  { name: 'H-400x408x21x21', dia: 24, type: 'C' },
  { name: 'H-406x403x16x24', dia: 24, type: 'C' },
  { name: 'H-414x405x18x28', dia: 24, type: 'C' },
  { name: 'H-428x407x20x35', dia: 24, type: 'C' },
  { name: 'H-440x300x11x18', dia: 24, type: 'B' },
  { name: 'H-450x200x9x14', dia: 20, type: 'A' },
  { name: 'H-458x417x30x50', dia: 24, type: 'C' },
  { name: 'H-482x300x11x15', dia: 24, type: 'B' },
  { name: 'H-488x300x11x18', dia: 24, type: 'B' },
  { name: 'H-500x200x10x16', dia: 20, type: 'A' },
  { name: 'H-582x300x12x17', dia: 24, type: 'B' },
  { name: 'H-588x300x12x20', dia: 24, type: 'B' },
  { name: 'H-600x200x11x17', dia: 20, type: 'A' },
  { name: 'H-692x300x13x20', dia: 24, type: 'B' },
  { name: 'H-700x300x13x24', dia: 24, type: 'B' },
  { name: 'H-792x300x14x22', dia: 24, type: 'B' },
  { name: 'H-800x300x14x26', dia: 24, type: 'B' },
  { name: 'H-900x300x16x28', dia: 24, type: 'B' },
];

/** 표준 스케줄(부재별) */
export const stdSchedule = (member: Member): StdEntry[] => (member === '기둥' ? STD_COLUMN : STD_BEAM);

/** 표준 단면(HSection[]) — 카탈로그 외 단면도 buildSection으로 생성 */
const _cache = new Map<string, HSection>();
export function standardSections(member: Member): HSection[] {
  return stdSchedule(member).map(e => {
    let s = _cache.get(e.name);
    if (!s) { s = buildSection(e.name); _cache.set(e.name, s); }
    return s;
  });
}

/** 표준 볼트직경(부재·인덱스) */
export function standardDiaAt(member: Member, i: number): number | undefined {
  return stdSchedule(member)[i]?.dia;
}

/** 구분(mode) 반영 단면 소스 — S=표준 부재리스트, 그 외=일반 카탈로그 */
export function catalogForCond(cond: DesignCondition): HSection[] {
  return cond.mode === 'S' ? standardSections(cond.member) : catalogFor(cond.profile, cond.sectionSet);
}

/** S모드 재질키 (275계/355계) — 부재/이음판 강종으로 판별 */
export const stdMatKey = (cond: DesignCondition): '275' | '355' =>
  (cond.steel === 'SHN275' || cond.steel === 'SS275' || cond.plateSteel === 'SS275') ? '275' : '355';

/** S모드: 표준도 플랜지 판데이터(외판 t3×a×b, 내판 t4)를 결과에 덮어씀. 데이터 없으면 원본 유지. */
export function applyStdPlates(r: DesignResult, cond: DesignCondition): DesignResult {
  if (cond.mode !== 'S') return r;
  const tbl = cond.member === '기둥' ? STD_PLATE_COLUMN : STD_PLATE_BEAM;
  const pd = tbl[stdMatKey(cond)]?.[r.section];
  if (!pd) return r;
  const f = r.flange;
  const outer = f.outerPlate ? { t: pd.t3, w: pd.a, L: pd.b } : f.outerPlate;
  const inner = f.innerPlate ? { ...f.innerPlate, t: pd.t4, L: pd.b } : f.innerPlate;
  return { ...r, flange: { ...f, outerPlate: outer, innerPlate: inner } };
}

/** S모드 표준 판데이터 보유 여부(플래그용) */
export const hasStdPlate = (cond: DesignCondition, name: string): boolean => {
  const tbl = cond.member === '기둥' ? STD_PLATE_COLUMN : STD_PLATE_BEAM;
  return !!tbl[stdMatKey(cond)]?.[name];
};

/** 표준 재질(275계/355계) — 부재/이음판 강종 매핑 */
export const STD_MATERIALS = [
  { key: '275', label: 'SHN275 / SS275', steel: 'SHN275', plate: 'SS275' },
  { key: '355', label: 'SHN355 / SM355', steel: 'SHN355', plate: 'SM355' },
] as const;
