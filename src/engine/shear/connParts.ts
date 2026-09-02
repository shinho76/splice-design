// 전단판(2면전단·양측판) 3D 지오메트리 — ShearResult에서 부재·전단판·볼트를 프리미티브로 산출.
// GS(engine/connParts.ts)와 달리 부재 1개(피지지보)만 모델링한다 — 지지부재(보/기둥)는
// SC 엔진이 형상을 산정하지 않으므로 그리지 않는다(참조 샘플 400200dd.dxf와 동일 관례).
import { sectionByName } from '../sections.ts';
import type { ShearResult } from './singlePlate.ts';

export interface ShearPartBox { cx: number; cy: number; cz: number; sx: number; sy: number; sz: number; }
export interface ShearPartBolt { cx: number; cy: number; cz: number; grip: number; shankR: number; headR: number; headH: number; nutH: number; protr: number; }
export interface ShearConnParts {
  section: string;
  H: number; B: number; tw: number; tf: number; r: number;
  gap: number;              // 이음부 이격(보 원단이 지지면에서 물러난 거리) — 보 압출 시작점
  segLen: number;           // 부재 압출 길이(지지면 z=0 기준 → +z, 보 원단은 z=gap에서 시작)
  plates: ShearPartBox[];   // 웨브 양측 2매(2면전단)
  bolts: ShearPartBolt[];
}

/** ShearResult → 3D 부품(피지지보 1개 + 전단판(양측 2매) + 볼트군). 지지부재는 미표시(형상 미산정).
 *  z축: 지지면(z=0)에서 전단판·볼트가 시작하고, 보는 z=gap에서 시작(갭만큼 지지면에서 물러남). */
export function connPartsShear(res: ShearResult): ShearConnParts {
  const sec = sectionByName(res.section);
  const H = sec?.H ?? 0, B = sec?.B ?? 0, tw = sec?.tw ?? 0, tf = sec?.tf ?? 0, fillet = sec?.r ?? 0;
  const dia = res.boltDia, shankR = dia / 2;
  const { t, L: pL, w: pW } = res.plate;
  const pitch = res.Pc;

  // 전단판(웨브 양측, ±X) — 볼트/판은 지지면(z=0)에서 z=+로 전개
  const plates: ShearPartBox[] = [
    { cx: tw / 2 + t / 2, cy: 0, cz: pW / 2, sx: t, sy: pL, sz: pW },
    { cx: -(tw / 2 + t / 2), cy: 0, cz: pW / 2, sx: t, sy: pL, sz: pW },
  ];

  const grip = tw + 2 * t;    // 2면전단(판 1매+웨브+판 1매)
  const boltSize = { shankR, headR: dia * 0.85, headH: dia * 0.65, nutH: dia * 0.8, protr: dia * 0.6 };
  const bolts: ShearPartBolt[] = [];
  for (let i = 0; i < res.NR; i++) {
    const cy = (i - (res.NR - 1) / 2) * pitch;
    for (let j = 0; j < res.NC; j++) {
      const cz = res.a + j * res.sh;   // 열(NC) 방향 간격은 Pc(행 피치)가 아니라 sh(열간 간격)
      bolts.push({ cx: 0, cy, cz, grip, ...boltSize });   // cx=그립 중심(웨브 중심선, 양측판 대칭)
    }
  }

  const segLen = pW + Math.max(H, 200) * 0.7 + 120;
  return { section: res.section, H, B, tw, tf, r: fillet, gap: res.gap, segLen, plates, bolts };
}
