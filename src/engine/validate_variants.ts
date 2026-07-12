// 파라메트릭 검증 — α(85%)·볼트등급(F13T) 일반화 확인 (부록 1/4, 19종, 마찰)
import { designConnection } from './engine.ts';
import { sectionByName } from './sections.ts';
import type { DesignCondition } from './types.ts';

interface VRow { name: string; Mu: number; fout: string; wmn: string; wpc: number | null; wpl: string; }

// 보 85% SHN490 F10T (인쇄 103, 1/4) — 마찰
const BEAM85_F10T: VRow[] = [
  { name:'H-100x100x6x8', Mu:22, fout:'9×100×410', wmn:'1×1', wpc:null, wpl:'6×60×230' },
  { name:'H-125x125x6.5x9', Mu:38, fout:'9×125×530', wmn:'1×2', wpc:null, wpl:'6×80×350' },
  { name:'H-148x100x6x9', Mu:39, fout:'12×100×410', wmn:'1×2', wpc:null, wpl:'6×80×290' },
  { name:'H-150x150x7x10', Mu:61, fout:'9×150×290', wmn:'1×2', wpc:null, wpl:'6×80×290' },
  { name:'H-198x99x4.5x7', Mu:45, fout:'9×100×410', wmn:'2×1', wpc:60, wpl:'6×140×230' },
  { name:'H-200x100x5.5x8', Mu:52, fout:'9×100×410', wmn:'2×1', wpc:60, wpl:'6×140×230' },
  { name:'H-194x150x6x9', Mu:77, fout:'9×150×290', wmn:'2×1', wpc:60, wpl:'6×140×230' },
  { name:'H-200x200x8x12', Mu:131, fout:'9×200×410', wmn:'2×1', wpc:60, wpl:'6×140×230' },
  { name:'H-200x204x12x12', Mu:141, fout:'9×200×410', wmn:'2×2', wpc:60, wpl:'9×140×350' },
  { name:'H-208x202x10x16', Mu:177, fout:'9×200×530', wmn:'2×2', wpc:60, wpl:'9×140×350' },
  { name:'H-248x124x5x8', Mu:79, fout:'9×125×530', wmn:'2×2', wpc:60, wpl:'6×140×290' },
  { name:'H-250x125x6x9', Mu:91, fout:'12×125×650', wmn:'2×2', wpc:60, wpl:'6×140×290' },
  { name:'H-244x175x7x11', Mu:139, fout:'9×175×410', wmn:'2×2', wpc:60, wpl:'6×140×170' },
  { name:'H-244x252x11x11', Mu:190, fout:'9×250×410', wmn:'2×2', wpc:60, wpl:'9×140×290' },
  { name:'H-248x249x8x13', Mu:219, fout:'9×250×530', wmn:'2×2', wpc:60, wpl:'9×140×290' },
  { name:'H-250x250x9x14', Mu:239, fout:'9×250×530', wmn:'2×2', wpc:60, wpl:'9×140×290' },
  { name:'H-250x255x14x14', Mu:258, fout:'9×250×530', wmn:'2×2', wpc:60, wpl:'12×140×290' },
  { name:'H-298x149x5.5x8', Mu:118, fout:'9×150×290', wmn:'2×1', wpc:120, wpl:'6×200×170' },
  { name:'H-300x150x6.5x9', Mu:135, fout:'9×150×290', wmn:'3×1', wpc:60, wpl:'6×200×170' },
];
// 보 100% SHN490 F13T (인쇄 123, 1/4) — 마찰
const BEAM100_F13T: VRow[] = [
  { name:'H-100x100x6x8', Mu:26, fout:'9×100×410', wmn:'1×1', wpc:null, wpl:'6×60×230' },
  { name:'H-125x125x6.5x9', Mu:45, fout:'12×125×530', wmn:'1×2', wpc:null, wpl:'6×80×350' },
  { name:'H-148x100x6x9', Mu:46, fout:'12×100×410', wmn:'1×2', wpc:null, wpl:'6×80×290' },
  { name:'H-150x150x7x10', Mu:72, fout:'9×150×290', wmn:'1×2', wpc:null, wpl:'9×80×290' },
  { name:'H-198x99x4.5x7', Mu:53, fout:'12×100×410', wmn:'2×1', wpc:60, wpl:'6×140×230' },
  { name:'H-200x100x5.5x8', Mu:61, fout:'12×100×410', wmn:'2×1', wpc:60, wpl:'6×140×230' },
  { name:'H-194x150x6x9', Mu:90, fout:'9×150×290', wmn:'2×1', wpc:60, wpl:'6×140×230' },
  { name:'H-200x200x8x12', Mu:154, fout:'9×200×410', wmn:'2×1', wpc:60, wpl:'6×140×230' },
  { name:'H-200x204x12x12', Mu:165, fout:'9×200×410', wmn:'2×2', wpc:60, wpl:'9×140×350' },
  { name:'H-208x202x10x16', Mu:208, fout:'12×200×410', wmn:'2×2', wpc:60, wpl:'9×140×350' },
  { name:'H-248x124x5x8', Mu:93, fout:'12×125×530', wmn:'2×1', wpc:60, wpl:'6×140×170' },
  { name:'H-250x125x6x9', Mu:107, fout:'12×125×530', wmn:'2×2', wpc:60, wpl:'6×140×290' },
  { name:'H-244x175x7x11', Mu:163, fout:'9×175×290', wmn:'2×1', wpc:60, wpl:'9×140×170' },
  { name:'H-244x252x11x11', Mu:224, fout:'9×250×410', wmn:'2×2', wpc:60, wpl:'12×140×290' },
  { name:'H-248x249x8x13', Mu:257, fout:'9×250×530', wmn:'2×1', wpc:60, wpl:'9×140×170' },
  { name:'H-250x250x9x14', Mu:281, fout:'9×250×530', wmn:'2×2', wpc:60, wpl:'9×140×290' },
  { name:'H-250x255x14x14', Mu:304, fout:'9×250×530', wmn:'2×2', wpc:60, wpl:'14×140×290' },
  { name:'H-298x149x5.5x8', Mu:139, fout:'9×150×290', wmn:'2×1', wpc:120, wpl:'6×200×170' },
  { name:'H-300x150x6.5x9', Mu:159, fout:'9×150×290', wmn:'2×1', wpc:120, wpl:'6×200×170' },
];
const P = (p?:{t:number;w:number;L:number}) => p?`${p.t}×${p.w}×${p.L}`:'—';

