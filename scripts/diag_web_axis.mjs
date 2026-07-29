// 진단: 최적화 ON에서 웨브 첨판 축방향 연단(축연단) 부족 전면 점검.
import { catalogFor } from '../src/engine/sections.ts';
import { designConnection } from '../src/engine/engine.ts';
import { aiscAutoCorrect } from '../src/engine/aisc/compat.ts';
import { connParts } from '../src/engine/connParts.ts';
const COMBOS=[['보','마찰'],['보','지압'],['기둥','마찰'],['기둥','지압']];
for(const profile of ['W','H']){
  for(const af of [false,true]){
    let bad=[];
    for(const s of catalogFor(profile)) for(const [m,j] of COMBOS){
      const cond={steel:'SS275',bolt:'F10T',strengthRatio:1.0,sectionType:'압연',gap:10,profile,designStd:'AISC',member:m,jointType:j};
      let r=designConnection(cond,s); if(af) r=aiscAutoCorrect(r,cond).result;
      const cp=connParts(r); const xB=cp.bolts.filter(b=>b.axis==='x');
      const czs=xB.map(b=>Math.abs(b.cz)); const box=cp.boxes.find(b=>b.kind==='web');
      if(box&&czs.length){ const e=box.sz/2-Math.max(...czs); if(e<38) bad.push(`${s.label??s.name}[${m[0]}${j[0]}] 축연단=${e.toFixed(0)}`); }
    }
    console.log(`【${profile} · 최적화 ${af?'ON':'OFF'}】 축연단부족(<38): ${bad.length}건`, bad.slice(0,6).join(' | '));
  }
}
