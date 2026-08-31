// 구조계산요약(Calculation Sheet) Excel(.xlsx) 출력 — SheetJS.
//   전 부재 1행/부재. 열 그룹: 입력(INPUT) · 설계강도(OUTPUTS, φRn) · 검토비(DCR).
//   설계강도·DCR은 화면 결과와 동일한 AISC 최적화 검토(ac.report.checks)에서 취한다.
import * as XLSX from 'xlsx';
import type { DesignCondition, DesignResult, HSection } from './types.ts';
import type { AiscCheck } from './aisc/types.ts';
import { steelLabel } from './materials.ts';
import { ksClassOf, ksLabelOf } from './standard/ksData.ts';
import { unitWeightOf } from './hbeam_catalog.ts';

/** 한 부재의 계산 요약(엔진 결과 + 한계상태 검토). */
export interface SheetRow {
  s: HSection;               // 카탈로그 원본 단면(KS라벨·계열·r·단위중량 조회용)
  result: DesignResult;
  checks: AiscCheck[];      // 한계상태 검토(비한계상태 기준이면 빈 배열)
  ok: boolean;
  flangeScale: number;      // 플랜지 발현 배율(부분강도 <1)
  webScale: number;
  memberLimited: boolean;
}

const clsShort = (c?: 'WIDE' | 'MIDDLE' | 'NARROW') =>
  c === 'WIDE' ? '광폭' : c === 'MIDDLE' ? '중폭' : c === 'NARROW' ? '세폭' : '';

// 한계상태 검토 열의 정규 순서·그룹·한글 약칭. 실제 등장한 id만 열로 출력한다.
const CHECK_COLS: { id: string; grp: string; label: string }[] = [
  { id: 'FB1', grp: '볼트', label: '플랜지볼트 전단' },
  { id: 'FB2', grp: '볼트', label: '플랜지볼트 미끄럼' },
  { id: 'WB1', grp: '볼트', label: '웨브볼트 전단' },
  { id: 'WB2', grp: '볼트', label: '웨브볼트 미끄럼' },
  { id: 'FP1', grp: '플랜지 외부판', label: '인장항복' },
  { id: 'FP2', grp: '플랜지 외부판', label: '인장파단' },
  { id: 'FP3', grp: '플랜지 외부판', label: '압축좌굴' },
  { id: 'FP4', grp: '플랜지 외부판', label: '지압·찢김' },
  { id: 'FP5', grp: '플랜지 외부판', label: '블록전단' },
  { id: 'FI1', grp: '플랜지 내부판', label: '인장항복' },
  { id: 'FI2', grp: '플랜지 내부판', label: '인장파단' },
  { id: 'FI3', grp: '플랜지 내부판', label: '압축좌굴' },
  { id: 'FI4', grp: '플랜지 내부판', label: '지압·찢김' },
  { id: 'FI5', grp: '플랜지 내부판', label: '블록전단' },
  { id: 'WR1', grp: '웨브판', label: '지압·찢김' },
  { id: 'WP1', grp: '웨브판', label: '블록전단' },
  { id: 'WI1', grp: '웨브판', label: '항복 상호작용' },
  { id: 'WI2', grp: '웨브판', label: '파단 상호작용' },
  { id: 'WM1', grp: '부재', label: '웨브 전단항복' },
  { id: 'FM1', grp: '부재', label: '지압·찢김' },
  { id: 'FM2', grp: '부재', label: '플랜지 휨파단' },
  { id: 'FM3', grp: '부재', label: '인장항복' },
  { id: 'FM4', grp: '부재', label: '인장파단' },
  { id: 'FM5', grp: '부재', label: '블록전단' },
];

const num = (v: number | undefined, d = 0) => (v == null || !isFinite(v) ? 'N/A' : +v.toFixed(d));
const bolt = (b?: { m: number; n: number }) => (b ? `${b.m}×${b.n}` : '—');
const gauge = (g?: { g1: number; g2?: number }) => (g ? (g.g2 ? `${g.g1}/${g.g2}` : `${g.g1}`) : '—');
const plate = (p?: { t: number; w: number; L: number }) => (p ? `${p.t}×${p.w}×${p.L}` : '—');

