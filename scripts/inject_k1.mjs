// 일회성: WSECTIONS 각 항목에 AISC 공표 k1(mm) 주입(r 필드 뒤). 재실행 안전(이미있음 skip).
// 실행(레포 루트에서): node_modules/.bin/esbuild scripts/inject_k1.mjs --bundle --platform=node --format=esm --packages=external --outfile=scripts/_inj.mjs && node scripts/_inj.mjs
// AISC DB 경로는 기본 상대(형제폴더 12_splice_design). 다르면 AISC_DB 환경변수로 지정.
import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';

const IN = 25.4;
const DB = process.env.AISC_DB ?? '../12_splice_design/aisc-shapes-database-v160-2 (1).xlsx';
const wb = XLSX.read(readFileSync(DB), { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Database v16.0'], { defval: null });
const k1map = new Map();
for (const r of rows) {
  const label = r['AISC_Manual_Label'];
  const k1 = r['k1'];
  if (label && k1 != null && k1 !== '–' && k1 !== '-')
    k1map.set(String(label).toUpperCase(), +(Number(k1) * IN).toFixed(1));
}

const path = 'src/engine/wshapes.ts';
const src = readFileSync(path, 'utf8');
let injected = 0, missing = [], already = 0;
const out = src.split('\n').map(line => {
  const m = line.match(/label: '([^']+)'/);
  if (!m) return line;
  if (/\bk1:/.test(line)) { already++; return line; }
  const k1 = k1map.get(m[1].toUpperCase());
  if (k1 == null) { missing.push(m[1]); return line; }
  // r: <num>, 뒤에 k1 삽입
  const nl = line.replace(/(\br: [\d.]+,)/, `$1 k1: ${k1},`);
  if (nl !== line) injected++;
  return nl;
}).join('\n');

writeFileSync(path, out);
console.log(`주입 ${injected} / 이미있음 ${already} / 미매칭 ${missing.length}${missing.length ? ' → ' + missing.join(',') : ''}`);
