import { useLang } from '../i18n.ts';

// ────────────────────────────────────────────────────────────────────────────
// 물량 민감도 분석 팝업 — 엑셀 4+1개 시트를 시각적으로 정리.
// 핵심: "무엇이 물량절감에 도움이 되는가"를 절감폭 큰 순서로 제시.
// 데이터 출처: 73개 부재 전수 최적화 측정(기준선 8,872 kg = 이음판 6,616 + 볼트 2,257).
// ────────────────────────────────────────────────────────────────────────────

const BASE = 8872; // kg 기준선

type Lever = { ko: string; en: string; kg: number; pct: number; note?: [string, string] };

// 물량절감 레버(음수=절감) — 효과 큰 순
const SAVINGS: Lever[] = [
  { ko: '엇모 배치 제외', en: 'No stagger', kg: -1027, pct: -11.6, note: ['지그재그 배치는 판을 길게 만들고, 정렬배치로 단축시킵니다. 판이 75%를 차지하므로 최대 절감효과가 나타납니다.', 'Staggered bolts widen pitch, lengthening plates; aligned layout shortens them. Largest savings since plates dominate (75%) the weight.'] },
  { ko: '이음판 분담(면적비)', en: 'Plate share by area', kg: -372, pct: -4.2, note: ['각 판의 강성에 따라 이음력을 나누어 담으면, 50:50 균등분담보다 더 얇은 판이 가능합니다.', 'Dividing force by each plate\'s stiffness allows thinner plates than equal 50:50 sharing.'] },
  { ko: '볼트직경 M20', en: 'Bolt Ø M20', kg: -347, pct: -3.9, note: ['작은 구멍은 순단면(구멍을 뺀 저항 단면) 손실을 줄이고, 판의 인장 여유를 늘려 판 두께를 감소시킵니다.', 'Smaller holes reduce net-section loss and boost tensile margin, allowing thinner plates.'] },
  { ko: '볼트등급 F13T', en: 'Bolt F13T', kg: -274, pct: -3.1, note: ['고강도 볼트는 같은 하중에서 필요한 볼트 개수와 미끄럼 저항 요구를 감소시킵니다.', 'Higher-strength bolts reduce required bolt count and slip resistance demand.'] },
  { ko: '이음판두께 개별', en: 'Individual plate t', kg: -171, pct: -1.9, note: ['안쪽과 바깥쪽 판의 두께를 각각 최적화하면 불필요한 과도 두께가 제거됩니다.', 'Optimizing inner and outer plate thickness independently removes excess thickness.'] },
  { ko: '갭 0 mm', en: 'Gap 0 mm', kg: -123, pct: -1.4, note: ['부재 사이 이격 제거는 편심거리 감소로 모멘트 부하가 낮아지고 판, 볼트 여유가 증가합니다.', 'Eliminating gap reduces eccentric distance, lowering moment load and freeing plate/bolt capacity.'] },
];

// 역효과·중립 레버(양수=증가)
const PENALTY: Lever[] = [
  { ko: '연단거리 40→32', en: 'Edge 40→32', kg: 7, pct: 0.1, note: ['판은 줄어들지만(−91kg) 가장자리 강도 부족으로 더 많은 볼트(+97kg)가 필요해 상쇄되어 중립입니다.', 'Plates shrink (−91kg) but edge weakness needs more bolts (+97kg)—effects cancel, neutral.'] },
  { ko: '볼트직경 M27', en: 'Bolt Ø M27', kg: 1337, pct: 15.1, note: ['큰 구멍은 순단면(구멍을 뺀 저항 단면) 손실을 급증시켜 판을 훨씬 두껍게 해야 합니다.', 'Large holes drastically increase net-section loss, forcing much thicker plates.'] },
];

// 물량 구성
const COMP = [
  { ko: '이음판', en: 'Plate', kg: 6616, pct: 74.6, color: '#1F6FEB' },
  { ko: '볼트', en: 'Bolt', kg: 2257, pct: 25.4, color: '#F2A93B' },
];

// 볼트직경 민감도(기준 대비 %)
const DIA = [
  { d: 'M16', pct: -3.5 }, { d: 'M20', pct: -3.9 }, { d: 'M22', pct: 2.5 },
  { d: 'M24', pct: 0.9 }, { d: 'M27', pct: 15.1 },
];

