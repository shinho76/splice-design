// AutoLISP(.lsp) 생성기 — JointDetailDWG.exe 동일 도면을 AutoCAD 내에서 entmake로 직접 생성.
// dxf.ts의 지오메트리(layout·emitMember)를 그대로 재사용 → DXF와 좌표·구성 완전 동일.
// 출력만 DXF 태그 → (entmake ...) 로 변환. 치수는 exe와 동일한 가시 지오메트리(연장선·_ARCHTICK 틱·값)로 전개.
import type { DesignResult, DesignCondition } from './types.ts';
import { newDoc, emitMember, placeGrid, type Doc } from './dxf.ts';

const FONT = 'OpenSansCondensed-Light';
// exe 실측 레이어(이름·색). 선두께는 색상펜(CTB) 관례 — 객체 선두께 미사용.
const LAYERS: [string, number][] = [
  ['MAIN', 7], ['FLG_PL', 3], ['WEB_PL', 4], ['BOLT', 6], ['VER_BOLT', 1], ['DIM', 7], ['MINI_BOX', 7],
];

// 정수로 다루는 그룹코드(색·플래그·정렬), 나머지 수치코드는 실수
const INT_CODES = new Set(['62', '70', '71', '72', '73', '90']);
const STR_CODES = new Set(['1', '2', '3', '4', '6', '7', '8']);

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const real = (v: string) => (/[.eE]/.test(v) ? v : v + '.0');

interface Ent { type: string; codes: [string, string][]; }
function parse(tags: string[]): Ent[] {
  const out: Ent[] = [];
  let cur: Ent | null = null;
  for (let i = 0; i < tags.length; i += 2) {
    const c = tags[i], v = tags[i + 1];
    if (c === '0') { cur = { type: v, codes: [] }; out.push(cur); }
    else if (cur) cur.codes.push([c, v]);
  }
  return out;
}

// 한 엔티티 → (entmake (list ...)) 한 줄
function entmake(e: Ent): string {
  const m = new Map<string, string>();
  for (const [c, v] of e.codes) if (!m.has(c)) m.set(c, v);
  const parts: string[] = [`(cons 0 "${esc(e.type)}")`];
  const used = new Set<string>();
  // 점 그룹(10/11/12/13) → (code x y z)
  for (const base of ['10', '11', '12', '13']) {
    const bx = base, by = String(+base + 10), bz = String(+base + 20);
    if (m.has(bx)) {
      const x = real(m.get(bx)!), y = real(m.get(by) ?? '0'), z = real(m.get(bz) ?? '0');
      parts.push(`(list ${bx} ${x} ${y} ${z})`);
      used.add(bx); used.add(by); used.add(bz);
    }
  }
  for (const [c, v] of e.codes) {
    if (used.has(c) || c === '0') continue;
    used.add(c);
    if (STR_CODES.has(c)) parts.push(`(cons ${c} "${esc(v)}")`);
    else if (INT_CODES.has(c)) parts.push(`(cons ${c} ${Math.round(+v)})`);
    else parts.push(`(cons ${c} ${real(v)})`);
  }
  return `(entmake (list ${parts.join(' ')}))`;
}

// DXF 문서(doc.e 엔티티 + doc.blk 블록) → entmake 본문. DIMENSION은 건너뛰고
// *Dn 블록의 가시 지오메트리를 최상위로 전개(개별/일괄 모두 절대좌표라 그대로 재현).
function body(doc: Doc): string[] {
  const lines: string[] = [];
  const draw = new Set(['LINE', 'CIRCLE', 'TEXT', 'SOLID', 'INSERT', 'POINT']);
  for (const e of parse(doc.e)) if (draw.has(e.type)) lines.push(entmake(e));
  for (const e of parse(doc.blk)) if (draw.has(e.type)) lines.push(entmake(e)); // BLOCK/ENDBLK 제외 → 내용만 전개
  return lines;
}

function preamble(): string {
  const lay = LAYERS.map(([n, c]) =>
    `  (if (not (tblsearch "LAYER" "${n}")) (entmakex (list '(0 . "LAYER") '(100 . "AcDbSymbolTableRecord") '(100 . "AcDbLayerTableRecord") (cons 2 "${n}") (cons 70 0) (cons 62 ${c}) (cons 6 "Continuous"))))`
  ).join('\n');
  return [
    ';; ==== SPLICE DESIGN : JointDetailDWG 호환 도면 (AutoLISP entmake) ====',
    ';; 계산엔진: KBC-09 한국강구조학회 표준접합. 도면규약: JointDetailDWG.exe 실측.',
    '(defun _spl_tables ( / )',
    lay,
    `  (if (not (tblsearch "STYLE" "${FONT}"))`,
    `    (entmakex (list '(0 . "STYLE") '(100 . "AcDbSymbolTableRecord") '(100 . "AcDbTextStyleRecord") (cons 2 "${FONT}") (cons 70 0) (cons 40 0.0) (cons 41 1.0) (cons 50 0.0) (cons 71 0) (cons 42 20.0) (cons 3 "${FONT}.ttf") (cons 4 ""))))`,
    '  (if (not (tblsearch "BLOCK" "_ARCHTICK"))',
    "    (progn (entmake '((0 . \"BLOCK\") (2 . \"_ARCHTICK\") (70 . 0) (10 0.0 0.0 0.0) (3 . \"_ARCHTICK\")))",
    "           (entmake '((0 . \"LINE\") (8 . \"0\") (10 -0.5 -0.5 0.0) (11 0.5 0.5 0.0)))",
    "           (entmake '((0 . \"ENDBLK\") (8 . \"0\")))))",
    '  (princ))',
  ].join('\n');
}

function wrapLsp(doc: Doc, title: string): string {
  return [
    preamble(),
    `(defun c:SPLICE ( / e )`,
    '  (setvar "CMDECHO" 0)',
    '  (_spl_tables)',
    ...body(doc).map(l => '  ' + l),
    `  (princ "\\n[SPLICE] ${esc(title)} 도면 생성 완료.")`,
    '  (princ))',
    '(_spl_tables)',
    '(c:SPLICE)',
    '(princ "\\nSPLICE 명령으로 다시 그릴 수 있습니다.")',
    '(princ)',
  ].join('\n');
}

export function toLSP(r: DesignResult, cond: DesignCondition): string {
  const doc = newDoc();
  emitMember(doc, r, cond, 0, 0);
  return wrapLsp(doc, r.section);
}

export function toLSPAll(rows: DesignResult[], cond: DesignCondition): string {
  const doc = newDoc();
  placeGrid(rows, cond.member === '기둥', (r, ox, oy) => emitMember(doc, r, cond, ox, oy));
  return wrapLsp(doc, `전체 ${cond.member} ${cond.jointType} ${rows.length}건`);
}