/** 전 부재 계산요약 워크북 생성. */
export function buildCalcWorkbook(rows: SheetRow[], cond: DesignCondition): XLSX.WorkBook {
  // 실제 등장한 검토 id만 열로 채택(정규 순서 유지)
  const present = new Set<string>();
  rows.forEach(r => r.checks.forEach(c => present.add(c.id)));
  const cols = CHECK_COLS.filter(c => present.has(c.id));
  const unitOf = (id: string) => rows.flatMap(r => r.checks).find(c => c.id === id)?.unit || 'kN';
  const isK = cond.mode === 'K';   // K모드(KS전단면)만 KS라벨·계열이 존재 — 화면 결과표와 동일 정보

  // ── 입력(INPUT) 열 정의 — 화면 결과표(ResultTable)에 나타나는 항목을 모두 포함 ──
  const inputHead = [
    'No.', ...(isK ? ['KS라벨', '계열'] : []), '단면치수', 'r(mm)', '단위중량(kg/m)',
    '모재', '이음판재', '볼트', '나사부', '접합', '설계기준',
    'α강도비(%)', '발현율(%)', '판정',
    '플랜지볼트 m×n', '게이지 g(mm)', '웨브볼트 m×n', '웨브볼트피치(mm)',
    '외부이음판 t×w×L', '내부이음판 t×w×L', '웨브이음판 t×w×L',
    'Mu(kN·m)', 'Vu(kN)', 'Puf(kN)',
  ];
  const nInput = inputHead.length;

  // ── 2단 헤더(그룹 밴드 / 열 이름) ────────────────────────────────────
  const band: (string | number)[] = [];
  const head: (string | number)[] = [];
  const merges: XLSX.Range[] = [];
  const pushGroup = (title: string, labels: string[]) => {
    const start = head.length;
    labels.forEach(l => head.push(l));
    band.push(title);
    for (let i = 1; i < labels.length; i++) band.push('');
    if (labels.length > 1) merges.push({ s: { r: 1, c: start }, e: { r: 1, c: start + labels.length - 1 } });
  };
  pushGroup('입력 (INPUT)', inputHead);
  pushGroup('설계강도 φRn (OUTPUTS)', cols.map(c => `${c.grp} ${c.label}\n[${c.id} ${unitOf(c.id)}]`));
  pushGroup('검토비 DCR (소요/설계)', [...cols.map(c => `${c.id} DCR`), 'MAX DCR']);

  // ── 데이터 행 ────────────────────────────────────────────────────────
  const body: (string | number)[][] = rows.map((row, i) => {
    const r = row.result;
    const byId = new Map(row.checks.map(c => [c.id, c] as const));
    const scale = Math.min(row.flangeScale, row.webScale);
    const dcrs = row.checks.map(c => c.dcr).filter((d): d is number => d != null && isFinite(d));
    const maxDcr = dcrs.length ? Math.max(...dcrs) : undefined;
    const input: (string | number)[] = [
      i + 1,
      ...(isK ? [ksLabelOf(row.s.name) ?? '—', clsShort(ksClassOf(row.s.name))] : []),
      r.section, row.s.r, num(unitWeightOf(row.s), 1),
      steelLabel(cond.steel), steelLabel(cond.plateSteel || cond.steel),
      `${cond.bolt}-M${r.boltDia}`, cond.threadCond || 'N', cond.jointType, cond.designStd || 'AISC',
      Math.round(cond.strengthRatio * 100), scale < 1 ? Math.round(scale * 100) : 100, row.ok ? 'OK' : 'NG',
      bolt(r.flange.bolt), gauge(r.flange.gauge), bolt(r.web.bolt), r.web.Pc ?? '—',
      plate(r.flange.outerPlate), plate(r.flange.innerPlate), plate(r.web.webPlate),
      num(r.Mu_kNm), num(r.Vu_kN), num(r.Puf_kN),
    ];
    const outputs = cols.map(c => {
      const ck = byId.get(c.id);
      return ck?.phiRn == null ? 'N/A' : num(ck.phiRn, ck.unit === 'kN·m' || ck.unit === 'ratio' ? 1 : 0);
    });
    const dcrCells: (string | number)[] = [
      ...cols.map(c => { const d = byId.get(c.id)?.dcr; return d == null ? 'N/A' : num(d, 2); }),
      maxDcr == null ? 'N/A' : num(maxDcr, 2),
    ];
    return [...input, ...outputs, ...dcrCells];
  });

  // ── 제목 + 조립 ──────────────────────────────────────────────────────
  const title = `구조계산요약 — 고력볼트 표준접합  |  ${cond.member} · ${cond.jointType} · ${cond.designStd || 'AISC'}`
    + `  |  모재 ${steelLabel(cond.steel)} · 볼트 ${cond.bolt} · α${Math.round(cond.strengthRatio * 100)}%`;
  const totalCols = head.length;
  const aoa: (string | number)[][] = [[title], band, head, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 제목 병합 + 그룹 밴드 병합(위에서 계산한 것은 row 1 기준 → aoa에 title 1행이 앞서므로 +1 보정)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: nInput - 1 } },                                   // 입력 밴드
    { s: { r: 1, c: nInput }, e: { r: 1, c: nInput + cols.length - 1 } },                // 설계강도 밴드
    { s: { r: 1, c: nInput + cols.length }, e: { r: 1, c: nInput + 2 * cols.length } },  // DCR 밴드(+MAX)
  ];
  // 열 폭 — 입력 열은 라벨 기준으로 넓게, 나머지 입력 열·출력/DCR 열은 기본폭
  const WIDE_INPUT = new Set(['단면치수', '외부이음판 t×w×L', '내부이음판 t×w×L', '웨브이음판 t×w×L']);
  ws['!cols'] = head.map((label, c) => {
    if (c < nInput) return { wch: WIDE_INPUT.has(String(label)) ? 18 : 11 };
    return { wch: 9 };
  });
  ws['!freeze'] = { xSplit: 2, ySplit: 3 } as unknown as XLSX.WorkSheet['!freeze'];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '구조계산요약');
  return wb;
}

export function downloadCalcSheet(rows: SheetRow[], cond: DesignCondition, filename: string) {
  XLSX.writeFile(buildCalcWorkbook(rows, cond), filename);
}
