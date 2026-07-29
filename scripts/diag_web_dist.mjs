// 진단: 웨브 휨분배 flange(플랜지전담·현재) vs inertia(I값분배) — 웨브볼트 수·첨판중량 전단면 비교.
// 실행(레포 루트): node_modules/.bin/esbuild scripts/diag_web_dist.mjs --bundle --platform=node --format=esm --packages=external --outfile=scripts/_d.mjs && node scripts/_d.mjs
import { catalogFor } from '../src/engine/sections.ts';
import { designConnection } from '../src/engine/engine.ts';
import { quantityOf } from '../src/engine/quantity.ts';

for (const profile of ['H', 'W']) {
  const base = { steel: 'SS275', bolt: 'F10T', strengthRatio: 1.0, sectionType: '압연', gap: 10, profile, designStd: 'KBC', member: '보', jointType: '마찰' };
  let wF = 0, wI = 0, pF = 0, pI = 0, fF = 0, fI = 0, n = 0, up = 0;
  for (const s of catalogFor(profile)) {
    const rf = designConnection({ ...base, webDist: 'flange' }, s);
    const ri = designConnection({ ...base, webDist: 'inertia' }, s);
    wF += rf.web.bolt.count * 2; wI += ri.web.bolt.count * 2;
    fF += rf.flange.bolt.count; fI += ri.flange.bolt.count;
    pF += quantityOf(rf, base).plateWeightKg; pI += quantityOf(ri, base).plateWeightKg;
    if (ri.web.bolt.count > rf.web.bolt.count) up++;
    n++;
  }
  console.log(`\n【${profile} · ${n}단면 · 보/마찰/SS275/100%】`);
  console.log(`  웨브볼트(양면): flange ${wF} → inertia ${wI}  (+${((wI / wF - 1) * 100).toFixed(0)}%)  · 증가단면 ${up}/${n}`);
  console.log(`  플랜지볼트(편): flange ${fF} → inertia ${fI}  (${((fI / fF - 1) * 100).toFixed(0)}%)`);
  console.log(`  첨판중량:       flange ${pF.toFixed(0)}kg → inertia ${pI.toFixed(0)}kg  (+${((pI / pF - 1) * 100).toFixed(0)}%)`);
}
