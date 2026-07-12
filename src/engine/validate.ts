// 골든 검증: 엔진을 부록 「보 100% SHN490 F10T」(마찰·지압)와 대조
// 플랜지 볼트배열은 신뢰도 높은 '외첨판 길이'(=행수 n을 인코딩)로 검증(mn 필드는 전사노이즈 가능).
import { designConnection } from './engine.ts';
import { GOLDEN_BEAM100_SHN490_F10T as G } from './golden_beam100_shn490_f10t.ts';
import { sectionByName } from './sections.ts';
import type { DesignCondition, JointType } from './types.ts';

const P = (p?: {t:number;w:number;L:number}) => p ? `${p.t}×${p.w}×${p.L}` : '—';

function run(jt: JointType) {
  const cond: DesignCondition = { member:'보', jointType:jt, steel:'SHN490', bolt:'F10T', strengthRatio:1.0, sectionType:'압연' };
  let fOut=0,fIn=0,wAll=0,allOK=0; const fails:string[]=[];
  for (const row of G) {
    const s = sectionByName(row.name)!; const r = designConnection(cond, s);
    const g = jt==='마찰' ? row.friction : row.bearing;
    const eW=`${r.web.bolt.m}×${r.web.bolt.n}`;
    const c = {
      fOut:P(r.flange.outerPlate)===g.flange.outer,        // 외첨판(두께·폭·길이=n)
      fIn:P(r.flange.innerPlate)===(g.flange.inner??'—'),
      wOK: eW.replace(/\.0$/,'')===g.web.mn.replace(/\.0$/,'') && (r.web.Pc??null)===g.web.Pc && P(r.web.webPlate)===g.web.plate,
    };
    if(c.fOut)fOut++; if(c.fIn)fIn++; if(c.wOK)wAll++;
    if(c.fOut&&c.fIn&&c.wOK)allOK++;
    else fails.push(`${row.name.padEnd(18)} 외:${P(r.flange.outerPlate)}/${g.flange.outer}${c.fOut?'':'✗'} 내:${P(r.flange.innerPlate)}/${g.flange.inner??'—'}${c.fIn?'':'✗'} W:${eW}Pc${r.web.Pc}/${g.web.mn}Pc${g.web.Pc} ${P(r.web.webPlate)}/${g.web.plate}${c.wOK?'':'✗'}`);
  }
  const N=G.length;
  console.log(`\n=== 보 ${jt} 100% SHN490 F10T (n=${N}) ===`);
  console.log(`외첨판(n):${fOut}/${N} 내첨판:${fIn}/${N} 웨브:${wAll}/${N}  ⇒ 전항목 ${allOK}/${N}`);
  fails.slice(0,10).forEach(f=>console.log('  '+f));
}
run('마찰');
run('지압');