// 지배 한계상태 분포(73개 부재)
const GOV = [
  { ko: 'FI2 내판 인장파단', en: 'FI2 inner tens. rupture', n: 17 },
  { ko: 'FM2 플랜지 휨파단', en: 'FM2 flange flex. rupture', n: 14 },
  { ko: 'WI2 웨브 상관', en: 'WI2 web interaction', n: 14 },
  { ko: 'FM5 플랜지 블록전단', en: 'FM5 flange block shear', n: 13 },
  { ko: 'WM2 웨브 전단파단', en: 'WM2 web shear rupture', n: 8 },
  { ko: 'WR1 웨브 지압', en: 'WR1 web bearing', n: 2 },
  { ko: 'FM4 플랜지', en: 'FM4 flange', n: 2 },
  { ko: '기타(FP2·WI1·FB2)', en: 'Others', n: 3 },
];

// α 강도비(설계요구 조정) — a=강도비, apct=발현 부재강도(%), kg=결과물량, save=절감량(kg), pct=절감률(%)
const ALPHA = [
  { a: '1.0', apct: 100, kg: 8872, save: 0, pct: 0 },
  { a: '0.7', apct: 70, kg: 6486, save: 2386, pct: -26.9 },
  { a: '0.6', apct: 60, kg: 5305, save: 3567, pct: -40.2 },
];

const nf = (v: number) => Math.abs(v).toLocaleString('en-US');

