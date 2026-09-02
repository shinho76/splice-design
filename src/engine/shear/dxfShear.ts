// SC(전단판 접합, 2면전단) 상세도 DXF 생성기 — GS(engine/dxf.ts)의 R12 저수준 프리미티브를 그대로
// 재사용(newDoc/wrap/pen/mkXf/dimChain*)해 신규 레이어·검증 로직을 중복 만들지 않는다.
// 참조 샘플: docs/shear connection_detail_01.dxf(연단거리 실측) + 400200dd.dxf(볼트 PLAN 심볼,
// "H .. (SHEAR CONNECT)" 제목·WEB/FLG(EXT.)/FLG(INT.) 정보표 형식, 지지부재 미표시) + 나의아저씨
// 참조 샘플(시리즈별 그리드 전체상세 — GS toDXFAll의 보 분기와 동일 구조라 그 패턴을 그대로 이식).
// 지지부재는 SC 엔진이 형상을 산정하지 않으므로 그리지 않는다(400200dd.dxf와 동일 관례).
// 세 표현(2D SVG·3D·DXF)이 항상 같은 ShearResult 필드에서 파생되므로 서로 어긋나지 않는다.
import type { DesignCondition } from '../types.ts';
import type { ShearResult } from './singlePlate.ts';
import { sectionByName, parseName } from '../sections.ts';
import { nominalOf } from '../hbeam_catalog.ts';
import { holeDia } from '../aisc/constants.ts';
import {
  newDoc, wrap, pen, mkXf, dimChainH, dimChainV, emitDim, round, TH, FONT,
  drawHProfile, boltSide,
  type Doc, type Pen,
} from '../dxf.ts';

/** 볼트 PLAN 심볼(원+육각머리 외곽+중심선 십자) — 400200dd.dxf의 HEADED_HT_BOLT-PLAN 블록을
 *  단순 도형으로 재현(원본은 블록 INSERT지만, 개별/전체 도면 모두 R12 저수준 엔티티만 쓰는
 *  이 생성기 관례상 매 위치에 직접 그린다). 육각 외접반경 = dia×0.866(원본과 동일 비율). */
function drawBoltPlan(P: Pen, cx: number, cy: number, dia: number, dh: number) {
  const hexR = dia * 0.866;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (90 - i * 60);
    return [cx + hexR * Math.cos(a), cy + hexR * Math.sin(a)] as const;
  });
  for (let i = 0; i < 6; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % 6]; P.line(x1, y1, x2, y2, 'MAIN'); }
  P.circle(cx, cy, dh / 2, 'BOLT');
  P.line(cx - hexR, cy, cx + hexR, cy, 'BOLT');
  P.line(cx, cy - hexR, cx, cy + hexR, 'BOLT');
}

/** 부재 파단선(fracture line) — 참조 샘플의 지그재그 표시. 도면이 임의 위치에서 잘려
 *  계속됨을 나타내는 관용 기호(위·아래 플랜지 각각). */
function breakLine(P: Pen, x: number, yTop: number, yBot: number, layer: string) {
  const dx = 8, dy = 10;
  for (const y of [yTop, yBot]) {
    P.line(x - dx, y - dy, x + dx, y - dy / 3, layer);
    P.line(x + dx, y - dy / 3, x - dx, y + dy / 3, layer);
    P.line(x - dx, y + dy / 3, x + dx, y + dy, layer);
  }
}

interface ShearFrame { left: number; right: number; top: number; bottom: number; }

/** 한 단면의 전단판 상세(View1 입면+View2 단면+정보표)를 (ox,oy) 오프셋에 그리고, 그려진
 *  영역의 경계를 반환한다(toDXFShearAll의 그리드 배치가 이 경계로 셀 크기를 정함 — 단일
 *  소스: 실제로 그린 좌표에서 그대로 산출하므로 레이아웃 수식이 두 곳에서 어긋날 일이 없다). */
