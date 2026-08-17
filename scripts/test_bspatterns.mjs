import { blockShearPaths } from '../src/engine/aisc/bsPatterns.ts';
const base = { t:19, dh:22, Fy:325, Fu:490, plates:1, edge:40 };
const samples = [
  { tag:'H450 외부(1열)', kind:'outer', lines:[-60,60], n:4, pitch:60, ym:100, ...base },
  { tag:'H400 외부(2열)', kind:'outer', lines:[-160,-75,75,160], n:4, pitch:60, ym:200, ...base, dh:24 },
  { tag:'H700 외부(엇모)', kind:'outer', lines:[-115,-65,65,115], n:3, pitch:90, staggered:true, nHi:3, nLo:3, ym:150, ...base, dh:24, t:28 },
  { tag:'H450 내부(1열)', kind:'inner', lines:[-60,60], n:4, pitch:60, ym:100, innerEdge:25, outerEdge:95, plates:1, edge:40, t:19, dh:22, Fy:325, Fu:490 },
  { tag:'H400 내부(2열)', kind:'inner', lines:[-160,-75,75,160], n:4, pitch:60, ym:200, innerEdge:35, outerEdge:195, plates:1, edge:40, t:19, dh:24, Fy:325, Fu:490 },
  { tag:'H450 웨브(1열)', kind:'web', lines:[-30,30], n:3, pitch:120, ym:145, plates:2, edge:40, t:12, dh:22, Fy:325, Fu:490 },
];
for (const s of samples) {
  console.log('\n■', s.tag);
  for (const p of blockShearPaths(s)) {
    console.log(`  ${p.label.padEnd(8)} Ubs${p.ubs} Agv=${p.Agv.toFixed(0)} Anv=${p.Anv.toFixed(0)} Ant=${p.Ant.toFixed(0)} φRn=${(p.phiRn/1e3).toFixed(0)}kN shear=${p.shear.length}면 tearPolys=${p.tear.length}`);
  }
}