export default function SensitivityPanel({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);

  const maxSave = 11.6; // 절감 바 스케일 기준
  const maxPen = 15.1;  // 역효과 바 스케일 기준
  const maxGov = 17;
  const maxDia = 15.1;

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card sens-card" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
        </div>
        <h2>{L('물량 민감도 분석', 'Material Sensitivity')}</h2>
        <p className="cond-line">
          {L('기준선', 'Baseline')} <b>{nf(BASE)} kg</b>
          <span className="qty-badge">{L('이음판', 'Plate')} 6,616 kg (75%) · {L('볼트', 'Bolt')} 2,257 kg (25%) · 73{L('개 부재', ' members')}</span>
        </p>

        {/* ── 1. 물량절감 레버 (효과 큰 순) ─────────────────────── */}
        <div className="sens-sec">{L('① 물량절감 레버 — 효과 큰 순', '① Savings levers — largest first')}</div>
        <div className="sens-bars">
          {SAVINGS.map((v, i) => (
            <div className="sens-row" key={v.en}>
              <span className="sens-rank">{i + 1}</span>
              <span className="sens-lbl">{L(v.ko, v.en)}</span>
              <span className="sens-track">
                <span className="sens-fill save" style={{ width: `${(Math.abs(v.pct) / maxSave) * 100}%` }} />
              </span>
              <span className="sens-val save">−{Math.abs(v.pct).toFixed(1)}% <em>(−{nf(v.kg)} kg)</em></span>
              <span className="sens-note">{L(v.note![0], v.note![1])}</span>
            </div>
          ))}
        </div>

        {/* ── 2. 역효과·중립 ────────────────────────────────────── */}
        <div className="sens-sec">{L('② 역효과 · 중립 (절감 아님)', '② Penalty · neutral (not savings)')}</div>
        <div className="sens-bars">
          {PENALTY.map(v => (
            <div className="sens-row" key={v.en}>
              <span className="sens-rank pen">!</span>
              <span className="sens-lbl">{L(v.ko, v.en)}</span>
              <span className="sens-track">
                <span className={'sens-fill ' + (v.pct > 1 ? 'pen' : 'neu')} style={{ width: `${(Math.abs(v.pct) / maxPen) * 100}%` }} />
              </span>
              <span className={'sens-val ' + (v.pct > 1 ? 'pen' : 'neu')}>+{v.pct.toFixed(1)}% <em>(+{nf(v.kg)} kg)</em></span>
              <span className="sens-note">{L(v.note![0], v.note![1])}</span>
            </div>
          ))}
        </div>

        <div className="sens-grid">
          {/* ── 3. 물량 구성 ───────────────────────────────────── */}
          <div className="sens-block">
            <div className="sens-sec">{L('③ 물량 구성', '③ Composition')}</div>
            <div className="sens-stack">
              {COMP.map(c => (
                <span key={c.en} className="sens-seg" style={{ width: `${c.pct}%`, background: c.color }}
                  title={`${L(c.ko, c.en)} ${nf(c.kg)} kg`}>{Math.round(c.pct)}%</span>
              ))}
            </div>
            <div className="sens-legend">
              {COMP.map(c => (
                <span key={c.en}><i style={{ background: c.color }} />{L(c.ko, c.en)} {nf(c.kg)} kg</span>
              ))}
            </div>
            <p className="sens-tip">{L('판이 전체 물량의 75%를 차지하므로, 순단면(구멍을 뺀 저항 단면) 손실을 줄이는 방법이 절감에 가장 효과적입니다.', 'Since plates are 75% of total weight, reducing net-section loss (via smaller holes, etc.) drives top savings.')}</p>
          </div>

          {/* ── 4. 볼트직경 민감도 ─────────────────────────────── */}
          <div className="sens-block">
            <div className="sens-sec">{L('④ 볼트직경 민감도', '④ Bolt diameter')}</div>
            <div className="sens-col">
              {DIA.map(d => (
                <div className="sens-colbar" key={d.d}>
                  <span className="sens-colval" style={{ color: d.pct > 0 ? '#E5484D' : '#2E9E5B' }}>
                    {d.pct > 0 ? '+' : '−'}{Math.abs(d.pct).toFixed(1)}%</span>
                  <span className="sens-colwrap">
                    <span className={'sens-colfill ' + (d.pct > 0 ? 'pen' : 'save')}
                      style={{ height: `${(Math.abs(d.pct) / maxDia) * 100}%` }} />
                  </span>
                  <span className="sens-colx">{d.d}</span>
                </div>
              ))}
            </div>
            <p className="sens-tip">{L('M20이 가장 효율적이고 직경이 커질수록 계속 나빠져 M27이 최악입니다. 단조 증가이며 U자형이 아닙니다.', 'M20 optimal; diameter effects worsen monotonically to M27 worst. Not U-shaped.')}</p>
          </div>
        </div>

        {/* ── 5. 지배 한계상태 분포 ──────────────────────────────── */}
        <div className="sens-sec">{L('⑤ 지배 한계상태 분포 (73개 부재)', '⑤ Governing limit state (73 members)')}</div>
        <div className="sens-bars">
          {GOV.map(g => (
            <div className="sens-row" key={g.en}>
              <span className="sens-lbl wide">{L(g.ko, g.en)}</span>
              <span className="sens-track">
                <span className="sens-fill gov" style={{ width: `${(g.n / maxGov) * 100}%` }} />
              </span>
              <span className="sens-val gov">{g.n}</span>
            </div>
          ))}
        </div>

        {/* ── 6. α 강도비 (설계요구 조정) ────────────────────────── */}
        <div className="sens-sec">{L('⑥ 강도비 α — 설계요구 조정(자유 절감 아님)', '⑥ Strength ratio α — design requirement (not free)')}</div>
        <div className="sens-atable">
          <div className="sens-ahead">
            <span>{L('강도비 α', 'Ratio α')}</span>
            <span>{L('결과 물량', 'Result')}</span>
            <span className="sens-abar-h">{L('절감량 (기준 8,872 kg 대비)', 'Savings vs 8,872 kg')}</span>
            <span>{L('절감률', 'Saving %')}</span>
          </div>
          {ALPHA.map(a => (
            <div className={'sens-arow' + (a.save === 0 ? ' base' : '')} key={a.a}>
              <span className="sens-acell"><b>α = {a.a}</b><em>{L('부재강도', 'member')} {a.apct}%</em></span>
              <span className="sens-acell num">{nf(a.kg)} kg</span>
              <span className="sens-abar">
                <span className="sens-abar-track">
                  <span className="sens-fill save" style={{ width: `${(a.save / 3567) * 100}%` }} />
                </span>
                <span className="sens-abar-kg">{a.save === 0 ? L('기준', 'base') : `−${nf(a.save)} kg`}</span>
              </span>
              <span className="sens-acell pctcell">{a.pct === 0 ? '—' : `−${Math.abs(a.pct).toFixed(1)}%`}</span>
            </div>
          ))}
        </div>
        <p className="sens-warn">{L(
          '※ α는 설계 요구(부재에 걸리는 예상 하중)를 줄이므로 큰 절감 효과가 있습니다. 다만 구조 규준 준수·설계 판단이 필수이며, 자유로운 최적화가 아닙니다.',
          '※ α reduces design demand (expected member load), giving larger savings. However, this requires code compliance and engineering judgment—not automatic optimization.')}</p>

        <div className="sens-foot">{L(
          '결론: 실질 절감 레버는 ①엇모제외(−11.6%) · ②판분담(−4.2%) · ③M20(−3.9%) · ④F13T(−3.1%). 연단거리·피치는 이미 최소이거나 지압·간격 제약으로 상쇄되어 절감 효과가 없음.',
          'Bottom line: real levers are no-stagger (−11.6%), plate share (−4.2%), M20 (−3.9%), F13T (−3.1%). Edge/pitch give nothing — already minimal or offset by bearing/spacing.')}</div>
      </div>
    </div>
  );
}