function run(label: string, rows: VRow[], cond: DesignCondition) {
  let mu=0,fo=0,w=0,all=0; const fails:string[]=[];
  for (const g of rows) {
    const r = designConnection(cond, sectionByName(g.name)!);
    const ew = `${r.web.bolt.m}×${r.web.bolt.n}`;
    const cMu = Math.abs(r.Mu_kNm-g.Mu)<=Math.max(2,g.Mu*0.03);
    const cFo = P(r.flange.outerPlate)===g.fout;
    const cW = ew===g.wmn && (r.web.Pc??null)===g.wpc && P(r.web.webPlate)===g.wpl;
    if(cMu)mu++; if(cFo)fo++; if(cW)w++; if(cFo&&cW)all++;
    if(!(cFo&&cW)) fails.push(`  ${g.name.padEnd(18)} Mu${r.Mu_kNm}/${g.Mu} 외:${P(r.flange.outerPlate)}/${g.fout}${cFo?'':'✗'} W:${ew}Pc${r.web.Pc}/${g.wmn}Pc${g.wpc} ${P(r.web.webPlate)}/${g.wpl}${cW?'':'✗'}`);
  }
  const N=rows.length;
  console.log(`\n=== ${label} (n=${N}) ===`);
  console.log(`Mu:${mu}/${N}  외첨판:${fo}/${N}  웨브:${w}/${N}  ⇒ 전항목 ${all}/${N}`);
  fails.forEach(f=>console.log(f));
}
run('보 85% SHN490 F10T 마찰', BEAM85_F10T, { member:'보', jointType:'마찰', steel:'SHN490', bolt:'F10T', strengthRatio:0.85, sectionType:'압연' });
run('보 100% SHN490 F13T 마찰', BEAM100_F13T, { member:'보', jointType:'마찰', steel:'SHN490', bolt:'F13T', strengthRatio:1.0, sectionType:'압연' });
