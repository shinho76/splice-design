// 기둥 검증: 엔진(designConnection, member=기둥)을 부록 「기둥 100% SHN490 F10T」와 대조
import { designConnection } from './engine.ts';
import { GOLDEN_COL100_SHN490_F10T as G } from './golden_col100_shn490_f10t.ts';
import { sectionByName } from './sections.ts';
import type { DesignCondition, JointType } from './types.ts';

const P = (p?: {t:number;w:number;L:number}) => p ? `${p.t}×${p.w}×${p.L}` : '—';

function run(jt: JointType) {
  const cond: DesignCondition = { member:'기둥', jointType:jt, steel:'SHN490', bolt:'F10T', strengthRatio:1.0, sectionType:'압연' };
  let nc=0,fOut=0,wAll=0,allOK=0; const fails:string[]=[];
  for (const row of G) {
    const s = sectionByName(row.name)!; const r = designConnection(cond, s);
    const g = jt==='마찰' ? row.friction : row.bearing;
    const eW=`${r.web.bolt.m}×${r.web.bolt.n}`;
    const c = {
      nc: Math.abs(r.Puf_kN - row.Nc) <= Math.max(2, row.Nc*0.02),
      fOut: P(r.flange.outerPlate)===g.fout,
      wOK: eW.replace(/\.0$/,'')===g.wmn.replace(/\.0$/,'') && (r.web.Pc??null)===g.wpc && P(r.web.webPlate)===g.wpl,
    };
    if(c.nc)nc++; if(c.fOut)fOut++; if(c.wOK)wAll++;
    if(c.fOut&&c.wOK)allOK++;
    else fails.push(`${row.name.padEnd(18)} Nc${r.Puf_kN}/${row.Nc}${c.nc?'':'✗'} 외:${P(r.flange.outerPlate)}/${g.fout}${c.fOut?'':'✗'} W:${eW}Pc${r.web.Pc}/${g.wmn}Pc${g.wpc} ${P(r.web.webPlate)}/${g.wpl}${c.wOK?'':'✗'}`);
  }
  const N=G.length;
  console.log(`\n=== 기둥 ${jt} 100% SHN490 F10T (n=${N}) ===`);
  console.log(`축력 Nc(±2%):${nc}/${N}  외첨판(n):${fOut}/${N}  웨브:${wAll}/${N}  ⇒ 전항목(외+웨브) ${allOK}/${N}`);
  fails.slice(0,40).forEach(f=>console.log('  '+f));
}
run('마찰');
run('지압');
