// SC(전단판 접합, 2면전단) 상세도 DXF 생성기 — GS(engine/dxf.ts)의 R12 저수준 프리미티브를 그대로
// 재사용(newDoc/wrap/pen/mkXf/dimChain*)해 신규 레이어·검증 로직을 중복 만들지 않는다.
// 참조 CAD 2건을 템플릿으로 삼는다: docs/shear connection_detail_01.dxf(RIB·GUSSET 조견표·연단거리)
// + 사용자 제공 400200.dxf 샘플(필렛 있는 부재 단면·파단선·MEMBER/Web PL./Web Bolt 3행 정보표 형식).
// 세 표현(2D SVG·3D·DXF)이 항상 같은 ShearResult 필드에서 파생되므로 서로 어긋나지 않는다.
import type { DesignCondition } from '../types.ts';
import type { ShearResult } from './singlePlate.ts';
import { sectionByName } from '../sections.ts';
import { holeDia } from '../aisc/constants.ts';
import {
  newDoc, wrap, pen, mkXf, dimChainH, dimChainV, emitDim, round, TH, FONT,
  type Doc, type Pen,
} from '../dxf.ts';

const SUPPORT_T_MARGIN = 3;   // 지지부재 임의 단면(플랜지폭·필렛)을 부재 자체 치수에서 살짝 여유만 두고 재사용

/** 필렛 있는 H형강 단면 윤곽(입면이 아닌 정면 단면 — 400200.dxf 샘플의 지지부재 표현과 동일 방식)을
 *  중심(cx,cy)에 그린다. 지지부재는 SC 엔진이 산정하지 않으므로, 연결 부재 자신의 tw/tf/r을 그대로
 *  재사용한 스케치(춤만 +200 임의 확대)다 — hShape()(ShearViewer.tsx)와 동일한 4모서리 필렛 로직. */
function drawIProfile(P: Pen, cx: number, cy: number, B: number, D: number, tw: number, tf: number, r: number, layer: string) {
  const b = B / 2, h = D / 2, w = tw / 2, yi = h - tf;
  const rr = Math.max(0, Math.min(r, yi - 1, b - w - 1));
  const L = (x1: number, y1: number, x2: number, y2: number) => P.line(cx + x1, cy + y1, cx + x2, cy + y2, layer);
  const A = (x: number, y: number, a0: number, a1: number) => P.arc(cx + x, cy + y, rr, a0, a1, layer);
  L(-b, h, b, h);                          // 상부 플랜지 상단
  L(b, h, b, yi);                          // 우측 플랜지 외측
  L(b, yi, w + rr, yi);                    // 상부 플랜지 하단(우)
  if (rr > 0) A(w + rr, yi - rr, 90, 180);
  L(w, yi - rr, w, -(yi - rr));            // 웨브 우측
  if (rr > 0) A(w + rr, -(yi - rr), 180, 270);
  L(w + rr, -yi, b, -yi);                  // 하부 플랜지 상단(우)
  L(b, -yi, b, -h);                        // 우측 플랜지 외측(하)
  L(b, -h, -b, -h);                        // 하부 플랜지 하단
  L(-b, -h, -b, -yi);                      // 좌측 플랜지 외측(하)
  L(-b, -yi, -(w + rr), -yi);              // 하부 플랜지 상단(좌)
  if (rr > 0) A(-(w + rr), -(yi - rr), 270, 360);
  L(-w, -(yi - rr), -w, yi - rr);          // 웨브 좌측
  if (rr > 0) A(-(w + rr), yi - rr, 0, 90);
  L(-(w + rr), yi, -b, yi);                // 상부 플랜지 하단(좌)
  L(-b, yi, -b, h);                        // 좌측 플랜지 외측(상, 폐합)
}

/** 부재 파단선(fracture line) — 400200.dxf 샘플의 지그재그 표시. 도면이 실제 부재 끝이 아니라
 *  임의 위치에서 잘려 계속됨을 나타내는 관용 기호(위·아래 플랜지 각각). */
