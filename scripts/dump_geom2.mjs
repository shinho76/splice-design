import { sectionByName, parseName } from '../src/engine/sections.ts';
import { designConnection } from '../src/engine/engine.ts';
import { aiscOptimize } from '../src/engine/aisc/optimize.ts';
const base={member:'보',jointType:'마찰',steel:'SN355',plateSteel:'SM355',bolt:'F10T',strengthRatio:1.0,sectionType:'압연',gap:10,designStd:'AISC',threadCond:'N',profile:'H',sectionSet:'all',equalPlateT:true,plateShare:'5050',bsShare:'balanced'};
for(const s of [['H-450x200x9x14',20,true],['H-700x300x13x24',undefined,false],['H-400x400x13x21',undefined,true]]){
  const cond={...base,noStagger:s[2]}; const r=aiscOptimize(designConnection(cond,sectionByName(s[0]),s[1]),cond).result;
  const d=parseName(s[0]);
  console.log(JSON.stringify({name:s[0],B:d.B,H:d.H,tw:d.tw,tf:d.tf,dia:r.boltDia,
    flange:{m:r.flange.bolt.m,n:r.flange.bolt.n,stag:r.flange.staggered,g1:r.flange.gauge?.g1,g2:r.flange.gauge?.g2,pitch:r.flange.pitch,edge:r.flange.edge,outer:r.flange.outerPlate,inner:r.flange.innerPlate},
    web:{m:r.web.bolt.m,n:r.web.bolt.n,Pc:r.web.Pc,pitch:r.web.pitch,edge:r.web.edge,plate:r.web.webPlate}}));
}
