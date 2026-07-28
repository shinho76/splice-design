// 검증: 실엔진(designConnection)으로 전 W단면 내첨판이 공표 k1을 침범하지 않는지.
// 실행(레포 루트에서): node_modules/.bin/esbuild scripts/verify_k1_engine.mjs --bundle --platform=node --format=esm --packages=external --outfile=scripts/_v.mjs && node scripts/_v.mjs
import { WSECTIONS } from '../src/engine/wshapes.ts';
import { designConnection } from '../src/engine/engine.ts';

const cond = {
  member: '보', jointType: '마찰', steel: 'SS275', bolt: 'F10T',
  strengthRatio: 1.0, sectionType: '압연', gap: 10, designStd: 'AISC', profile: 'W',
};

let neg = [], noInner = 0, worst = { c: 99 };
for (const s of WSECTIONS) {
  const r = designConnection(cond, s);
  const ip = r.flange.innerPlate;
  if (!ip) { noInner++; continue; }
  // 첨판 외측edge를 플랜지끝(B/2)에 둔 최선 배치 → 내측edge = B/2 − w. 공표 k1 대비 실여유.
  const clear = +((s.B / 2 - ip.w) - s.k1).toFixed(1);
  if (clear < 0) neg.push(`${s.label}(${clear})`);
  if (clear < worst.c) worst = { c: clear, label: s.label, w: ip.w, k1: s.k1, B: s.B };
}
console.log(`전 ${WSECTIONS.length}단면 · 내첨판有 ${WSECTIONS.length - noInner} · 내첨판無 ${noInner}`);
console.log(`공표 k1 침범(실여유<0): ${neg.length}건${neg.length ? ' → ' + neg.join(', ') : ' ✅'}`);
console.log(`최소 실여유: ${worst.c}mm  (${worst.label}: B/2=${worst.B/2} − w=${worst.w} − k1=${worst.k1})`);