function emitShearMember(doc: Doc, r: ShearResult, cond: DesignCondition, ox: number, oy: number): ShearFrame {
  const sec = sectionByName(r.section);
  const H = sec?.H ?? 0, B = sec?.B ?? 0, tf = sec?.tf ?? 0, tw = sec?.tw ?? 0, fr = sec?.r ?? 0;
  const { NC, NR, Pc, a, gap, sh, Lev, Leh, plate, boltDia: dia } = r;
  const dh = holeDia(dia);

  const colZ = NC === 2 ? [a, a + sh] : [a];
  const rowY = Array.from({ length: NR }, (_, i) => (i - (NR - 1) / 2) * Pc);

  const t0 = mkXf(ox, oy, 0);
  const P = pen(doc, t0);

  // ── View1: 전단판 입면도(피지지보 측면) — x=0은 지지면(=전단판 근접단), 지지부재는 미표시 ──
  const y0 = 0;
  const topMargin = Math.max(H, plate.L) / 2;
  P.text(0, topMargin + 60, TH, '전단판 입면도 (피지지보 측면)', 'NOTE');
  P.text(0, topMargin + 30, TH * 0.8, '지지부재는 형상 미산정(미표시)', 'NOTE');

  // 피지지보 플랜지대(측면) — 부재 끝은 지지면에서 갭만큼 물러나 전단판이 갭 구간을 덮는다.
  // 원단(오른쪽)은 실제 부재 끝이 아니라 파단선으로 절단 표시.
  const breakX = plate.w + 90;
  P.rect(gap, y0 + H / 2 - tf, breakX - gap, tf, 'MAIN');
  P.rect(gap, y0 - H / 2, breakX - gap, tf, 'MAIN');
  P.line(gap, y0 - H / 2 - 10, gap, y0 + H / 2 + 10, 'HIDDEN');
  P.text(gap, y0 + H / 2 + 16, TH * 0.8, `gap ${gap}`, 'NOTE', { align: 'c' });
  breakLine(P, breakX, y0 + H / 2 - tf / 2, y0 - H / 2 + tf / 2, 'MAIN');

  // 전단판(양측 2매 — 입면에서는 겹쳐 보임)
  P.rect(0, y0 - plate.L / 2, plate.w, plate.L, 'FLG_PL');
  P.text(plate.w / 2, y0 + plate.L / 2 + 8, TH * 0.8, '전단판 ×2', 'NOTE', { align: 'c' });

  // 볼트(PLAN 심볼)
  for (const cz of colZ) for (const ry of rowY) drawBoltPlan(P, cz, y0 + ry, dia, dh);

  // 치수체인 — 수직(margin,Pc..,margin) / 수평(a,sh,Leh)
  const ys = [y0 + plate.L / 2, ...rowY.slice().reverse(), y0 - plate.L / 2];
  dimChainV(doc, t0, ys, plate.w + 40, plate.w + 70, plate.w + 140);
  const xs = NC === 2 ? [0, a, a + sh, plate.w] : [0, a, plate.w];
  dimChainH(doc, t0, xs, y0 - plate.L / 2 - 40, y0 - plate.L / 2 - 70, y0 - plate.L / 2 - 140);
  // 부재 춤(H) 참고 치수 — 파단선 우측, 단일 치수라 emitDim 직접 사용
  emitDim(doc, t0, [breakX + 60, y0 + H / 2], [breakX + 60, y0 - H / 2], [breakX + 90, 0], `${round(H)}`, true);

  // ── View2: 부재 실단면 상세(2면전단) — 지지면 직각으로 자른 진짜 H형강 단면(필렛 포함,
  //    400200dd.dxf와 동일하게 플레이트 형상으로 대체하지 않고 GS drawHProfile을 그대로 재사용)
  //    + 웨브 양측 전단판 2매 + 행(NR)별 볼트 측면(머리/너트) 실척 심볼 — View1 아래쪽에 배치 ──
  const secW = Math.max(B, 2 * plate.t + tw);
  const secY = y0 - topMargin - 180 - H / 2;
  P.text(-secW / 2, secY + H / 2 + 40, TH, '부재 단면 상세 (2면전단)', 'NOTE');
  drawHProfile(P, 0, secY, H, B, tw, tf, fr, 'MAIN');
  const sx0 = -tw / 2 - plate.t, sx1 = -tw / 2, sx2 = tw / 2, sx3 = tw / 2 + plate.t;
  P.rect(sx0, secY - plate.L / 2, plate.t, plate.L, 'FLG_PL');
  P.rect(sx2, secY - plate.L / 2, plate.t, plate.L, 'FLG_PL');
  const grip = tw + 2 * plate.t;
  for (const ry of rowY) boltSide(P, 0, secY + ry, grip / 2, false, dia);
  dimChainH(doc, t0, [sx0, sx1, sx2, sx3], secY - H / 2 - 30, secY - H / 2 - 55, secY - H / 2 - 110);

  // ── 정보표: "H {H}x{B}x{tf}/{tw} (SHEAR CONNECT)" 제목 + WEB/FLG(EXT.)/FLG(INT.) 3행
  //    (400200dd.dxf와 동일 구조 — SC는 플랜지 이음판이 없어 FLG 두 행은 "-") ──
  const tbY = secY - H / 2 - 220;
  const title = sec ? `H ${sec.H}x${sec.B}x${sec.tw}/${sec.tf} (SHEAR CONNECT)` : `${r.section} (SHEAR CONNECT)`;
  P.text(0, tbY, TH * 1.2, title, 'MINI_HEAD', { align: 'c' });
  const rows: [string, string][] = [
    ['WEB', `${r.boltCount}-M${dia}(${cond.bolt}) / ${plate.w}x${plate.L}x${plate.t}t(${cond.plateSteel ?? cond.steel}, 2EA)`],
    ['FLG(EXT.)', '-'],
    ['FLG(INT.)', '-'],
  ];
  const c0 = -secW / 2 - 60, c1 = c0 + 140;
  rows.forEach(([l, v], i) => {
    const y = tbY - 34 - i * 34;
    P.text(c0, y, TH * 0.9, l, 'MINI_BOX');
    P.text(c1, y, TH * 0.9, v, 'MINI_BOX');
  });
  const govY = tbY - 34 - 3 * 34 - 10;
  P.text(c0, govY, TH * 0.7, `Gov. ${r.govId} · DCR ${r.govDcr.toFixed(2)} · ${r.ok ? 'OK' : 'NG'} (그립 ${r.boltGrip}mm)`, 'NOTE');

  // ── 테두리(400200dd.dxf TABLE_MAIN_ 레이어와 동일 관례 — 도면 전체를 감싸는 외곽 사각형) ──
  const frame = { left: -Math.max(secW / 2 + 60, 60), right: breakX + 140, top: topMargin + 90, bottom: govY - 30 };
  const pad = 30;
  P.rect(frame.left - pad, frame.bottom - pad, (frame.right - frame.left) + 2 * pad, (frame.top - frame.bottom) + 2 * pad, 'MINI_BOX');

  return frame;
}

