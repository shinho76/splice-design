// 검증: 최적화 결과가 국소최소(철판 최소)인지 — 각 판을 한 단계 얇게/한 행 줄여도 통과하면 slack(과설계).
// 실행(레포 루트): node_modules/.bin/esbuild scripts/verify_weight_min.mjs --bundle --platform=node --format=esm --packages=external --outfile=scripts/_w.mjs && node scripts/_w.mjs
import { catalogFor } from '../src/engine/sections.ts';
import { designConnection } from '../src/engine/engine.ts';
import { aiscAutoCorrect } from '../src/engine/aisc/compat.ts';
import { aiscRun } from '../src/engine/aisc/run.ts';

const FT = [9, 10, 12, 14, 16, 19, 22, 25, 28, 32, 36, 40, 45, 50, 55, 60];
const WT = [6, 8, 9, 10, 12, 14, 16, 19, 22, 25, 28, 32, 36, 40, 45, 50];
const prev = (v, s) => { const i = s.indexOf(v); return i > 0 ? s[i - 1] : null; };
const base = { steel: 'SS275', bolt: 'F10T', strengthRatio: 1.0, sectionType: '압연', gap: 10, designStd: 'AISC' };
const COMBOS = [['보', '마찰'], ['보', '지압'], ['기둥', '마찰'], ['기둥', '지압']];

function passes(res, cond, fS, wS) { return aiscRun(res, cond, { flangeScale: fS, webScale: wS }).ok; }

for (const profile of ['W', 'H']) {
  let checked = 0, slackAny = 0, saveKg = 0;
  const eg = [];
  for (const s of catalogFor(profile)) {
    for (const [member, jointType] of COMBOS) {
      const cond = { ...base, member, jointType, profile };
      const o = aiscAutoCorrect(designConnection(cond, s), cond);
      if (!o.ok) continue;
      checked++;
      const r = o.result, fS = o.flangeScale, wS = o.webScale;
      let slack = false, save = 0;
      const density = 7.85e-6;
      // 각 판 한 단계 감소 시도
      const tries = [];
      if (r.flange.outerPlate) tries.push(['outer', r.flange.outerPlate, FT, 1]);
      if (r.flange.innerPlate) tries.push(['inner', r.flange.innerPlate, FT, 2]);
      if (r.web.webPlate) tries.push(['web', r.web.webPlate, WT, 2]);
      for (const [, pl, series, mult] of tries) {
        const t0 = pl.t, t1 = prev(t0, series);
        if (t1 == null) continue;
        pl.t = t1;
        if (passes(r, cond, fS, wS)) { slack = true; save += mult * (t0 - t1) * pl.w * pl.L * density; }
        pl.t = t0;
      }
      // 볼트행 -1 시도
      const n0 = Math.round(r.flange.bolt.n);
      if (n0 > 2) { r.flange.bolt = { ...r.flange.bolt, n: n0 - 1 }; if (passes(r, cond, fS, wS)) slack = true; r.flange.bolt = { ...r.flange.bolt, n: n0 }; }
      if (slack) { slackAny++; saveKg += save; if (eg.length < 8) eg.push(`${s.label ?? s.name}[${member[0]}${jointType[0]}] ~${save.toFixed(1)}kg`); }
    }
  }
  console.log(`【${profile}】 통과 ${checked}건 중 국소slack(더 줄일 여지) ${slackAny}건 (${(slackAny/checked*100).toFixed(1)}%) · 잠재절감 합 ${saveKg.toFixed(0)}kg`);
  if (eg.length) console.log('   예:', eg.join(' | '));
}
