// SC(전단접합 단일판) 구조계산요약(Excel) — SheetJS. calcSheet.ts(스플라이스)와 동일 패턴.
//   전 부재 1행. 열 그룹: 입력(INPUT) · 설계강도(OUTPUTS, φRn) · 검토비(DCR).
import * as XLSX from 'xlsx';
import type { DesignCondition } from '../types.ts';
import type { ShearResult } from './singlePlate.ts';
import { steelLabel } from '../materials.ts';

// 한계상태 검토 열의 정규 순서·그룹·한글 약칭(singlePlate.ts id 기준). 실제 등장한 id만 열로 출력한다.
const CHECK_COLS: { id: string; grp: string; label: string }[] = [
  { id: 'SB1', grp: '볼트', label: '전단(편심)' },
  { id: 'SB2', grp: '볼트', label: '미끄럼' },
  { id: 'SR1', grp: '지압·찢김', label: '전단판' },
  { id: 'SR2', grp: '지압·찢김', label: '보웨브' },
  { id: 'SR3', grp: '지압·찢김(수평)', label: '전단판' },
  { id: 'SR4', grp: '지압·찢김(수평)', label: '보웨브' },
  { id: 'SP1', grp: '전단판', label: '전단항복' },
  { id: 'SP2', grp: '전단판', label: '전단파단' },
  { id: 'SP3', grp: '전단판', label: '휨항복' },
  { id: 'SP4', grp: '전단판', label: '휨파단' },
  { id: 'SP5', grp: '전단판', label: '전단+휨 항복' },
  { id: 'SP8', grp: '전단판', label: '전단+휨 파단' },
  { id: 'SP6', grp: '전단판', label: '블록전단' },
  { id: 'SP7', grp: '전단판', label: '두께 연성' },
  { id: 'SM1', grp: '보 웨브', label: '전단항복' },
];

const num = (v: number | undefined, d = 0) => (v == null || !isFinite(v) ? 'N/A' : +v.toFixed(d));
const SUBTYPE_LABEL: Record<ShearResult['subtype'], string> = {
  'beam-beam': '보-보', 'beam-col-strong': '보-기둥(강축)', 'beam-col-weak': '보-기둥(약축)',
};

/** 전 부재 계산요약 워크북 생성. */
export function buildShearCalcWorkbook(rows: ShearResult[], cond: DesignCondition): XLSX.WorkBook {
  const present = new Set<string>();
  rows.forEach(r => r.checks.forEach(c => present.add(c.id)));
  const cols = CHECK_COLS.filter(c => present.has(c.id));
  const unitOf = (id: string) => rows.flatMap(r => r.checks).find(c => c.id === id)?.unit || 'kN';

  const inputHead = [
    'No.', '단면치수', '구분', '배치', '모재', '이음판재', '볼트', 'Vu(kN)',
    'e,bolt(mm)', 'e,plate(mm)', '볼트열(NC×NR)', '전단판(t×L×w)', '판>T', '판정',
  ];
  const nInput = inputHead.length;

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

  const body: (string | number)[][] = rows.map((r, i) => {
    const byId = new Map(r.checks.map(c => [c.id, c] as const));
    const input: (string | number)[] = [
      i + 1, r.section, SUBTYPE_LABEL[r.subtype], r.config === 'Extended' ? '확장' : '일반',
      steelLabel(cond.steel), steelLabel(cond.plateSteel || cond.steel), `${cond.bolt}-${r.boltName}`,
      num(r.V_kN), num(r.eBolt), num(r.ePlate), `${r.NC}×${r.NR}`,
      `${r.plate.t}×${r.plate.L}×${r.plate.w}`, r.fitsWeb ? '—' : `초과(T=${num(r.clearH)})`,
      r.ok ? 'OK' : 'NG',
    ];
    const outputs = cols.map(c => { const ck = byId.get(c.id); return ck?.phiRn == null ? 'N/A' : num(ck.phiRn, ck.unit === 'kN·m' || ck.unit === 'ratio' ? 1 : 0); });
    const dcrCells: (string | number)[] = [...cols.map(c => { const d = byId.get(c.id)?.dcr; return d == null ? 'N/A' : num(d, 2); }), num(r.govDcr, 2)];
    return [...input, ...outputs, ...dcrCells];
  });

  const title = `SC 구조계산요약 — 전단접합(단일판)  |  ${SUBTYPE_LABEL[rows[0]?.subtype ?? 'beam-beam']}  |  모재 ${steelLabel(cond.steel)} · 볼트 ${cond.bolt} · α${Math.round(cond.strengthRatio * 100)}%`;
  const totalCols = head.length;
  const aoa: (string | number)[][] = [[title], band, head, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: nInput - 1 } },
    { s: { r: 1, c: nInput }, e: { r: 1, c: nInput + cols.length - 1 } },
    { s: { r: 1, c: nInput + cols.length }, e: { r: 1, c: nInput + 2 * cols.length } },
  ];
  const WIDE = new Set(['단면치수', '전단판(t×L×w)', '판>T']);
  ws['!cols'] = head.map((label, c) => {
    if (c < nInput) return { wch: WIDE.has(String(label)) ? 18 : 11 };
    return { wch: 9 };
  });
  ws['!freeze'] = { xSplit: 2, ySplit: 3 } as unknown as XLSX.WorkSheet['!freeze'];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SC구조계산요약');
  return wb;
}

export function downloadShearCalcSheet(rows: ShearResult[], cond: DesignCondition, filename: string) {
  XLSX.writeFile(buildShearCalcWorkbook(rows, cond), filename);
}
