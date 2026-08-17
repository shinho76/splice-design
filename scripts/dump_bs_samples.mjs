// 세 샘플 단면의 블록전단 파단선 기하 덤프 (H-450x200 1열, H-700x300 엇모, H-400x400 2열)
import { sectionByName } from '../src/engine/sections.ts';
import { designConnection } from '../src/engine/engine.ts';
import { aiscOptimize } from '../src/engine/aisc/optimize.ts';

const base = {
  member: '보', jointType: '마찰', steel: 'SN355', plateSteel: 'SM355', bolt: 'F10T',
  strengthRatio: 1.0, sectionType: '압연', gap: 10, designStd: 'AISC', threadCond: 'N',
  profile: 'H', sectionSet: 'all', equalPlateT: true, plateShare: '5050', bsShare: 'balanced',
};

const samples = [
  { name: 'H-450x200x9x14', dia: 20, noStagger: true,  tag: '플랜지 1열배치' },
  { name: 'H-700x300x13x24', dia: undefined, noStagger: false, tag: '플랜지 엇모배치' },
  { name: 'H-400x400x13x21', dia: undefined, noStagger: true,  tag: '플랜지 2열배치' },
];

for (const s of samples) {
  const cond = { ...base, noStagger: s.noStagger };
  const sec = sectionByName(s.name);
  const r0 = designConnection(cond, sec, s.dia);
  const opt = aiscOptimize(r0, cond);
  const rep = opt.report;
  console.log('\n════════════════════════════════════════════════════════');
  console.log(`■ ${s.name}  (${s.tag})  d=M${r0.boltDia}`);
  console.log(`  Mu=${r0.Mu_kNm} kNm  Vu=${r0.Vu_kN} kN  Puf=${r0.Puf_kN} kN`);
  console.log(`  flange bolts m=${opt.result.flange.bolt.m} n=${opt.result.flange.bolt.n} stag=${opt.result.flange.staggered}`);
  console.log(`  web bolts m=${opt.result.web.bolt.m} n=${opt.result.web.bolt.n}`);
  console.log(`  outerPlate=${JSON.stringify(opt.result.flange.outerPlate)}`);
  console.log(`  innerPlate=${JSON.stringify(opt.result.flange.innerPlate)}`);
  console.log(`  webPlate=${JSON.stringify(opt.result.web.webPlate)}`);
  console.log(`  gauge g1=${opt.result.flange.gauge?.g1} g2=${opt.result.flange.gauge?.g2}  pitch=${opt.result.flange.pitch} edge=${opt.result.flange.edge}`);
  for (const c of rep.checks) {
    if (c.cases && c.cases.length && c.bsGeom) {
      const g = c.bsGeom;
      console.log(`\n  ── ${c.id} (${c.clause}) [${c.region ?? ''}] cols=[${g.cols.map(v=>v.toFixed(0)).join(',')}] hw=${g.halfWidth.toFixed(0)} edge=${g.edge} pitch=${g.pitch} nHi=${g.nHi} nLo=${g.nLo} stag=${!!g.staggered} vert=${!!g.vertical} plates=${g.plates} dh=${g.dh}`);
      for (const bc of c.cases) {
        console.log(`      ${bc.path}  key=${bc.key} Ubs=${bc.Ubs} frac=${bc.frac} phiRn=${(bc.phiRn/1e3).toFixed(0)}kN dcr=${bc.dcr}${bc.gov?'  ◀GOV':''}`);
      }
    }
  }
  console.log(`\n  govId=${rep.govId} govDcr=${rep.govDcr} ok=${rep.ok}`);
}
