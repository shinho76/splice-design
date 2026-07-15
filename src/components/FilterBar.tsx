import type { DesignCondition, Member, JointType, SteelGrade, BoltGrade } from '../engine/types.ts';
import { useLang } from '../i18n.ts';

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

  return (
    <div className="filterbar">
      {/* ① 기본 조건 (부재→접합) */}
      <div className="fgrp">
        <Seg label={L('부재', 'Member')} value={cond.member} opts={['보', '기둥']} optLabels={[L('보', 'Beam'), L('기둥', 'Column')]} onPick={v => set('member', v as Member)} />
        <Seg label={L('접합', 'Joint')} value={cond.jointType} opts={['마찰', '지압']} optLabels={[L('마찰', 'Slip'), L('지압', 'Bearing')]} onPick={v => set('jointType', v as JointType)} />
      </div>

      {/* ② 재료 (H형강→첨판→볼트) */}
      <div className="fgrp">
        <div className="fld">
          <label>{L('H형강', 'H-Beam')}</label>
          <select value={cond.steel} onChange={e => set('steel', e.target.value as SteelGrade)}>
            <optgroup label="KS">
              <option value="SS275">SS275</option><option value="SM355">SM355</option><option value="SN355">SN355</option>
            </optgroup>
            <optgroup label="ASTM">
              <option value="A36">A36</option><option value="A572">A572 Gr50</option><option value="A992">A992</option>
            </optgroup>
          </select>
        </div>
        <div className="fld">
          <label>{L('첨판', 'Plate')}</label>
          <select value={cond.plateSteel ?? cond.steel} onChange={e => set('plateSteel', e.target.value as SteelGrade)}>
            <optgroup label="KS">
              <option value="SS275">SS275</option><option value="SM355">SM355</option><option value="SN355">SN355</option>
            </optgroup>
            <optgroup label="ASTM">
              <option value="A36">A36</option><option value="A572">A572 Gr50</option><option value="A588">A588</option>
            </optgroup>
          </select>
        </div>
        <div className="fld">
          <label>{L('볼트', 'Bolt')}</label>
          <select value={cond.bolt} onChange={e => set('bolt', e.target.value as BoltGrade)}>
            <optgroup label="KS">
              <option value="F10T">F10T, S10T</option><option value="F13T">F13T</option>
            </optgroup>
            <optgroup label="ASTM">
              <option value="A325">A325</option><option value="A490">A490</option>
            </optgroup>
          </select>
        </div>
      </div>

      {/* ③ 볼트 배치·첨판 (볼트안→엇모배치→첨판두께) */}
      <div className="fgrp">
        <Seg label={L('볼트안', 'Bolt Ø')} value={boltMode} opts={['Default', 'Custom']} onPick={v => onBoltMode(v as 'Default' | 'Custom')} />
        <Seg label={L('엇모', 'Stagger')} value={cond.noStagger ? '제외' : '포함'} opts={['포함', '제외']} optLabels={[L('포함', 'On'), L('제외', 'Off')]} onPick={v => set('noStagger', v === '제외')} />
        <Seg label={L('첨판두께', 'Plate t')} value={cond.equalPlateT ? '동일' : '개별'} opts={['개별', '동일']} optLabels={[L('개별', 'Indiv.'), L('동일', 'Equal')]} onPick={v => set('equalPlateT', v === '동일')} />
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
