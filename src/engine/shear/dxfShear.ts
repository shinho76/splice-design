// SC(전단판 접합, 2면전단) 상세도 DXF 생성기 — GS(engine/dxf.ts)의 R12 저수준 프리미티브를 그대로
// 재사용(newDoc/wrap/pen/mkXf/dimChain*)해 신규 레이어·검증 로직을 중복 만들지 않는다.
// 참조 CAD(docs/shear connection_detail_01.dxf)를 템플릿으로 삼아 ShearConnectionSVG.tsx·
// ShearViewer.tsx와 동일한 기하(Lev/Leh/a/gap/RIB·GUSSET 조견표/지지부재 임의 춤)를 그린다 —
// 세 표현(2D SVG·3D·DXF)이 항상 같은 ShearResult 필드에서 파생되므로 서로 어긋나지 않는다.
import type { DesignCondition } from '../types.ts';
import type { ShearResult } from './singlePlate.ts';
import { sectionByName } from '../sections.ts';
import { holeDia } from '../aisc/constants.ts';
import {
  newDoc, wrap, pen, mkXf, dimChainH, dimChainV, round, TH, FONT,
  type Doc,
} from '../dxf.ts';

const SUPPORT_T = 20;   // 지지부재 웨브 임의 표시 두께(mm, 도면용 — 형상 미산정, ShearConnectionSVG와 동일값)

/** 전단판(2면전단) 상세도 DXF(R12) 문자열 생성. */
export function toDXFShear(r: ShearResult, cond: DesignCondition): string {
  const sec = sectionByName(r.section);
  const H = sec?.H ?? 0, tf = sec?.tf ?? 0, tw = sec?.tw ?? 0;
  const { NC, NR, Pc, a, gap, sh, Lev, Leh, plate, gussetT, ribT, supportDepth, boltDia: dia } = r;
  const dh = holeDia(dia);

  const colZ = NC === 2 ? [a, a + sh] : [a];
  const rowY = Array.from({ length: NR }, (_, i) => (i - (NR - 1) / 2) * Pc);

  const doc: Doc = newDoc();
  const t0 = mkXf(0, 0, 0);   // 회전 없음(SC는 보 접합 하나뿐, GS의 보/기둥 90°분기 불필요)
  const P = pen(doc, t0);

  // x=0(GUSSET PLATE 원단=전단판 시작) 기준 음수(왼쪽)=지지부재→RIB→GUSSET, 양수(오른쪽)=전단판·보.
  const xSupInner = -(ribT + gussetT), xRibEnd = -gussetT, xSupOuter = -(SUPPORT_T + ribT + gussetT);

  // ── View1: 전단판 입면도(피지지보 측면) ──
  const y0 = 0;   // 입면도 기준 y(부재 중심선)
  P.text(xSupOuter, y0 + Math.max(supportDepth, H) / 2 + 60, TH, '전단판 입면도 (피지지보 측면)', 'NOTE');
  P.text(xSupOuter, y0 + Math.max(supportDepth, H) / 2 + 30, TH * 0.8, '지지부재·RIB·GUSSET 미산정(임의 스케치)', 'NOTE');

  // 지지부재(임의 표시)
  P.rect(xSupOuter, y0 - supportDepth / 2, SUPPORT_T, supportDepth, 'MAIN');
  P.text((xSupOuter + xSupInner) / 2, y0 + supportDepth / 2 + 8, TH * 0.8, `지지부재(임의) H'=${round(supportDepth)}`, 'NOTE', { align: 'c' });

  // RIB PLATE(있으면)
  if (ribT > 0) {
    P.rect(xSupInner, y0 - plate.L / 2, ribT, plate.L, 'WEB_PL');
    P.text((xSupInner + xRibEnd) / 2, y0 + plate.L / 2 + 8, TH * 0.8, `RIB t${ribT}`, 'NOTE', { align: 'c' });
  }
  // GUSSET PLATE
  P.rect(xRibEnd, y0 - plate.L / 2, -xRibEnd, plate.L, 'WEB_PL');
  P.text(xRibEnd / 2, y0 - plate.L / 2 - 8 - TH * 0.8, TH * 0.8, `GUSSET t${gussetT}`, 'NOTE', { align: 'c' });

  // 피지지보 플랜지대(측면) — 부재 끝은 지지면에서 갭만큼 물러나 전단판이 갭 구간을 덮는다.
  const beamFar = plate.w + 60;
  P.rect(gap, y0 + H / 2 - tf, beamFar - gap, tf, 'MAIN');
  P.rect(gap, y0 - H / 2, beamFar - gap, tf, 'MAIN');
  P.line(gap, y0 - H / 2 - 10, gap, y0 + H / 2 + 10, 'HIDDEN');
  P.text(gap, y0 + H / 2 + 16, TH * 0.8, `gap ${gap}`, 'NOTE', { align: 'c' });

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

  // ── View2: 볼트 단면 상세(2면전단) — View1 아래쪽에 배치 ──
  const secY = y0 - Math.max(supportDepth, H) / 2 - 260;
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

  // ── 정보표(1열 — 값 길이가 가변이라 2열 배치 시 겹침 위험, 세로로 나열) ──
  const tbY = secY - 220;
  const rows: string[] = [
    `Title: ${r.section}`,
    `Steel: ${cond.steel}`,
    `Plate: 2-PL ${plate.t}x${plate.L}x${plate.w}`,
    `Bolt: ${r.boltCount}-M${dia} H.T.B`,
    `Grip: ${r.boltGrip}mm (PL+WEB+PL)`,
    `Gov.: ${r.govId} · DCR ${r.govDcr.toFixed(2)} · ${r.ok ? 'OK' : 'NG'}`,
  ];
  rows.forEach((s, i) => P.text(-secW / 2, tbY - i * 30, TH * 0.9, s, 'MINI_BOX'));

  return wrap(doc);
}
