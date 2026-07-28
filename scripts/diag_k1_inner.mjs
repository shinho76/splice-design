// 진단: 내첨판 필렛선단 근사(tw/2+r) vs AISC 공표 k1 + INNER_CLEAR 3→6mm 영향.
// 실행(레포 루트에서): node_modules/.bin/esbuild scripts/diag_k1_inner.mjs --bundle --platform=node --format=esm --packages=external --outfile=scripts/_diag.mjs && node scripts/_diag.mjs
// AISC DB 경로는 기본 상대(형제폴더 12_splice_design). 다르면 AISC_DB 환경변수로 지정.
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { WSECTIONS } from '../src/engine/wshapes.ts';

// ── AISC DB 로드 ──
const DB = process.env.AISC_DB ?? '../12_splice_design/aisc-shapes-database-v160-2 (1).xlsx';
const wb = XLSX.read(readFileSync(DB), { type: 'buffer' });
const sh = wb.Sheets['Database v16.0'];
const rows = XLSX.utils.sheet_to_json(sh, { defval: null });
const IN = 25.4;
// label -> published k1 (in) 매핑
const k1map = new Map();
for (const r of rows) {
  const label = r['AISC_Manual_Label'];
  if (!label) continue;
  const k1 = r['k1'];
  if (k1 != null && k1 !== '–' && k1 !== '-') k1map.set(String(label).toUpperCase(), Number(k1) * IN);
}

// ── 유의점1: k1 근사(tw/2+r) vs 공표 k1 ──
let matched = 0, missing = [];
const k1diffs = [];
for (const s of WSECTIONS) {
  const pk1 = k1map.get(String(s.label).toUpperCase());
  if (pk1 == null) { missing.push(s.label); continue; }
  matched++;
  const approx = s.tw / 2 + s.r;          // 코드가 쓰는 필렛선단
  k1diffs.push({ label: s.label, approx: +approx.toFixed(1), pub: +pk1.toFixed(1), diff: +(pk1 - approx).toFixed(1) });
}
k1diffs.sort((a, b) => b.diff - a.diff);
const dv = k1diffs.map(d => d.diff);
const mean = dv.reduce((a, b) => a + b, 0) / dv.length;
console.log('===== 유의점1: k1 근사(tw/2+r) vs AISC 공표 k1 =====');
console.log(`매칭 ${matched} / 미매칭 ${missing.length}${missing.length ? ' → ' + missing.slice(0,8).join(',') : ''}`);
console.log(`diff = 공표k1 − 근사(tw/2+r):  min ${Math.min(...dv).toFixed(1)}  mean ${mean.toFixed(2)}  max ${Math.max(...dv).toFixed(1)} mm`);
console.log(`공표k1 > 근사 (여유 축소측) 건수: ${dv.filter(x => x > 0).length}`);
console.log(`공표k1 ≥ 근사+3 (실효여유 ≤0 위험) 건수: ${dv.filter(x => x >= 3).length}`);
console.log('상위 10 (공표k1이 근사보다 큰 = 여유 가장 축소):');
for (const d of k1diffs.slice(0, 10)) console.log(`  ${d.label.padEnd(9)} 근사 ${d.approx}  공표 ${d.pub}  Δ+${d.diff}`);
console.log('하위 5 (공표k1이 근사보다 작은 = 여유 오히려 큼):');
for (const d of k1diffs.slice(-5)) console.log(`  ${d.label.padEnd(9)} 근사 ${d.approx}  공표 ${d.pub}  Δ${d.diff}`);

// ── 유의점2: INNER_CLEAR 3 → 6 영향 (innerW 변화) ──
// 로직 재현: flatHalf = B/2 - (tw/2+r) - CLEAR;  innerW = max(10, floor(flatHalf/10)*10)
// std.innerW != null 조건은 flangeStdFor(B) 소관 — 여기선 모든 단면 대상 최댓값 영향으로 근사.
function innerW(B, tw, r, clear) {
  const flatHalf = B / 2 - (tw / 2 + r) - clear;
  return Math.max(10, Math.floor(flatHalf / 10) * 10);
}
console.log('\n===== 유의점2: INNER_CLEAR 3→6mm 영향 (전 W단면) =====');
let changed = [], same = 0;
for (const s of WSECTIONS) {
  const w3 = innerW(s.B, s.tw, s.r, 3);
  const w6 = innerW(s.B, s.tw, s.r, 6);
  if (w3 !== w6) changed.push({ label: s.label, B: s.B, w3, w6, d: w3 - w6 });
  else same++;
}
console.log(`변화 없음 ${same} / 폭 감소 ${changed.length}  (전 ${WSECTIONS.length}단면)`);
const byDrop = {};
for (const c of changed) byDrop[c.d] = (byDrop[c.d] || 0) + 1;
console.log('감소량 분포:', Object.entries(byDrop).map(([k, v]) => `${k}mm:${v}건`).join('  '));
console.log('영향 단면(폭 감소) 전체 목록:');
for (const c of changed.sort((a,b)=>a.B-b.B)) console.log(`  ${c.label.padEnd(9)} B=${c.B}  ${c.w3}→${c.w6} (−${c.d})`);

// 최소 실효여유(6mm 기준) 점검: 6mm 적용 후에도 innerW가 10mm까지 줄어드는 협소단면?
const tiny = WSECTIONS.filter(s => innerW(s.B, s.tw, s.r, 6) <= 20).map(s => s.label);
console.log(`\n6mm 적용 후 innerW ≤ 20mm(협소) 단면: ${tiny.length}${tiny.length ? ' → ' + tiny.join(',') : ''}`);

// ── 실침범 정량화: 첨판 외측edge를 플랜지끝(B/2)에 두었을 때 내측edge가 공표k1을 확보하는가 ──
// realClear = (B/2 − innerW) − k1_pub.  음수 = 필렛 침범.
console.log('\n===== 실침범(공표k1 기준) 정량화 — 첨판 외측을 플랜지끝에 배치한 최선 케이스 =====');
function realClear(s, clear, useK1) {
  const pk1 = k1map.get(String(s.label).toUpperCase());
  const toe = useK1 ? pk1 : (s.tw / 2 + s.r);
  const flatHalf = s.B / 2 - toe - clear;
  const w = Math.max(10, Math.floor(flatHalf / 10) * 10);
  return { w, clear: +((s.B / 2 - w) - pk1).toFixed(1) };   // 공표k1 대비 실여유
}
for (const [tag, clear, useK1] of [['현재(근사, C=3)', 3, false], ['근사 C=6', 6, false], ['공표k1 C=3', 3, true], ['공표k1 C=6', 6, true]]) {
  const rc = WSECTIONS.map(s => realClear(s, clear, useK1).clear);
  const neg = rc.filter(x => x < 0);
  console.log(`${tag.padEnd(14)}  실여유 min ${Math.min(...rc).toFixed(1)}  mean ${(rc.reduce((a,b)=>a+b,0)/rc.length).toFixed(1)}  침범(<0) ${neg.length}건`);
}
