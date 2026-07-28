// 진단: 실엔진으로 H형강(73단면×4조합) 플랜지 내첨판·웨브 첨판의 필렛 침범 여부.
// 실행(레포 루트에서): node_modules/.bin/esbuild scripts/diag_hshape_fillet.mjs --bundle --platform=node --format=esm --packages=external --outfile=scripts/_h.mjs && node scripts/_h.mjs
import { SECTIONS } from '../src/engine/sections.ts';
import { designConnection } from '../src/engine/engine.ts';

// 보/기둥 · 마찰/지압 4조합 전부 검사(웨브 chum이 조합별로 달라질 수 있음)
const combos = [
  ['보', '마찰'], ['보', '지압'], ['기둥', '마찰'], ['기둥', '지압'],
];
const base = { steel: 'SS275', bolt: 'F10T', strengthRatio: 1.0, sectionType: '압연', gap: 10, designStd: 'KBC', profile: 'H' };

let flangeNeg = [], flangeMinBelow3 = [], webNeg = [], noInner = 0, worstF = { c: 99 }, worstW = { c: 99 };
let count = 0;
for (const s of SECTIONS) {
  const toe = s.tw / 2 + s.r;                 // KS 단일반경 필렛선단(정확)
  const T = s.H - 2 * (s.tf + s.r);           // 필렛 사이 플랫 웨브
  for (const [member, jointType] of combos) {
    count++;
    const r = designConnection({ ...base, member, jointType }, s);
    // ① 플랜지 내첨판 실여유 = (B/2 − innerW) − 필렛선단
    const ip = r.flange.innerPlate;
    if (!ip) { noInner++; }
    else {
      const cf = +((s.B / 2 - ip.w) - toe).toFixed(1);
      if (cf < 0) flangeNeg.push(`${s.name}[${member}·${jointType}] ${cf}`);
      else if (cf < 3) flangeMinBelow3.push(`${s.name}[${member}·${jointType}] ${cf}`);
      if (cf < worstF.c) worstF = { c: cf, tag: `${s.name}[${member}·${jointType}]`, w: ip.w, toe: +toe.toFixed(1), B: s.B };
    }
    // ② 웨브 첨판 실여유(양단 각각) = (T − chum)/2
    const wp = r.web.webPlate;
    if (wp) {
      const cw = +((T - wp.w) / 2).toFixed(1);
      if (cw < 0) webNeg.push(`${s.name}[${member}·${jointType}] chum=${wp.w} T=${T.toFixed(0)} → ${cw}`);
      if (cw < worstW.c) worstW = { c: cw, tag: `${s.name}[${member}·${jointType}]`, chum: wp.w, T: +T.toFixed(0) };
    }
  }
}

console.log(`검사 ${count}건 (${SECTIONS.length}단면 × 4조합)`);
console.log('\n① 플랜지 내첨판 ↔ 필렛(tw/2+r)');
console.log(`  침범(<0): ${flangeNeg.length}건${flangeNeg.length ? '\n    ' + flangeNeg.join('\n    ') : ' ✅'}`);
console.log(`  여유<3mm(설계의도 미달): ${flangeMinBelow3.length}건${flangeMinBelow3.length ? '\n    ' + flangeMinBelow3.join('\n    ') : ' ✅'}`);
console.log(`  최소 실여유: ${worstF.c}mm (${worstF.tag}: B/2=${worstF.B/2} − w=${worstF.w} − toe=${worstF.toe})`);
console.log('\n② 웨브 첨판 ↔ 필렛(플랫 T=H−2(tf+r))');
console.log(`  침범(<0): ${webNeg.length}건${webNeg.length ? '\n    ' + webNeg.join('\n    ') : ' ✅'}`);
console.log(`  최소 실여유(양단): ${worstW.c}mm (${worstW.tag}: chum=${worstW.chum} T=${worstW.T})`);

// ③ 캘리브레이션 r이 물리적으로 타당한지(과소 r → 필렛선단 과소평가 위험) 스캔
const rHigh = SECTIONS.filter(s => s.propSource !== 'ks').map(s => ({ n: s.name, r: s.r, tf: s.tf, ratio: +(s.r / s.tf).toFixed(2) }));
console.log(`\n③ 비-KS(캘리브레이션) 단면 ${rHigh.length}건 · r/tf 분포 min ${Math.min(...rHigh.map(x=>x.ratio))} ~ max ${Math.max(...rHigh.map(x=>x.ratio))}`);
