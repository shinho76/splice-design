// 접합부 3D 지오메트리 모델 — 계산결과(DesignResult)에서 부재·첨판·볼트를 프리미티브로 산출.
// Three.js 뷰어와 IFC 내보내기가 공유. 좌표계: X=폭(플랜지너비), Y=높이, Z=부재축(길이).
import type { DesignResult } from './types.ts';
import { parseName, sectionByName } from './sections.ts';

export interface PartBox {
  kind: 'outer' | 'inner' | 'web';
  cx: number; cy: number; cz: number;    // 중심
  sx: number; sy: number; sz: number;    // 크기
}
export interface PartBolt {
  axis: 'x' | 'y';                        // 볼트축 방향
  cx: number; cy: number; cz: number;    // 그립(조임구간) 중심
  grip: number;                          // 조임두께
  dir: 1 | -1;                           // 너트가 있는 방향(축 부호). 머리는 반대편
  shankR: number; headR: number; headH: number; nutH: number; protr: number;
}
export interface ConnParts {
  section: string;
  H: number; B: number; tw: number; tf: number; r: number;
  gap: number; segLen: number;
  boxes: PartBox[];
  bolts: PartBolt[];
}

/** DesignResult → 3D 부품(부재는 H단면 압출로 뷰어에서 생성, 여기선 치수만) */
export function connParts(r: DesignResult): ConnParts {
  const { H, B, tw, tf } = parseName(r.section);
  const fillet = sectionByName(r.section)?.r ?? Math.round(tf * 0.9);
  const dia = r.boltDia, shankR = dia / 2;
  const gap = r.flange.gap ?? 10, base = gap / 2 + 40;
  const g1 = r.flange.gauge?.g1 ?? 90, g2 = r.flange.gauge?.g2 ?? 0;
  const fB = r.flange.bolt, wB = r.web.bolt;
  const nHi = Math.ceil(fB.n), nLo = Math.floor(fB.n);
  const stag = r.flange.staggered ?? false;                          // 엔진 기준 엇모 여부
  const colY = fB.m === 2 ? [-g1 / 2, g1 / 2] : [-(g1 / 2 + g2), -g1 / 2, g1 / 2, g1 / 2 + g2];
  const fp = r.flange.pitch ?? 60, wp = r.web.pitch ?? 60;           // 엔진 피치(Custom 대구경 상향)
  // 열별 Z위치 : 정렬=fp간격, 엇모=지그재그(짝수열 j·90 / 홀수열 45+j·90) — SVG·DXF와 동일
  const flangeZof = (ci: number) => stag
    ? Array.from({ length: ci % 2 ? nLo : nHi }, (_, j) => base + (ci % 2 ? 45 : 0) + j * 90)
    : Array.from({ length: nHi }, (_, i) => base + i * fp);
  const Pc = r.web.Pc ?? 60;
  const webOff = (r.web.staggered ?? false) ? 30 : 0;                 // 웨브볼트 절반피치 엇갈림(체결 간섭 회피, [그림 3.4])
  const webZ = Array.from({ length: wB.n }, (_, i) => base + webOff + i * wp);
  const webY = Array.from({ length: wB.m }, (_, i) => (i - (wB.m - 1) / 2) * Pc);

  const outer = r.flange.outerPlate, inner = r.flange.innerPlate, web = r.web.webPlate;
  const oT = outer?.t ?? 9, oW = outer?.w ?? B, oL = outer?.L ?? 260;
  const segLen = Math.round(Math.max(oL, inner?.L ?? 0, web?.L ?? 0) / 2 + 100);

  const boxes: PartBox[] = [];
  const bolts: PartBolt[] = [];
  const boltSize = { shankR, headR: dia * 0.85, headH: dia * 0.65, nutH: dia * 0.8, protr: dia * 0.6 };

  // 내첨판 중심 = 웨브 양측 볼트열의 평균(측당 1장). 각 열마다가 아님 → 폭 초과 방지
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const innerCx = [mean(colY.filter(c => c < 0)), mean(colY.filter(c => c > 0))];
  // 플랜지 외첨판(상·하) + 내첨판(상·하 × 양측)
  for (const fy of [1, -1] as const) {
    if (outer) boxes.push({ kind: 'outer', cx: 0, cy: fy * (H / 2 + oT / 2), cz: 0, sx: oW, sy: oT, sz: oL });
    if (inner) for (const cx of innerCx)
      boxes.push({ kind: 'inner', cx, cy: fy * (H / 2 - tf - inner.t / 2), cz: 0, sx: inner.w, sy: inner.t, sz: inner.L });
  }
  // 웨브 첨판(양면)
  if (web) for (const wx of [1, -1] as const)
    boxes.push({ kind: 'web', cx: wx * (tw / 2 + web.t / 2), cy: 0, cz: 0, sx: web.t, sy: web.w, sz: web.L });

  // 플랜지 볼트(연직 Y) — 머리=외측, 너트+여장=내측
  const flGrip = oT + tf + (inner?.t ?? 0);
  colY.forEach((cx, ci) => {
    const zs = flangeZof(ci);
    for (const fy of [1, -1] as const) for (const sgn of [1, -1] as const) for (const z of zs) {
      const top = fy * (H / 2 + oT), bot = fy * (H / 2 - tf - (inner?.t ?? 0));
      // 상부=머리 위(외측)/너트 아래(내측), 하부=머리 위(내측)/너트 아래(외측) → 하부 체결방향 반대
      bolts.push({ axis: 'y', cx, cy: (top + bot) / 2, cz: sgn * z, grip: flGrip, dir: -1, ...boltSize });
    }
  });
  // 웨브 볼트(수평 X) — 머리=+X, 너트+여장=-X
  const wGrip = tw + 2 * (web?.t ?? 6);
  for (const y of webY) for (const sgn of [1, -1] as const) for (const z of webZ) {
    bolts.push({ axis: 'x', cx: 0, cy: y, cz: sgn * z, grip: wGrip, dir: -1, ...boltSize });
  }

  return { section: r.section, H, B, tw, tf, r: fillet, gap, segLen, boxes, bolts };
}