/** 전단판(2면전단) 상세도 DXF(R12) 문자열 생성(개별 단면 1건). */
export function toDXFShear(r: ShearResult, cond: DesignCondition): string {
  const doc = newDoc();
  emitShearMember(doc, r, cond, 0, 0);
  return wrap(doc);
}

// ── 전체부재 그리드(시리즈별 열) — GS toDXFAll의 보(!isCol) 분기와 동일 구조를 그대로 이식.
//    호칭 춤(H) 시리즈로 열을 나누고, 열 안에 세로로 상세 셀을 쌓는다. ──
function seriesDepthKeySC(section: string): string {
  const { H, B } = parseName(section);
  return `H-${nominalOf(H, B).split(/[x×]/)[0]}`;
}
function groupByDepthSC(rows: ShearResult[]): { key: string; items: ShearResult[] }[] {
  const order: string[] = [], map = new Map<string, ShearResult[]>();
  for (const r of rows) { const k = seriesDepthKeySC(r.section); if (!map.has(k)) { map.set(k, []); order.push(k); } map.get(k)!.push(r); }
  return order.map(k => ({ key: k, items: map.get(k)! }));
}

/** 카탈로그 전 단면의 전단판 상세를 한 DXF에 시리즈(호칭 춤)별 그리드로 배치(검토용 전체 상세도). */
export function toDXFShearAll(rows: ShearResult[], cond: DesignCondition): string {
  const doc = newDoc();
  const P = pen(doc, mkXf(0, 0, 0));
  const NOTE = '* 참고용 상세도입니다 — 프로젝트 적용 전 담당 구조기술사의 검토를 받으세요.';
  P.text(0, 300, 300, NOTE, 'MINI_HEAD', { align: 'l' });

  const COLGAP = 500, ROWGAP = 340, HHDR = 520, HDRH = 380;
  let xCur = 0;
  for (const g of groupByDepthSC(rows)) {
    // 1) 셀 크기 산정(실제로 그리지 않고 임시 문서에 그려 반환된 경계로 산정 — 단일 소스 유지)
    const probe = newDoc();
    const frames = g.items.map(r => emitShearMember(probe, r, cond, 0, 0));
    const fw = Math.max(...frames.map(f => f.right - f.left));
    const fh = Math.max(...frames.map(f => f.top - f.bottom));
    const frameL = Math.min(...frames.map(f => f.left));
    const frameTop = Math.max(...frames.map(f => f.top));

    // 2) 열 상단 대형 소제목 밴드
    const hTop = -60, hBot = -HHDR + 60;
    P.rect(xCur, hBot, fw, hTop - hBot, 'MINI_BOX');
    P.text(xCur + fw / 2, (hTop + hBot) / 2 - HDRH / 2, HDRH, g.key, 'MINI_HEAD', { align: 'c' });

    // 3) 셀을 세로로 실제 배치
    let yTop = -HHDR;
    for (const r of g.items) {
      emitShearMember(doc, r, cond, xCur - frameL, yTop - frameTop);
      yTop -= fh + ROWGAP;
    }
    xCur += fw + COLGAP;
  }
  return wrap(doc);
}
