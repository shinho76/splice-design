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
  /** 플랜지(Pf·Mu) 부재강도 캡핑 배율(1=무캡핑) */
  flangeScale?: number;
  /** 웨브(Vu·Mux) 부재강도 캡핑 배율(1=무캡핑) */
  webScale?: number;
}

/** 웨브 볼트군 편심 e (mm) = 이음갭/2 + 축방향 연단 + (축방향 열수−1)·축피치/2 */
export function webEccentricity(r: DesignResult): number {
  const gap = r.web.gap ?? r.flange.gap ?? 10;
  const edge = r.web.edge ?? 40;
  const pitch = r.web.pitch ?? 60;        // 축방향(부재축) 피치 webP
  // 축방향 볼트열수 = web.bolt.n (m=춤방향, n=축방향)
  const nAxis = Math.max(1, r.web.bolt?.n ?? 1);
  return gap / 2 + edge + ((nAxis - 1) * pitch) / 2;
}

const clampScale = (s?: number) => (s != null && s > 0 && s < 1 ? s : 1);

/** 소요력 세트 산정 */
export function computeDemand(r: DesignResult, inp: DemandInput = {}): DemandSet {
  parseName(r.section); // 유효성(치수 파싱)
  const fScale = clampScale(inp.flangeScale);
  const wScale = clampScale(inp.webScale);

  // 플랜지 소요축력: 편람 Puf(=M/(H−tf))를 채택(참고식과 동치). 축력 P 있으면 P/2 가산.
  const Pf = (r.Puf_kN * 1e3 * fScale) + (inp.axialP_N ?? 0) / 2;
  const Mu = r.Mu_kNm * 1e6 * fScale;
  const Vu = r.Vu_kN * 1e3 * wScale;
  const e = webEccentricity(r);
  const MuxWeb = Vu * e;

  return { Pf, half: Pf / 2, Mu, Vu, MuxWeb, e, capScale: Math.min(fScale, wScale) };
}
