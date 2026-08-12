// ────────────────────────────────────────────────────────────────────────────
// AISC 360-16 검토 러너 — 소요 산정 + 전 한계상태 조립 + 지배 판정
//   Phase2: 플랜지(FB/FP/FI/FM). Phase3에서 웨브(WB/WR/WP/WI/WM) 합류.
// ────────────────────────────────────────────────────────────────────────────
import type { DesignResult, DesignCondition } from '../types.ts';
import { computeDemand } from './demand.ts';
import { flangeChecks } from './flange.ts';
import { webChecks } from './web.ts';
import type { AiscResult, AiscCheck } from './types.ts';

export interface AiscRunOpts { flangeScale?: number; webScale?: number; }

export function aiscRun(r: DesignResult, cond: DesignCondition, opts: AiscRunOpts = {}): AiscResult {
  const dem = computeDemand(r, { flangeScale: opts.flangeScale, webScale: opts.webScale, share: cond.plateShare });
  const checks: AiscCheck[] = [...flangeChecks(r, cond, dem), ...webChecks(r, cond, dem)];
  const scored = checks.filter(c => c.dcr != null);
  const gov = scored.reduce<AiscCheck | undefined>((a, b) => (a == null || (b.dcr ?? 0) > (a.dcr ?? 0) ? b : a), undefined);
  const govDcr = gov?.dcr ?? 0;
  return { checks, demand: dem, govId: gov?.id ?? '', govDcr, ok: govDcr <= 1.0, db: r.boltDia };
}
