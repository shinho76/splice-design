import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import CheckFig from '../src/components/CheckFig.tsx';
import { sectionByName } from '../src/engine/sections.ts';
import { designConnection } from '../src/engine/engine.ts';
import { aiscOptimize } from '../src/engine/aisc/optimize.ts';
const cond = { member:'보',jointType:'마찰',steel:'SN355',plateSteel:'SM355',bolt:'F10T',strengthRatio:1.0,sectionType:'압연',gap:10,designStd:'AISC',threadCond:'N',profile:'H',sectionSet:'all',equalPlateT:true,plateShare:'5050',bsShare:'balanced',noStagger:true };
const opt = aiscOptimize(designConnection(cond, sectionByName('H-450x200x9x14'), 20), cond);
const SC = process.env.SC;
let n=0;
for (const id of ['FP5','FI5','FM5','WP1']) {
  const c = opt.report.checks.find(x=>x.id===id); if(!c) continue;
  const html = renderToStaticMarkup(React.createElement(CheckFig, { c, lang:'ko' }));
  const svgs = html.match(/<svg[\s\S]*?<\/svg>/g) || [];
  svgs.forEach((s,i)=>{ const f=`${SC}/cf_${id}_${i}.svg`; writeFileSync(f, s.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ')); n++; });
  console.log(id, svgs.length, 'panels');
}
console.log('total', n);
