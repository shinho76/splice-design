// 프로젝트 — 여러 부재(단면+설계조건)를 담아 저장/불러오기. localStorage + JSON 파일.
import type { DesignCondition } from './types.ts';

export interface ProjectItem { id: string; section: string; cond: DesignCondition; }
const KEY = 'splice_project_v1';

export function loadProject(): ProjectItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
export function persistProject(items: ProjectItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* quota */ }
}
export function newItem(section: string, cond: DesignCondition): ProjectItem {
  return { id: `${section}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, section, cond: { ...cond } };
}
/** JSON 문자열 → 프로젝트 배열 (검증) */
export function parseProjectJson(text: string): ProjectItem[] {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : data.items;
  if (!Array.isArray(arr)) throw new Error('형식 오류');
  return arr.filter((x: unknown): x is ProjectItem =>
    !!x && typeof (x as ProjectItem).section === 'string' && !!(x as ProjectItem).cond);
}
export const condLabel = (c: DesignCondition) =>
  `${c.member}·${c.jointType}·${Math.round(c.strengthRatio * 100)}%·${c.steel}·${c.bolt}`;
