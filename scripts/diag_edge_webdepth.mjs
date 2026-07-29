// 진단: (#3) 플랜지 첨판 볼트 연단거리 부족, (#4) 웨브 첨판 춤이 부재 춤/필렛플랫 초과.
// 실행(레포 루트): node_modules/.bin/esbuild scripts/diag_edge_webdepth.mjs --bundle --platform=node --format=esm --packages=external --outfile=scripts/_e.mjs && node scripts/_e.mjs
import { SECTIONS, catalogFor } from '../src/engine/sections.ts';
import { designConnection } from '../src/engine/engine.ts';
import { aiscAutoCorrect } from '../src/engine/aisc/compat.ts';
import { connParts } from '../src/engine/connParts.ts';
import { parseName, sectionByName } from '../src/engine/sections.ts';

const COMBOS = [['보', '마찰'], ['보', '지압'], ['기둥', '마찰'], ['기둥', '지압']];
const base = { steel: 'SS275', bolt: 'F10T', strengthRatio: 1.0, sectionType: '압연', gap: 10, designStd: 'AISC' };
const EDGE_MIN = 38;   // 최소 연단(설계 40 − 반올림여유 2)
const FCL = 8;

function check(r, tag, out) {
  const { H, tf } = parseName(r.section);
  const sec = sectionByName(r.section);
  const rr = sec?.r ?? 0;
  const cp = connParts(r);
  // 플랜지 첨판 박스(outer/inner) 길이(sz) 대비 y축 볼트 cz 최대
  const yB = cp.bolts.filter(b => b.axis === 'y');
  const maxCz = yB.length ? Math.max(...yB.map(b => Math.abs(b.cz))) : 0;
  for (const box of cp.boxes.filter(b => b.kind === 'outer' || b.kind === 'inner')) {
    const edge = box.sz / 2 - maxCz;
    if (edge < EDGE_MIN) { out.edge.push(`${tag} ${box.kind} L=${box.sz} maxZ=${maxCz.toFixed(0)} edge=${edge.toFixed(0)}`); break; }
  }
  // 웨브 첨판 박스(춤 sy) 대비 부재 춤 H, 필렛플랫 cap
  const flat = H - 2 * (tf + rr);
  const cap = flat - 2 * FCL;
  for (const box of cp.boxes.filter(b => b.kind === 'web')) {
    if (box.sy > H) out.overH.push(`${tag} 춤=${box.sy} > H=${H}`);
    else if (box.sy > cap + 0.5) out.overCap.push(`${tag} 춤=${box.sy} > cap=${cap.toFixed(0)}(flat=${flat.toFixed(0)})`);
    break;
  }
}

for (const profile of ['W', 'H']) {
  for (const [af, lbl] of [[false, '설계(최적화 OFF)'], [true, '최적화 ON']]) {
    const out = { edge: [], overH: [], overCap: [] };
    for (const s of catalogFor(profile)) {
      for (const [member, jointType] of COMBOS) {
        const cond = { ...base, member, jointType, profile };
        let r = designConnection(cond, s);
        if (af) r = aiscAutoCorrect(r, cond).result;
        check(r, `${s.label ?? s.name}[${member[0]}${jointType[0]}]`, out);
      }
    }
    console.log(`\n【${profile} · ${lbl}】`);
    console.log(`  #3 연단부족(<${EDGE_MIN}): ${out.edge.length}건`, out.edge.slice(0, 6).join(' | '));
    console.log(`  #4 춤>부재H: ${out.overH.length}건`, out.overH.slice(0, 6).join(' | '));
    console.log(`  #4 춤>필렛cap: ${out.overCap.length}건`, out.overCap.slice(0, 4).join(' | '));
  }
}
