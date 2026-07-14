// 접합부 계측·간섭 검토 — 3D 뷰어용. 볼트간격·연단거리·플레이트길이·내첨판/필렛 간섭·AISC 설치여유.
// 좌표계는 connParts와 동일(X=폭, Y=높이, Z=축). 값은 최종 확정 수치에서 산출.
import type { DesignResult } from './types.ts';
import { parseName, sectionByName } from './sections.ts';

export type DimRegion = 'flange' | 'web';
export interface DimAnno { label: string; a: [number, number, number]; b: [number, number, number]; region: DimRegion; }
export interface CheckItem { label: string; value: string; limit: string; ok: boolean; note?: string; }
export interface ConnChecks { dims: DimAnno[]; checks: CheckItem[]; db: number; }

// AISC 기준(근사·호칭경 mm) — 최소 연단거리 J3.4M, 조임여유(Table 7-16 근사)
const AISC_EDGE: Record<number, number> = { 16: 22, 20: 26, 22: 28, 24: 30, 27: 34, 30: 38 };
const AISC_WRENCH: Record<number, number> = { 16: 30, 20: 35, 22: 38, 24: 42, 27: 47, 30: 52 }; // 조임 소켓 여유(중심→장애물)

export function connChecks(r: DesignResult): ConnChecks {
  const { H, tw, tf } = parseName(r.section);
  const fr = sectionByName(r.section)?.r ?? Math.round(tf * 0.9);
  const db = r.boltDia;
  const gap = r.flange.gap ?? 10, base = gap / 2 + 40;
  const g1 = r.flange.gauge?.g1 ?? 90, g2 = r.flange.gauge?.g2 ?? 0;
  const fB = r.flange.bolt, wB = r.web.bolt, nHi = Math.ceil(fB.n), nLo = Math.floor(fB.n);
  const stag = r.flange.staggered ?? false;
  const pitchF = stag ? 90 : (r.flange.pitch ?? 60); // 플랜지 볼트 피치(엇모=90, Custom 대구경 상향)
  const colY = fB.m === 2 ? [-g1 / 2, g1 / 2] : [-(g1 / 2 + g2), -g1 / 2, g1 / 2, g1 / 2 + g2];
  const flangeZ = Array.from({ length: nHi }, (_, i) => base + i * pitchF);   // 대표(짝수열)
  const zEndStag = stag ? base + 45 + (nLo - 1) * 90 : 0;
  const zEnd = Math.max(flangeZ[flangeZ.length - 1], zEndStag);   // 최외곽 볼트 Z
  const Pc = r.web.Pc ?? 60;
  const webY = Array.from({ length: wB.m }, (_, i) => (i - (wB.m - 1) / 2) * Pc);
  const outer = r.flange.outerPlate, inner = r.flange.innerPlate, web = r.web.webPlate;
  const oL = outer?.L ?? 260, oW = outer?.w ?? H;
  const yTop = H / 2 + (outer?.t ?? 9);              // 외첨판 윗면(라벨 배치)
  const filletToe = tw / 2 + fr;                     // 필렛 끝단 X

  const rnd = (n: number) => Math.round(n);
  const EP = 3;                                                     // 면에서 살짝 띄움(붙임)
  const gMax = Math.max(...colY.map(v => Math.abs(v)));             // 최외곽 게이지
  const pos = colY.filter(c => c > 0); const inCxPos = pos.reduce((a, b) => a + b, 0) / pos.length;
  const inInnerX = inCxPos - (inner?.w ?? 0) / 2;                   // 내첨판 안쪽 X
  const webT = web?.t ?? 6, webL = web?.L ?? 170, webW = web?.w ?? 200;
  const webZ = Array.from({ length: wB.n }, (_, i) => base + i * (r.web.pitch ?? 60));
  const zc = Math.max(...webZ), yr = webY.length ? Math.max(...webY.map(v => Math.abs(v))) : 0;
  // 각 plate 면 좌표(붙일 기준면)
  const yT = yTop + EP;                                            // 상부 외첨판 윗면
  const yIF = -(H / 2 - tf) + EP;                                  // 하부 플랜지 안쪽면(내첨판끝~필렛)
  const yIB = -(H / 2 - tf) + (inner?.t ?? 0) + EP;                // 하부 내첨판 안쪽면
  const xW = tw / 2 + webT + EP;                                   // 웨브 첨판 근접면

  const dims: DimAnno[] = [];
  const F = (o: Omit<DimAnno, 'region'>): DimAnno => ({ ...o, region: 'flange' });
  const Wd = (o: Omit<DimAnno, 'region'>): DimAnno => ({ ...o, region: 'web' });
  const OUT = 15;                         // 외곽 치수선 이격
  const oT = outer?.t ?? 9, gp = r.flange.gap ?? 10;

  // ── 플랜지(상부 외첨판) : 길이=+X변, 폭/게이지=Z끝, 두께/갭=−X변 ──
  const xE = oW / 2 + OUT, zEn = -oL / 2 - OUT, zEp = oL / 2 + OUT;
  dims.push(F({ label: `외첨판 L=${oL}`, a: [xE, yT, -oL / 2], b: [xE, yT, oL / 2] }));
  if (nHi > 1) dims.push(F({ label: `피치 ${pitchF}${stag ? '(엇모)' : ''}`, a: [0, yT, flangeZ[0]], b: [0, yT, flangeZ[1]] }));
  dims.push(F({ label: `연단 ${rnd(oL / 2 - zEnd)}`, a: [0, yT, zEnd], b: [0, yT, oL / 2] }));
  dims.push(F({ label: `외첨판폭 ${oW}`, a: [-oW / 2, yT, zEn], b: [oW / 2, yT, zEn] }));
  dims.push(F({ label: `g₁=${g1}`, a: [-g1 / 2, yT, zEp], b: [g1 / 2, yT, zEp] }));
  if (g2) dims.push(F({ label: `g₂=${g2}`, a: [g1 / 2, yT, zEp], b: [g1 / 2 + g2, yT, zEp] }));
  dims.push(F({ label: `연단(직각) ${rnd(oW / 2 - gMax)}`, a: [gMax, yT, zEp], b: [oW / 2, yT, zEp] }));
  dims.push(F({ label: `외첨판t ${oT}`, a: [-oW / 2 - OUT, H / 2, zEn], b: [-oW / 2 - OUT, H / 2 + oT, zEn] }));
  dims.push(F({ label: `갭 ${gp}`, a: [-oW / 2 - OUT, yT, -gp / 2], b: [-oW / 2 - OUT, yT, gp / 2] }));
  // ── 플랜지(하부 내첨판) ──
  if (inner) {
    dims.push(F({ label: `내첨판끝~필렛 ${(inInnerX - filletToe).toFixed(1)}`, a: [filletToe, yIF, 0], b: [inInnerX, yIF, 0] }));
    dims.push(F({ label: `내첨판폭 ${inner.w}`, a: [inCxPos - inner.w / 2, yIB, -inner.L / 2 - OUT], b: [inCxPos + inner.w / 2, yIB, -inner.L / 2 - OUT] }));
    dims.push(F({ label: `내첨판t ${inner.t}`, a: [inCxPos + inner.w / 2 + OUT, -(H / 2 - tf), inner.L / 2], b: [inCxPos + inner.w / 2 + OUT, -(H / 2 - tf) + inner.t, inner.L / 2] }));
  }

  // ── 웨브 첨판 : 세로=Z끝변, 가로=Y끝변, 두께=모서리 ──
  const zWr = webL / 2 + OUT, zWl = -webL / 2 - OUT, yWb = -webW / 2 - OUT, yWt = webW / 2 + OUT;
  dims.push(Wd({ label: `웨브 H=${webW}`, a: [xW, -webW / 2, zWr], b: [xW, webW / 2, zWr] }));
  if (webY.length > 1) dims.push(Wd({ label: `Pc=${Pc}`, a: [xW, webY[0], zWl], b: [xW, webY[1], zWl] }));
  dims.push(Wd({ label: `연단 ${rnd(webW / 2 - yr)}`, a: [xW, yr, zWl], b: [xW, webW / 2, zWl] }));
  dims.push(Wd({ label: `연단 ${rnd(webW / 2 - yr)}`, a: [xW, -yr, zWl], b: [xW, -webW / 2, zWl] }));
  dims.push(Wd({ label: `웨브 L=${webL}`, a: [xW, yWb, -webL / 2], b: [xW, yWb, webL / 2] }));
  dims.push(Wd({ label: `가로볼트 ${2 * webZ[0]}`, a: [xW, yWt, -webZ[0]], b: [xW, yWt, webZ[0]] }));
  dims.push(Wd({ label: `연단 ${rnd(webL / 2 - zc)}`, a: [xW, yWt, zc], b: [xW, yWt, webL / 2] }));
  dims.push(Wd({ label: `연단 ${rnd(webL / 2 - zc)}`, a: [xW, yWt, -zc], b: [xW, yWt, -webL / 2] }));
  if (webZ.length > 1) dims.push(Wd({ label: `가로피치 ${webZ[1] - webZ[0]}`, a: [xW, yWb, webZ[0]], b: [xW, yWb, webZ[1]] }));
  dims.push(Wd({ label: `웨브판t ${webT}`, a: [tw / 2, yWb, zWl], b: [tw / 2 + webT, yWb, zWl] }));
  dims.push(Wd({ label: `갭 ${gp}`, a: [xW, yr + 18, -gp / 2], b: [xW, yr + 18, gp / 2] }));
  // 하부 내첨판 윗면 ~ 최하단 웨브볼트 중심(연직)
  if (inner && webY.length) {
    const inTop = -(H / 2 - tf) + inner.t, lowWb = Math.min(...webY);
    dims.push(Wd({ label: `내첨판~웨브볼트 ${rnd(lowWb - inTop)}`, a: [xW, inTop, -webZ[0]], b: [xW, lowWb, -webZ[0]] }));
  }

  const checks: CheckItem[] = [];
  const yn = (ok: boolean) => ok;
  // 1) 내첨판 안쪽 ↔ 필렛 끝단 간섭
  if (inner) {
    const pos = colY.filter(c => c > 0); const cx = pos.reduce((a, b) => a + b, 0) / pos.length;
    const innerInner = cx - inner.w / 2;
    const clr = innerInner - filletToe;
    checks.push({ label: '내첨판 안쪽 ↔ 필렛 끝단', value: `틈 ${clr.toFixed(1)}mm`, limit: '≥ 0 (여유권장 ≥3)', ok: yn(clr >= 0), note: clr < 0 ? '필렛과 간섭 — 내첨판 폭/게이지 조정 필요' : clr < 3 ? '여유 부족' : '' });
  }
  // 2) 볼트 피치 ≥ AISC 최소(2.667·db)
  const pitch = flangeZ.length > 1 ? flangeZ[1] - flangeZ[0] : 0;
  if (pitch) checks.push({ label: '플랜지 볼트 피치', value: `${pitch}mm`, limit: `≥ ${(2.667 * db).toFixed(0)} (3d=${3 * db})`, ok: yn(pitch >= 2.667 * db) });
  // 3) 연단거리 ≥ AISC J3.4M
  const edge = Math.round(oL / 2 - zEnd);
  checks.push({ label: '연단거리(볼트→판끝)', value: `${edge}mm`, limit: `≥ ${AISC_EDGE[db] ?? '—'}`, ok: yn(edge >= (AISC_EDGE[db] ?? 0)) });
  // 4) 게이지 절반 ↔ 필렛(설치 소켓여유)
  const wrenchClr = g1 / 2 - filletToe;
  checks.push({ label: '조임 소켓여유(내측볼트→필렛)', value: `${wrenchClr.toFixed(1)}mm`, limit: `≥ ${AISC_WRENCH[db] ?? '—'} (AISC 7-16)`, ok: yn(wrenchClr >= (AISC_WRENCH[db] ?? 0)), note: wrenchClr < (AISC_WRENCH[db] ?? 0) ? '임팩트렌치 진입 간섭 우려' : '' });
  // 5) 웨브 볼트 상하피치
  if (webY.length > 1) checks.push({ label: '웨브 볼트 피치', value: `${Pc}mm`, limit: `≥ ${(2.667 * db).toFixed(0)}`, ok: yn(Pc >= 2.667 * db) });
  // 6) 플레이트 전체 길이(참고)
  checks.push({ label: '플레이트 길이(외/내/웨브)', value: `${outer?.L ?? '—'} / ${inner?.L ?? '—'} / ${web?.L ?? '—'}`, limit: '참고', ok: true });

  return { dims, checks, db };
}
