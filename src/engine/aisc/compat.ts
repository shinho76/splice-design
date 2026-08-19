// ────────────────────────────────────────────────────────────────────────────
// 호환 어댑터 — 신 AISC 엔진(run/optimize)을 기존 컴포넌트 API 형태로 노출.
//   구: engine/aiscCheck.ts 의 aiscCheck / aiscAutoCorrect 시그니처를 대체.
//   컴포넌트는 import 경로만 이 파일로 바꾸면 신 엔진(플랜지+웨브+블록전 Case+옵티마이저) 사용.
// ────────────────────────────────────────────────────────────────────────────
import type { DesignResult, DesignCondition } from '../types.ts';
import { aiscRun } from './run.ts';
import { aiscOptimize } from './optimize.ts';
import type { AiscResult, AiscCheck } from './types.ts';

export type { AiscCheck, AiscResult } from './types.ts';

/** 구 aiscCheck 호환: 표준 배치를 AISC 전 한계상태 검토. pfCapKN 지정 시 플랜지 소요캡핑. */
export function aiscCheck(r: DesignResult, cond: DesignCondition, pfCapKN?: number): AiscResult {
  const flangeScale = pfCapKN != null && pfCapKN > 0 && pfCapKN < r.Puf_kN ? pfCapKN / r.Puf_kN : undefined;
  return aiscRun(r, cond, { flangeScale });
}

/** 구 aiscAutoCorrect 호환: 자동 최소화 결과를 구 필드명으로 매핑. */
export interface AiscAutoResultCompat {
  result: DesignResult;
  report: AiscResult;
  checks: AiscCheck[];
  changes: string[];
  ok: boolean;
  memberLimited: boolean;
  wt0: number; wt1: number;
  pfCap?: number;             // 플랜지 캡핑 후 Pf(kN) — 부분강도
  vuCap?: number;             // 웨브 캡핑 후 Vu(kN)
  flangeScale: number; webScale: number;
  history: { it: number; gov: string; dcr: number; action: string; wt: number }[];
}

export function aiscAutoCorrect(r: DesignResult, cond: DesignCondition): AiscAutoResultCompat {
  const o = aiscOptimize(r, cond);
  return {
    result: o.result,
    report: o.report,
    checks: o.report.checks,
    changes: o.changes,
    ok: o.ok,
    memberLimited: o.memberLimited,
    wt0: o.wt0, wt1: o.wt1,
    pfCap: o.flangeScale < 1 ? +(r.Puf_kN * o.flangeScale).toFixed(0) : undefined,
    vuCap: o.webScale < 1 ? +(r.Vu_kN * o.webScale).toFixed(0) : undefined,
    flangeScale: o.flangeScale, webScale: o.webScale,
    history: o.history,
  };
}
