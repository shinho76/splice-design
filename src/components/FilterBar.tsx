import type { DesignCondition, Member, JointType, SteelGrade, BoltGrade } from '../engine/types.ts';

const PRESETS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 50];

export default function FilterBar({ cond, onChange, boltMode, onBoltMode }: {
  cond: DesignCondition; onChange: (c: DesignCondition) => void;
  boltMode: 'Default' | 'Custom'; onBoltMode: (m: 'Default' | 'Custom') => void;
}) {
  const set = <K extends keyof DesignCondition>(k: K, v: DesignCondition[K]) =>
    onChange({ ...cond, [k]: v });
  const pct = Math.round(cond.strengthRatio * 100);
  const setAlpha = (p: number) => set('strengthRatio', Math.min(100, Math.max(10, p)) / 100);

  return (
    <div className="filterbar">
      <div className="fld-stack">
        <Seg label="부재" value={cond.member} opts={['보', '기둥']} onPick={v => set('member', v as Member)} />
      </div>
      <div className="fld-stack">
        <Seg label="접합" value={cond.jointType} opts={['마찰', '지압']} onPick={v => set('jointType', v as JointType)} />
        <Seg label="볼트안" value={boltMode} opts={['Default', 'Custom']} onPick={v => onBoltMode(v as 'Default' | 'Custom')} />
        <Seg label="엇모배치" value={cond.noStagger ? '제외' : '포함'} opts={['포함', '제외']} onPick={v => set('noStagger', v === '제외')} />
      </div>

      <div className="fld">
        <label>H형강 강종</label>
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
        <label>첨판 강종</label>
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
        <label>볼트</label>
        <select value={cond.bolt} onChange={e => set('bolt', e.target.value as BoltGrade)}>
          <optgroup label="KS">
            <option value="F10T">F10T, S10T</option><option value="F13T">F13T</option>
          </optgroup>
          <optgroup label="ASTM">
            <option value="A325">A325</option><option value="A490">A490</option>
          </optgroup>
        </select>
      </div>

      <div className="fld alpha">
        <label>부분강도비 α</label>
        <div className="alpha-ctl">
          <select value={PRESETS.includes(pct) ? pct : 'custom'} onChange={e => e.target.value !== 'custom' && setAlpha(Number(e.target.value))}>
            {PRESETS.map(p => <option key={p} value={p}>{p}%</option>)}
            {!PRESETS.includes(pct) && <option value="custom">{pct}% (직접)</option>}
          </select>
        </div>
      </div>
      <div className="fld">
        <label>갭 mm</label>
        <select value={cond.gap ?? 10} onChange={e => set('gap', Number(e.target.value))}>
          <option value={0}>0</option><option value={5}>5</option><option value={10}>10</option>
        </select>
      </div>
    </div>
  );
}

function Seg({ label, value, opts, onPick }: {
  label: string; value: string; opts: string[]; onPick: (v: string) => void;
}) {
  return (
    <div className="fld">
      <label>{label}</label>
      <div className="seg">
        {opts.map(o => (
          <button key={o} className={o === value ? 'on' : ''} onClick={() => onPick(o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}
