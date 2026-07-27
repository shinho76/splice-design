// ────────────────────────────────────────────────────────────────────────────
// 소요력 산정 (demand) — 단일 소스 (참고 엔진 core/demand.ts 이식, SI)
//   플랜지력 Pf = M/(d−tf) + P/2    (커플 arm = 부재춤 − 플랜지두께)
//   판군 분담 half = Pf/2            (외판 Pf/2, 내판쌍 Pf/2 — 이중전단 50:50)
//   웨브   Vu, 편심 Mux = Vu·e       (판이 편심휨 흡수, e = 볼트군 중심~이음 CL)
//   부재   Mu (F13.1 휨파단 검토용)
//   capScale: 부재강도(F13/D2)로 소요를 물리적 캡핑할 때의 배율(≤1)
// ────────────────────────────────────────────────────────────────────────────
import type { DesignResult } from '../types.ts';
import { parseName } from '../sections.ts';
import type { DemandSet } from './types.ts';

export interface DemandInput {
  /** 축력 P (N) — 앱은 순수 휨접합이라 기본 0. 향후 조합력 확장용. */
  axialP_N?: number;
  /** 부재강도 캡핑 배율(1=무캡핑) */
  capScale?: number;
}

/** 웨브 볼트군 편심 e (mm) = 이음갭/2 + 응력방향 연단 + (축방향 열수−1)·피치/2 */
export function webEccentricity(r: DesignResult): number {
  const gap = r.web.gap ?? r.flange.gap ?? 10;
  const edge = r.web.edge ?? 40;
  const pitch = r.web.pitch ?? 60;
  // 웨브 첨판은 부재축 방향으로 볼트열(=web.bolt.m 열)을 가진다고 본다.
  const nAxis = Math.max(1, r.web.bolt?.m ?? 1);
  return gap / 2 + edge + ((nAxis - 1) * pitch) / 2;
}

/** 소요력 세트 산정 */
export function computeDemand(r: DesignResult, inp: DemandInput = {}): DemandSet {
  const { H, tf } = parseName(r.section);
  const capScale = inp.capScale != null && inp.capScale > 0 && inp.capScale < 1 ? inp.capScale : 1;
  const arm = Math.max(1, H - tf); // 커플 arm (mm)

  // 플랜지 소요축력: 편람 Puf(=M/(H−tf))를 채택(참고식과 동치). 축력 P 있으면 P/2 가산.
  const Pf = (r.Puf_kN * 1e3 * capScale) + (inp.axialP_N ?? 0) / 2;
  const Mu = r.Mu_kNm * 1e6 * capScale;
  const Vu = r.Vu_kN * 1e3 * capScale;
  const e = webEccentricity(r);
  const MuxWeb = Vu * e;

  return {
    Pf,
    half: Pf / 2,
    Mu,
    Vu,
    MuxWeb,
    e,
    capScale,
    // arm은 내부 계산용 — 노출 불필요하나 참고 위해 note로 남기지 않음
  } as DemandSet & { arm?: number };
}
