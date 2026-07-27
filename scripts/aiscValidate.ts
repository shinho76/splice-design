// AISC 재작성 엔진 수치 검증 (개발용) — npx tsx scripts/aiscValidate.ts
import { designConnection } from '../src/engine/engine.ts';
import { sectionByName, SECTIONS } from '../src/engine/sections.ts';
import { aiscRun } from '../src/engine/aisc/run.ts';
import type { DesignCondition } from '../src/engine/types.ts';

const cond: DesignCondition = {
  member: '보', jointType: '마찰', steel: 'SN355', plateSteel: 'SN355',
  bolt: 'F10T', strengthRatio: 1.0, sectionType: '압연',
  designStd: 'AISC', threadCond: 'N', gap: 10,
};

function dump(name: string) {
  const sec = sectionByName(name)!;
  const r = designConnection(cond, sec);
  const res = aiscRun(r, cond);
  console.log(`\n══ ${name}  Mu=${r.Mu_kNm} Vu=${r.Vu_kN} Puf=${r.Puf_kN}  볼트 M${r.boltDia} 플랜지 ${r.flange.bolt.m}×${r.flange.bolt.n} 웨브 ${r.web.bolt?.m}×${r.web.bolt?.n}`);
  console.log(`   demand: Pf=${(res.demand.Pf/1e3).toFixed(0)}kN half=${(res.demand.half/1e3).toFixed(0)} Vu=${(res.demand.Vu/1e3).toFixed(0)} Mux=${(res.demand.MuxWeb/1e6).toFixed(1)}kNm e=${res.demand.e.toFixed(0)}`);
  console.log(`   지배: ${res.govId} DCR=${res.govDcr} ok=${res.ok}`);
  for (const c of res.checks) {
    const pr = c.phiRn != null ? c.phiRn.toFixed(1) : '—';
    const dm = c.demand != null ? c.demand.toFixed(1) : '—';
    const dcr = c.dcr != null ? c.dcr.toFixed(2) : '—';
    const flag = c.ok === false ? ' ✗NG' : '';
    console.log(`   ${c.id.padEnd(4)} ${c.label.padEnd(22)} φRn=${pr.padStart(8)} D=${dm.padStart(8)} DCR=${dcr}${flag}  [${c.clause}] ${c.unit ?? ''}`);
  }
}

dump('H-400x200x8x13');
dump('H-300x150x6.5x9');
dump('H-808x302x16x30');

// 전 단면 지배분포 요약
const counts: Record<string, number> = {};
let ng = 0;
for (const s of SECTIONS) {
  const r = designConnection(cond, s);
  const res = aiscRun(r, cond);
  counts[res.govId] = (counts[res.govId] ?? 0) + 1;
  if (!res.ok) ng++;
}
console.log('\n── 73단면 지배검토 분포 ──');
console.log(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));
console.log(`NG(자동보정 전) 단면수: ${ng}/${SECTIONS.length}`);
