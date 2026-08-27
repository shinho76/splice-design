import type { DesignCondition, Member, JointType, SteelGrade, BoltGrade } from '../engine/types.ts';
import { nearestPlate, STEEL, steelLabel } from '../engine/materials.ts';
import { useLang } from '../i18n.ts';

/** 옵션 라벨 "재질 / Fy / Fu"(MPa, 두께≤40mm 기준) — 예 "SHN275 / 275 / 400" */
const matLabel = (s: SteelGrade): string => `${steelLabel(s)} / ${STEEL[s].Fy_le40} / ${STEEL[s].Fu}`;

const PRESETS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];

export default function FilterBar({ cond, onChange, boltMode, onBoltMode }: {
  cond: DesignCondition; onChange: (c: DesignCondition) => void;
  boltMode: 'Default' | 'Custom'; onBoltMode: (m: 'Default' | 'Custom') => void;
}) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const set = <K extends keyof DesignCondition>(k: K, v: DesignCondition[K]) =>
    onChange({ ...cond, [k]: v });
  const pct = Math.round(cond.strengthRatio * 100);
  const setAlpha = (p: number) => set('strengthRatio', Math.min(100, Math.max(10, p)) / 100);

  const mode = cond.mode ?? 'A';
  const isS = mode === 'S' || mode === 'H' || mode === 'K';   // 표준(S)·현대제철(H)·KS전단면(K) 공통 UI
  const isSH = mode === 'S' || mode === 'H';   // 재질 275/355 프리셋은 S·H만(K는 H형강/이음판 select에서 자유 선택)
  const stdMat = cond.steel === 'SHN275' ? '275' : '355';   // 표준 재질(275계/355계)
  const pickMode = (m: 'A' | 'S' | 'H' | 'K') => {
    if (m === 'S' || m === 'H' || m === 'K') onChange({ ...cond, mode: m, profile: 'H', jointType: '마찰', steel: 'SHN355', plateSteel: 'SM355' });
    else onChange({ ...cond, mode: m });
  };

  return (
    <div className="filterbar">
      {/* 구분 : A(현행) / S(표준도) / H(현대제철) / K(KS D3502:2022 전단면) */}
      <div className="fgrp">
        <Seg label={L('구분', 'Mode')} value={mode} opts={['A', 'S', 'H', 'K']}
          optLabels={['A', 'S', 'H', 'K']} onPick={v => pickMode(v as 'A' | 'S' | 'H' | 'K')} />
      </div>

      {isSH ? (
        /* 표준도(S)·현대제철(H): 재질 275계/355계 2택 (부재/이음판 강종 동시 설정) */
        <div className="fgrp">
          <Seg label={L('재질', 'Grade')} value={stdMat} opts={['275', '355']}
            optLabels={['SHN275/SS275', 'SHN355/SM355']}
            onPick={v => onChange({ ...cond, steel: v === '275' ? 'SHN275' : 'SHN355', plateSteel: v === '275' ? 'SS275' : 'SM355' })} />
        </div>
      ) : mode === 'K' ? null : (   /* K: 재질 프리셋 없음 — 아래 H형강·이음판 select에서 직접 선택 */
        <>
          {/* Ⓐ 형강 프로파일 (H형강 / W형강) */}
          <div className="fgrp">
            <Seg label={L('형강', 'Profile')} value={cond.profile ?? 'H'} opts={['H', 'W']} optLabels={['H-Shape', 'W-Shape']} onPick={v => set('profile', v as 'H' | 'W')} />
          </div>

          {/* Ⓐ-2 단면 범위 (전체 / 자주 쓰는 단면) */}
          <div className="fgrp">
            <Seg label={L('단면', 'Sections')} value={cond.sectionSet ?? 'all'} opts={['all', 'preferred']} optLabels={[L('전체', 'All'), L('상용', 'Preferred')]} onPick={v => set('sectionSet', v as 'all' | 'preferred')} />
          </div>

          {/* ⓪ 설계기준 */}
          <div className="fgrp">
            <Seg label={L('설계기준', 'Std')} value={cond.designStd ?? 'AISC'} opts={['AISC', 'KDS', 'KBC']} optLabels={['AISC 16', 'KDS 22', 'KBC-09']} onPick={v => set('designStd', v as 'KBC' | 'KDS' | 'AISC')} />
          </div>
        </>
      )}

      {/* ① 기본 조건 (부재→접합) */}
      <div className="fgrp">
        <Seg label={L('부재', 'Member')} value={cond.member} opts={['보', '기둥']} optLabels={[L('보', 'Beam'), L('기둥', 'Column')]} onPick={v => set('member', v as Member)} />
        <Seg label={L('접합', 'Joint')} value={cond.jointType} opts={['마찰', '지압']} optLabels={[L('마찰', 'Slip'), L('지압', 'Bearing')]} onPick={v => set('jointType', v as JointType)} />
      </div>

      {/* ② 재료 (H형강→이음판→볼트) */}
      <div className="fgrp">
        <div className="fld">
          <label>{L('H형강', 'H-Beam')}</label>
          {/* H형강 재질 선택 시 이음판은 유사재질(없으면 Fy 최근접)로 자동 선택 */}
          <select value={cond.steel} onChange={e => { const v = e.target.value as SteelGrade; onChange({ ...cond, steel: v, plateSteel: nearestPlate(v) }); }}>
            <optgroup label="KS D3503">
              <option value="SS275">{matLabel('SS275')}</option>
            </optgroup>
            <optgroup label="KS D3515">
              <option value="SM275">{matLabel('SM275')}</option><option value="SM355">{matLabel('SM355')}</option><option value="SM420">{matLabel('SM420')}</option><option value="SM460">{matLabel('SM460')}</option>
            </optgroup>
            <optgroup label="KS D3866">
              <option value="SHN275">{matLabel('SHN275')}</option><option value="SHN355">{matLabel('SHN355')}</option><option value="SHN400">{matLabel('SHN400')}</option><option value="SHN490">{matLabel('SHN490')}</option>
            </optgroup>
            <optgroup label="ASTM">
              <option value="A36">{matLabel('A36')}</option><option value="A572">{matLabel('A572')}</option><option value="A992">{matLabel('A992')}</option><option value="A913_50">{matLabel('A913_50')}</option>
            </optgroup>
          </select>
        </div>
        <div className="fld">
          <label>{L('이음판', 'Plate')}</label>
          <select value={cond.plateSteel ?? cond.steel} onChange={e => set('plateSteel', e.target.value as SteelGrade)}>
            <optgroup label="KS D3503">
              <option value="SS275">{matLabel('SS275')}</option>
            </optgroup>
            <optgroup label="KS D3515">
              <option value="SM275">{matLabel('SM275')}</option><option value="SM355">{matLabel('SM355')}</option><option value="SM420">{matLabel('SM420')}</option><option value="SM460">{matLabel('SM460')}</option>
            </optgroup>
            <optgroup label="KS D3861">
              <option value="SN275">{matLabel('SN275')}</option><option value="SN355">{matLabel('SN355')}</option><option value="SN400">{matLabel('SN400')}</option><option value="SN490">{matLabel('SN490')}</option>
            </optgroup>
            <optgroup label="ASTM">
              <option value="A36">{matLabel('A36')}</option><option value="A572">{matLabel('A572')}</option>
            </optgroup>
          </select>
        </div>
        <div className="fld">
          <label>{L('볼트', 'Bolt')}</label>
          <select value={cond.bolt} onChange={e => set('bolt', e.target.value as BoltGrade)}>
            <optgroup label="KS B 1010">
              <option value="F10T">F10T, S10T</option><option value="F13T">F13T</option>
            </optgroup>
            <optgroup label="ASTM F3125">
              <option value="A325">A325, F1852</option><option value="A490">A490, F2280</option>
            </optgroup>
          </select>
        </div>
      </div>

      {/* ③ 볼트 배치·이음판 (나사부→볼트안→엇모배치→이음판두께) */}
      <div className="fgrp">
        {(cond.designStd === 'AISC' || cond.designStd === 'KDS') && <Seg label={L('나사부', 'Thread')} value={cond.threadCond ?? 'N'} opts={['N', 'X']} onPick={v => set('threadCond', v as 'N' | 'X')} />}
        <Seg label={L('볼트 직경', 'Bolt Ø')} value={boltMode} opts={['Default', 'Custom']} optLabels={[L('표준', 'Standard'), L('지정', 'Custom')]} onPick={v => onBoltMode(v as 'Default' | 'Custom')} />
        <Seg label={L('엇모', 'Stagger')} value={(cond.noStagger ?? false) ? '제외' : '포함'} opts={['포함', '제외']} optLabels={[L('포함', 'On'), L('제외', 'Off')]} onPick={v => set('noStagger', v === '제외')} />
        <Seg label={L('이음판두께', 'Plate t')} value={(cond.equalPlateT ?? true) ? '동일' : '개별'} opts={['동일', '개별']} optLabels={[L('동일', 'Equal'), L('개별', 'Indiv.')]} onPick={v => set('equalPlateT', v === '동일')} />
        {(cond.designStd === 'AISC' || cond.designStd === 'KDS') && <Seg label={L('판 분담', 'Plate share')} value={(cond.plateShare ?? '5050') === 'area' ? '면적' : '50:50'} opts={['50:50', '면적']} optLabels={[L('50:50', '50:50'), L('면적비례', 'By area')]} onPick={v => set('plateShare', v === '면적' ? 'area' : '5050')} />}
        {(cond.designStd === 'AISC' || cond.designStd === 'KDS') && <Seg label={L('블록전단', 'Block shear')} value={(cond.bsShare ?? 'balanced') === 'full' ? '전체력' : '균형'} opts={['균형', '전체력']} optLabels={[L('균형', 'Balanced'), L('전체력', 'Full')]} onPick={v => set('bsShare', v === '전체력' ? 'full' : 'balanced')} />}
      </div>

      {/* ④ 설계 파라미터 (강도비→갭) */}
      <div className="fgrp">
        <div className="fld alpha">
          <label>{L('강도비 α', 'Ratio α')}</label>
          <div className="alpha-ctl">
            <select value={PRESETS.includes(pct) ? pct : 'custom'} onChange={e => e.target.value !== 'custom' && setAlpha(Number(e.target.value))}>
              {PRESETS.map(p => <option key={p} value={p}>{p}%</option>)}
              {!PRESETS.includes(pct) && <option value="custom">{pct}% (직접)</option>}
            </select>
          </div>
        </div>
        <div className="fld">
          <label>{L('갭 mm', 'Gap mm')}</label>
          <select value={cond.gap ?? 10} onChange={e => set('gap', Number(e.target.value))}>
            <option value={0}>0</option><option value={5}>5</option><option value={10}>10</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function Seg({ label, value, opts, onPick, optLabels }: {
  label: string; value: string; opts: string[]; onPick: (v: string) => void; optLabels?: string[];
}) {
  return (
    <div className="fld">
      <label>{label}</label>
      <div className="seg">
        {opts.map((o, i) => (
          <button key={o} className={o === value ? 'on' : ''} onClick={() => onPick(o)}>{optLabels ? optLabels[i] : o}</button>
        ))}
      </div>
    </div>
  );
}
