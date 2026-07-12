// H형강 카탈로그 — 부록 I 「보/기둥 100% SHN490 F10T」(73종)
// 단면성능(Ag,Sx,Zx,r) = KS D 3502 원표 확정값 주입(70종, ks_d3502.ts, propSource='ks').
// KS 미수록 보강단면 3종(304x301, 310x305, 388x402)은 편람 Mu 캘리브레이션 계산값('calc').
import type { HSection } from './types.ts';
import { Fy } from './materials.ts';
import { flexuralMn } from './nominal.ts';
import { GOLDEN_BEAM100_SHN490_F10T } from './golden_beam100_shn490_f10t.ts';
import { KS_D3502 } from './ks_d3502.ts';

/** 단면성능 계산 (압연 H형강, 필렛 포함) */
export function computeProps(H: number, B: number, tw: number, tf: number, r: number) {
  const d = H - 2 * tf;
  const af = (1 - Math.PI / 4) * r * r;
  const yf = d / 2 + (r * (10 - 3 * Math.PI)) / (12 - 3 * Math.PI);
  const Ag = 2 * B * tf + d * tw + 4 * af;
  const If = 2 * (B * tf ** 3 / 12 + B * tf * ((H - tf) / 2) ** 2);
  const Iw = tw * d ** 3 / 12;
  const Ifil = 4 * af * yf * yf;
  const Sx = (If + Iw + Ifil) / (H / 2);
  const Zx = 2 * B * tf * ((H - tf) / 2) + tw * d * d / 4 + 4 * af * yf;
  return { Ag, Aw: H * tw, Sx, Zx };
}

/** "H-386x299x9x14" → {H,B,tw,tf} */
export function parseName(name: string) {
  const [H, B, tw, tf] = name.replace(/^H-/, '').split('x').map(Number);
  return { H, B, tw, tf };
}

// 편람 설계강도표의 휨모멘트(Mu) — 필렛반경 캘리브레이션 타깃 (SHN490 기준)
const MU_TABLE = new Map(GOLDEN_BEAM100_SHN490_F10T.map(r => [r.name, r.Mu]));

/**
 * 필렛반경 r을 이분탐색으로 캘리브레이션: 0.9·Mn(계산단면성능) = 편람 Mu.
 * Mu는 r에 대해 단조증가 → 유일 해. 결과 Zx/Sx는 KS 규격에 준함.
 */
function calibrateR(H: number, B: number, tw: number, tf: number, targetMu: number, fy: number): number {
  let lo = 3, hi = Math.min(30, 2.2 * tf + 6); // 물리적 필렛반경 상한(과대 캘리브레이션 방지)
  const muAt = (r: number) => {
    const p = computeProps(H, B, tw, tf, r);
    return 0.9 * flexuralMn({ H, B, tw, tf, r, Sx: p.Sx, Zx: p.Zx }, fy);
  };
  if (targetMu <= muAt(lo)) return lo;
  if (targetMu >= muAt(hi)) return hi;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (muAt(mid) < targetMu) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 부록 I 대상 압연 H형강 73종 (1/4~4/4) */
const RAW_NAMES = [
  // 1/4
  'H-100x100x6x8', 'H-125x125x6.5x9', 'H-148x100x6x9', 'H-150x150x7x10',
  'H-198x99x4.5x7', 'H-200x100x5.5x8', 'H-194x150x6x9', 'H-200x200x8x12',
  'H-200x204x12x12', 'H-208x202x10x16', 'H-248x124x5x8', 'H-250x125x6x9',
  'H-244x175x7x11', 'H-244x252x11x11', 'H-248x249x8x13', 'H-250x250x9x14',
  'H-250x255x14x14', 'H-298x149x5.5x8', 'H-300x150x6.5x9',
  // 2/4
  'H-294x200x8x12', 'H-298x201x9x14', 'H-294x302x12x12', 'H-298x299x9x14',
  'H-300x300x10x15', 'H-300x305x15x15', 'H-304x301x11x17', 'H-310x305x15x20',
  'H-310x310x20x20', 'H-346x174x6x9', 'H-350x175x7x11', 'H-354x176x8x13',
  'H-336x249x8x12', 'H-340x250x9x14', 'H-338x351x13x13', 'H-344x348x10x16',
  'H-344x354x16x16', 'H-350x350x12x19', 'H-350x357x19x19', 'H-396x199x7x11',
  // 3/4
  'H-400x200x8x13', 'H-404x201x9x15', 'H-386x299x9x14', 'H-390x300x10x16',
  'H-388x402x12x12', 'H-394x398x11x18', 'H-394x405x18x18', 'H-400x400x13x21',
  'H-400x408x21x21', 'H-406x403x16x24', 'H-414x405x18x28', 'H-428x407x20x35',
  'H-446x199x8x12', 'H-450x200x9x14', 'H-434x299x10x15', 'H-440x300x11x18',
  'H-496x199x9x14', 'H-500x200x10x16', 'H-506x201x11x19', 'H-482x300x11x15',
  // 4/4
  'H-488x300x11x18', 'H-596x199x10x15', 'H-600x200x11x17', 'H-606x201x12x20',
  'H-612x202x13x23', 'H-582x300x12x17', 'H-588x300x12x20', 'H-594x302x14x23',
  'H-692x300x13x20', 'H-700x300x13x24', 'H-708x302x15x28', 'H-792x300x14x22',
  'H-800x300x14x26', 'H-808x302x16x30',
];

export function buildSection(name: string): HSection {
  const { H, B, tw, tf } = parseName(name);
  const ks = KS_D3502[name];
  if (ks) {
    // KS D 3502 원표 확정값 주입 (단위: mm²·mm³·mm)
    return { name, H, B, tw, tf, r: ks.r, Ag: ks.Ag, Aw: H * tw, Sx: ks.Sx, Zx: ks.Zx, propSource: 'ks' };
  }
  // KS 미수록(보강단면 등): 필렛반경을 편람 Mu에 캘리브레이션한 계산값
  const fyRef = Fy('SHN490', tf);
  const target = MU_TABLE.get(name);
  const r = target != null
    ? Math.round(calibrateR(H, B, tw, tf, target, fyRef) * 10) / 10
    : Math.round(1.2 * tf);
  const p = computeProps(H, B, tw, tf, r);
  return {
    name, H, B, tw, tf, r,
    Ag: Math.round(p.Ag), Aw: Math.round(p.Aw),
    Sx: Math.round(p.Sx), Zx: Math.round(p.Zx),
    propSource: 'calc',
  };
}

export const SECTIONS: HSection[] = RAW_NAMES.map(buildSection);
export const sectionByName = (name: string) => SECTIONS.find(s => s.name === name);