function breakLine(P: Pen, x: number, yTop: number, yBot: number, layer: string) {
  const dx = 8, dy = 10;
  for (const y of [yTop, yBot]) {
    P.line(x - dx, y - dy, x + dx, y - dy / 3, layer);
    P.line(x + dx, y - dy / 3, x - dx, y + dy / 3, layer);
    P.line(x - dx, y + dy / 3, x + dx, y + dy, layer);
  }
}

/** 전단판(2면전단) 상세도 DXF(R12) 문자열 생성. */
export function toDXFShear(r: ShearResult, cond: DesignCondition): string {
  const sec = sectionByName(r.section);
  const H = sec?.H ?? 0, B = sec?.B ?? 0, tf = sec?.tf ?? 0, tw = sec?.tw ?? 0, fr = sec?.r ?? 0;
  const { NC, NR, Pc, a, gap, sh, Lev, Leh, plate, gussetT, ribT, supportDepth, boltDia: dia } = r;
  const dh = holeDia(dia);

  const colZ = NC === 2 ? [a, a + sh] : [a];
  const rowY = Array.from({ length: NR }, (_, i) => (i - (NR - 1) / 2) * Pc);

  const doc: Doc = newDoc();
  const t0 = mkXf(0, 0, 0);   // 회전 없음(SC는 보 접합 하나뿐, GS의 보/기둥 90°분기 불필요)
  const P = pen(doc, t0);

  // x=0(GUSSET PLATE 원단=전단판 시작) 기준 음수(왼쪽)=지지부재→RIB→GUSSET, 양수(오른쪽)=전단판·보.
  const xSupInner = -(ribT + gussetT), xRibEnd = -gussetT;
  const supB = B + 2 * SUPPORT_T_MARGIN;
  const xSupCx = xSupInner - supB / 2;

  // ── View1: 전단판 입면도(피지지보 측면) ──
  const y0 = 0;   // 입면도 기준 y(부재 중심선)
  const topMargin = Math.max(supportDepth, H) / 2;
  P.text(xSupCx - supB / 2, y0 + topMargin + 60, TH, '전단판 입면도 (피지지보 측면)', 'NOTE');
  P.text(xSupCx - supB / 2, y0 + topMargin + 30, TH * 0.8, '지지부재·RIB·GUSSET 미산정(연결 부재 단면을 임의 재사용)', 'NOTE');

  // 지지부재(임의 표시) — 필렛 있는 단면(연결 부재 tw/tf/r 재사용, 춤만 +200)
  drawIProfile(P, xSupCx, y0, supB, supportDepth, tw, tf, fr, 'MAIN');
  P.text(xSupCx, y0 + supportDepth / 2 + 8, TH * 0.8, `지지부재(임의) H'=${round(supportDepth)}`, 'NOTE', { align: 'c' });

  // RIB PLATE(있으면)
  if (ribT > 0) {
    P.rect(xSupInner, y0 - plate.L / 2, ribT, plate.L, 'WEB_PL');
    P.text((xSupInner + xRibEnd) / 2, y0 + plate.L / 2 + 8, TH * 0.8, `RIB t${ribT}`, 'NOTE', { align: 'c' });
  }
  // GUSSET PLATE
  P.rect(xRibEnd, y0 - plate.L / 2, -xRibEnd, plate.L, 'WEB_PL');
  P.text(xRibEnd / 2, y0 - plate.L / 2 - 8 - TH * 0.8, TH * 0.8, `GUSSET t${gussetT}`, 'NOTE', { align: 'c' });

  // 피지지보 플랜지대(측면) — 부재 끝은 지지면에서 갭만큼 물러나 전단판이 갭 구간을 덮는다.
  // 원단(오른쪽)은 실제 부재 끝이 아니라 파단선으로 절단 표시(400200.dxf 관례).
  const breakX = plate.w + 90;
  P.rect(gap, y0 + H / 2 - tf, breakX - gap, tf, 'MAIN');
  P.rect(gap, y0 - H / 2, breakX - gap, tf, 'MAIN');
  P.line(gap, y0 - H / 2 - 10, gap, y0 + H / 2 + 10, 'HIDDEN');
  P.text(gap, y0 + H / 2 + 16, TH * 0.8, `gap ${gap}`, 'NOTE', { align: 'c' });
  breakLine(P, breakX, y0 + H / 2 - tf / 2, y0 - H / 2 + tf / 2, 'MAIN');

  // 전단판(양측 2매 — 입면에서는 겹쳐 보임)
  P.rect(0, y0 - plate.L / 2, plate.w, plate.L, 'FLG_PL');
  P.text(plate.w / 2, y0 + plate.L / 2 + 8, TH * 0.8, '전단판 ×2', 'NOTE', { align: 'c' });

  // 볼트(구멍)
  for (const cz of colZ) for (const ry of rowY) P.circle(cz, y0 + ry, dh / 2, 'BOLT');

  // 치수체인 — 수직(margin,Pc..,margin) / 수평(a,sh,Leh)
  const ys = [y0 + plate.L / 2, ...rowY.slice().reverse(), y0 - plate.L / 2];
  dimChainV(doc, t0, ys, plate.w + 40, plate.w + 70, plate.w + 140);
  const xs = NC === 2 ? [0, a, a + sh, plate.w] : [0, a, plate.w];
  dimChainH(doc, t0, xs, y0 - plate.L / 2 - 40, y0 - plate.L / 2 - 70, y0 - plate.L / 2 - 140);
  // 부재 춤(H) 참고 치수 — 파단선 우측(400200.dxf처럼 별도 열에 표시), 단일 치수라 emitDim 직접 사용
  emitDim(doc, t0, [breakX + 60, y0 + H / 2], [breakX + 60, y0 - H / 2], [breakX + 90, 0], `${round(H)}`, true);

  // ── View2: 볼트 단면 상세(2면전단) — View1 아래쪽에 배치 ──
  const secY = y0 - topMargin - 260;
  const secW = 2 * plate.t + tw;
  P.text(-secW / 2, secY + 60, TH, '볼트 단면 상세 (2면전단)', 'NOTE');
  const sx0 = -secW / 2, sx1 = sx0 + plate.t, sx2 = sx1 + tw, sx3 = sx2 + plate.t;
  const sh2 = 60;
  P.rect(sx0, secY - sh2 / 2, plate.t, sh2, 'FLG_PL');
  P.rect(sx1, secY - sh2 / 2, tw, sh2, 'WEB_PL');
  P.rect(sx2, secY - sh2 / 2, plate.t, sh2, 'FLG_PL');
  P.circle(sx0 - 10, secY, dh / 2, 'BOLT');
  P.line(sx0, secY, sx3, secY, 'BOLT');
  dimChainH(doc, t0, [sx0, sx1, sx2, sx3], secY - sh2 / 2 - 30, secY - sh2 / 2 - 55, secY - sh2 / 2 - 110);

  // ── 정보표(MEMBER / Web PL. / Web Bolt — 400200.dxf 샘플과 동일한 3행 형식) ──
  const tbY = secY - 220;
  const rows: [string, string, string][] = [
    ['MEMBER', r.section, cond.steel],
    ['Web PL.', `PL. ${plate.t}x${plate.L}x${plate.w}x2EA`, cond.plateSteel ?? cond.steel],
    ['Web Bolt', `${r.boltCount}-M${dia} H.T.B`, ''],
  ];
  const c0 = -secW / 2, c1 = c0 + 140, c2 = c1 + 340;
  rows.forEach(([l, v1, v2], i) => {
    const y = tbY - i * 34;
    P.text(c0, y, TH * 0.9, l, 'MINI_BOX');
    P.text(c1, y, TH * 0.9, v1, 'MINI_BOX');
    if (v2) P.text(c2, y, TH * 0.9, v2, 'MINI_BOX');
  });
  P.text(c0, tbY - 3 * 34 - 10, TH * 0.7, `Gov. ${r.govId} · DCR ${r.govDcr.toFixed(2)} · ${r.ok ? 'OK' : 'NG'} (그립 ${r.boltGrip}mm)`, 'NOTE');

  return wrap(doc);
}
