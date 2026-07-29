// 진단: 실무 표준시리즈 확장 + 캡 제거 시 DCR<1.0 도달 여부 전면 진단.
// 실행(레포 루트): node_modules/.bin/esbuild scripts/diag_optimize_caps.mjs --bundle --platform=node --format=esm --packages=external --outfile=scripts/_o.mjs && node scripts/_o.mjs
import { SECTIONS, catalogFor } from '../src/engine/sections.ts';
import { designConnection } from '../src/engine/engine.ts';
import { aiscOptimize } from '../src/engine/aisc/optimize.ts';

const COMBOS = [['보', '마찰'], ['보', '지압'], ['기둥', '마찰'], ['기둥', '지압']];
const base = { steel: 'SS275', bolt: 'F10T', strengthRatio: 1.0, sectionType: '압연', gap: 10, designStd: 'AISC' };

function classify(o) {
  if (!o.ok) return { k: 'fail', gov: o.report.govId, ratio: 0 };
  const ratio = Math.min(o.flangeScale, o.webScale);
  if (o.memberLimited || ratio < 0.999) return { k: 'partial', gov: o.report.govId, ratio };
  return { k: 'full', gov: o.report.govId, ratio: 1 };
}

function sweep(profile, limits, label) {
  const cat = catalogFor(profile);
  let full = 0, partial = 0, fail = 0;
  const partials = [], fails = [], govCount = {};
  let wtSum = 0, wt0Sum = 0, wtUp = [];
  for (const s of cat) {
    for (const [member, jointType] of COMBOS) {
      const r0 = designConnection({ ...base, member, jointType, profile }, s);
      const o = aiscOptimize(r0, { ...base, member, jointType, profile }, limits);
      const c = classify(o);
      wt0Sum += o.wt0; wtSum += o.wt1;
      if (o.wt1 > o.wt0 * 3 + 5) wtUp.push(`${s.label ?? s.name}[${member[0]}${jointType[0]}] ${o.wt0.toFixed(1)}→${o.wt1.toFixed(1)}kg`);
      if (c.k === 'full') full++;
      else if (c.k === 'partial') { partial++; partials.push({ tag: `${s.label ?? s.name}[${member[0]}${jointType[0]}]`, gov: c.gov, ratio: c.ratio }); govCount[c.gov] = (govCount[c.gov] || 0) + 1; }
      else { fail++; fails.push(`${s.label ?? s.name}[${member[0]}${jointType[0]}] gov=${c.gov}`); govCount[c.gov] = (govCount[c.gov] || 0) + 1; }
    }
  }
  const n = cat.length * COMBOS.length;
  console.log(`\n【${profile} · ${label}】 ${n}건 = 완전강도 ${full} · 부분강도 ${partial} · 실패 ${fail}`);
  console.log(`  지배분포:`, Object.entries(govCount).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(' '));
  if (fails.length) console.log(`  ⚠ 실패(캡핑으로도 미해결):`, fails.slice(0, 12).join(' | '));
  if (wtUp.length) console.log(`  중량 급증(×3+):`, wtUp.length, '건', wtUp.slice(0,5).join(' '));
  return { full, partial, fail, partials, n };
}

for (const profile of ['W', 'H']) {
  const cap = sweep(profile, { maxRows: 12, maxWebCols: 4 }, '생산캡(행≤12,새시리즈)');
  const unc = sweep(profile, { maxRows: 24, maxWebCols: 6 }, '캡제거(행≤24,열≤6)');
  // 캡 제거로 부분강도→완전강도 전환된 건(=레버 부족이 원인이던 것)
  const capP = new Map(cap.partials.map(p => [p.tag, p]));
  const flipped = [...capP.keys()].filter(t => !unc.partials.find(p => p.tag === t));
  console.log(`  ▶ 캡제거로 완전강도 전환: ${flipped.length}건${flipped.length ? ' → ' + flipped.slice(0,10).join(', ') : ''}`);
  // 캡 제거 후에도 남는 부분강도(=진짜 부재지배) 요약: 최저비율 5건
  const worst = [...unc.partials].sort((a,b)=>a.ratio-b.ratio).slice(0,8);
  console.log(`  ▶ 잔여 부분강도(부재지배) 최저비율:`, worst.map(w=>`${w.tag} ${w.gov} ${(w.ratio*100).toFixed(0)}%`).join(' | '));
}
