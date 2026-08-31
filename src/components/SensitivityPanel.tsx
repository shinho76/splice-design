import { useState } from 'react';
import { useLang } from '../i18n.ts';

// ────────────────────────────────────────────────────────────────────────────
// 물량 민감도 분석 팝업 — 엑셀 4+1개 시트를 시각적으로 정리.
// 핵심: "무엇이 물량절감에 도움이 되는가"를 절감폭 큰 순서로 제시.
// 데이터 출처: 73개 부재 전수 최적화 측정(기준선 8,872 kg = 이음판 6,616 + 볼트 2,257).
// ────────────────────────────────────────────────────────────────────────────

const BASE = 8872; // kg 기준선

type Lever = { ko: string; en: string; kg: number; pct: number; note?: [string, string]; risk?: [string, string] };

// 물량절감 레버(음수=절감) — 효과 큰 순
const SAVINGS: Lever[] = [
  { ko: '엇모 배치 제외', en: 'No stagger', kg: -1027, pct: -11.6, note: ['지그재그 배치는 판을 길게 만들고, 정렬배치로 단축시킵니다. 판이 75%를 차지하므로 최대 절감효과가 나타납니다.', 'Staggered bolts widen pitch, lengthening plates; aligned layout shortens them. Largest savings since plates dominate (75%) the weight.'] },
  { ko: '이음판 분담(면적비)', en: 'Plate share by area', kg: -372, pct: -4.2, note: ['각 판의 강성에 따라 이음력을 나누어 담으면, 50:50 균등분담보다 더 얇은 판이 가능합니다.', 'Dividing force by each plate\'s stiffness allows thinner plates than equal 50:50 sharing.'] },
  { ko: '볼트직경 M20', en: 'Bolt Ø M20', kg: -347, pct: -3.9, note: ['작은 구멍은 순단면(구멍을 뺀 저항 단면) 손실을 줄이고, 판의 인장 여유를 늘려 판 두께를 감소시킵니다.', 'Smaller holes reduce net-section loss and boost tensile margin, allowing thinner plates.'] },
  { ko: '볼트등급 F13T', en: 'Bolt F13T', kg: -274, pct: -3.1, note: ['고강도 볼트는 같은 하중에서 필요한 볼트 개수와 미끄럼 저항 요구를 감소시킵니다.', 'Higher-strength bolts reduce required bolt count and slip resistance demand.'], risk: ['수소취성 지연파괴 우려로 사용 제한적 — 적용 시 지연파괴 대책(도금·환경·검사) 확인 필요', 'Limited use due to hydrogen-embrittlement delayed fracture — verify mitigation (coating/environment/inspection)'] },
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

// ── [보완] 상용(Preferred) H 21종 분석 — 단면군에 따라 최적 레버가 달라짐 ──
// 상용 H 기준선 1,449 kg. 지배 FM2(플랜지 부재 휨파단) 43% 압도.
// 개별 레버(상용 H, 기준 대비)
const PREF_LEVERS = [
  { ko: '이음판 강종 SM460', en: 'Plate grade SM460', pct: -11.5 },
  { ko: '엇모 배치 제외', en: 'No stagger', pct: -8.1 },
  { ko: '볼트직경 M20', en: 'Bolt Ø M20', pct: -7.2 },
  { ko: '이음판 강종 SM420', en: 'Plate grade SM420', pct: -6.1 },
  { ko: '이음판 분담(면적비)', en: 'Plate share by area', pct: -4.9 },
  { ko: '볼트등급 F13T', en: 'Bolt F13T', pct: -1.2 },
];
// 전체 H vs 상용 H 항목별 비교(정성)
const CMP = [
  { k: ['기준선', 'Baseline'], all: '8,872 kg / 73종', pref: '1,449 kg / 21종' },
  { k: ['지배항목', 'Governing'], all: ['FI2 순단면 인장파단 최다', 'FI2 net-section, mixed'], pref: ['FM2 플랜지 부재 휨파단 43%', 'FM2 flange rupture 43%'] },
  { k: ['1위 레버', 'Top lever'], all: ['엇모 제외 −11.6%', 'No-stagger −11.6%'], pref: ['판 강종 SM460 −11.5%', 'Plate SM460 −11.5%'] },
  { k: ['볼트 M20', 'Bolt M20'], all: '−3.9%', pref: '−7.2%' },
  { k: ['F13T', 'F13T'], all: '−3.1%', pref: '−1.2%' },
  { k: ['판 강종 상향', 'Plate grade'], all: ['미검토(SM355 고정)', 'not tested'], pref: ['최대 레버로 부상', 'top lever'] },
  { k: ['강도비 α 0.7 / 0.6', 'Ratio α 0.7 / 0.6'], all: '−26.9% / −40.2%', pref: '−24.8% / −39.7%' },
  { k: ['최적 조합', 'Best combo'], all: ['개별 최대 −11.6%', 'single −11.6%'], pref: ['−25.1% (조합)', '−25.1% (stacked)'] },
];
const PREF_BEST = 25.1; // 상용 H 최적조합 절감률(%)

// 권장 설계(추천) — 실무·규준 관점 우선순위
const RECO: { tier: string; cls: string; ko: string; en: string }[] = [
  { tier: '✅', cls: 'go', ko: '우선 적용 — 엇모 배치 제외(정렬) · 볼트 M20 · 이음판 분담 area. 규준상 안전하고 제작성이 좋아 대부분 부재에서 즉시 절감(≈ −15~19%).', en: 'Apply first — no-stagger, bolt M20, area-based plate share. Code-safe and shop-friendly, immediate savings on most members (≈ −15–19%).' },
  { tier: '◐', cls: 'cond', ko: '조건부 — 이음판 강종 SM460 상향(물량 최대 절감이나 고강도판 수급·용접성·연성 확인) · F13T(볼트·미끄럼 지배 부재에서만 효과, 단 수소취성 지연파괴 우려로 사용 제한적) · 갭 0mm(상세·시공 허용 시).', en: 'Conditional — upgrade plate to SM460 (largest saving, but check supply/weldability/ductility) · F13T (only where bolt/slip governs, but limited use due to hydrogen-embrittlement delayed fracture) · gap 0 mm (if detailing allows).' },
  { tier: '✕', cls: 'no', ko: '지양 — 볼트직경 확대(M22 이상, 구멍 페널티) · 연단거리 축소(지압 저하로 볼트 증가, 중립~역효과).', en: 'Avoid — larger bolt Ø (M22+, hole penalty) · reduced edge distance (bolts increase from lower bearing; neutral–negative).' },
  { tier: '⚠', cls: 'warn', ko: '별도 판단 — 강도비 α는 이음부 발현강도(구조 요구·규준)로 결정. 물량만 보고 임의로 낮추지 말 것(자유 절감 아님).', en: 'Separate — set α by the required developed strength (structural/code demand). Never lower it just to save weight (not a free lever).' },
];

// ────────────────────────────────────────────────────────────────────────────
// GS(GIRDER SPLICE) 탭 — K모드 95종 KS전단면 전수, AISC16 최적화 ON 기준 실측.
// 데이터 출처: docs/gs-sensitivity-analysis.md (엔진 직접 실행 검증, 기준선 17,180.2 kg).
// ────────────────────────────────────────────────────────────────────────────
const GS_BASE = 17180.2;

type GsLever = { ko: string; en: string; pct: number; note: [string, string]; adopted?: boolean };

// 최종 채택안 2개(도입 확정) — 절감 큰 순
const GS_ADOPTED: GsLever[] = [
  { ko: '이음판 분담비율 → 면적비례', en: 'Plate share → by area', pct: -8.8, adopted: true,
    note: ['계산방식만 변경, 부작용 거의 없음.', 'Calculation method only — negligible downside.'] },
  { ko: '엇모배치 → 제외(1열)', en: 'Stagger → excluded (single row)', pct: -8.6, adopted: true,
    note: ['AISC16 최적화가 항상 켜져 있을 때 유리 — 최적화 OFF 시 반대로 손해.', 'Favorable only while AISC16 optimizer stays ON — reverses if optimizer is OFF.'] },
];

// 검토했지만 미채택 — 절감 큰 순(페널티 포함)
const GS_EXCLUDED: GsLever[] = [
  { ko: 'H형강 강종 SHN400', en: 'H-beam grade SHN400', pct: -13.4,
    note: ['스플라이스가 아니라 부재 자체의 구조설계 사항이라 범위 밖. 비선형(SHN490은 오히려 손해)이라 검증도 더 필요.', 'Out of splice-optimization scope (member design decision). Non-monotonic — SHN490 is worse — needs more verification.'] },
  { ko: '이음판 두께 → 개별', en: 'Plate t → individual', pct: -8.9,
    note: ['상·하 플랜지판 두께를 각각 최적화하면 단독으로는 절감되나, 결합 채택안에서 추가 절감 기여가 거의 없어 제외(제작 난이도만 상승).', 'Independent top/bottom plate thickness saves alone, but adds almost nothing on top of the adopted combo — not worth the extra fab complexity.'] },
  { ko: '이음판 강종 SM460', en: 'Plate grade SM460', pct: -8.8,
    note: ['수급·용접성 부담 대비 실익이 크지 않다고 판단해 SM355 유지 확정.', 'Supply/weldability burden judged not worth it — kept SM355.'] },
  { ko: '볼트직경 M20 전단면 강제', en: 'Bolt Ø M20 forced on all sections', pct: -7.5,
    note: ['KS 표준 자동배정(폭 티어별 M16/M20/M24)을 어기는 가상 시나리오라 실제 적용 불가.', 'Violates KS standard auto-assignment by width tier — not actually applicable.'] },
  { ko: 'H형강 강종 SHN275', en: 'H-beam grade SHN275', pct: -6.7,
    note: ['SHN400과 동일 사유(부재 설계 사항)로 범위 밖.', 'Same reason as SHN400 — out of scope.'] },
  { ko: '이음판 강종 SM420', en: 'Plate grade SM420', pct: -4.3,
    note: ['SM460과 동일 사유로 미채택.', 'Same reason as SM460 — not adopted.'] },
  { ko: '갭 → 0mm', en: 'Gap → 0mm', pct: -1.2,
    note: ['효과가 작고(−1.2%) 결합 채택안에서 추가 절감 기여가 거의 없어 제외. 시공 이격 여유는 남겨둠.', 'Small effect (−1.2%) with almost no extra contribution once combined with the adopted levers — kept the erection gap.'] },
  { ko: '볼트직경 M24 전단면 강제', en: 'Bolt Ø M24 forced on all sections', pct: -0.8,
    note: ['M20과 동일 사유(표준 위반)로 적용 불가.', 'Same reason as M20 — not applicable.'] },
  { ko: '볼트직경 M22 전단면 강제', en: 'Bolt Ø M22 forced on all sections', pct: 1.2,
    note: ['표준 위반 + 효과도 미미.', 'Standard violation, negligible effect.'] },
  { ko: '볼트재질 F13T', en: 'Bolt grade F13T', pct: 1.5,
    note: ['절감이 아니라 페널티(실패 단면도 4→6 증가). 수소취성 지연파괴 리스크까지 있어 비권장.', 'A penalty, not a saving (failures rise 4→6). Also carries hydrogen-embrittlement delayed-fracture risk.'] },
  { ko: '나사부 X (전단면 제외)', en: 'Thread condition X', pct: 0.0,
    note: ['집계 물량 기준 효과 없음(볼트전단이 지배 항목인 경우가 드묾). 바꿀 이유 없음.', 'No aggregate effect (bolt shear rarely governs here). No reason to change.'] },
  { ko: 'H형강 강종 SHN490', en: 'H-beam grade SHN490', pct: 8.6,
    note: ['강종 상향이 부재 소요력도 같이 키워 오히려 손해. 부재 설계 사항이라 범위 밖.', 'Grade increase also raises demand — net penalty. Out of scope regardless.'] },
  { ko: '볼트직경 M16 전단면 강제', en: 'Bolt Ø M16 forced on all sections', pct: 4.2,
    note: ['좁은 단면엔 맞지만 큰 단면에서 볼트수 급증. 표준 위반이기도 함.', 'Fine for narrow sections but bolt count explodes on wide ones. Also a standard violation.'] },
  { ko: '볼트직경 M27 전단면 강제', en: 'Bolt Ø M27 forced on all sections', pct: 10.3,
    note: ['순단면 손실 급증. 표준 위반.', 'Sharp net-section loss. Standard violation.'] },
  { ko: '볼트직경 M30 전단면 강제', en: 'Bolt Ø M30 forced on all sections', pct: 30.0,
    note: ['가장 큰 페널티. 표준 위반.', 'Worst penalty. Standard violation.'] },
];

// 강도비 α — 자유 절감 레버 아님, 별도 취급
const GS_ALPHA: { a: string; apct: number; kg: number; pct: number }[] = [
  { a: '1.0', apct: 100, kg: 17180.2, pct: 0 },
  { a: '0.9', apct: 90, kg: 17840.6, pct: 3.8 },
  { a: '0.8', apct: 80, kg: 15428.6, pct: -10.2 },
  { a: '0.7', apct: 70, kg: 12914.1, pct: -24.8 },
  { a: '0.6', apct: 60, kg: 10631.3, pct: -38.1 },
  { a: '0.5', apct: 50, kg: 8191.0, pct: -52.3 },
];

// 최종 채택안 결합 시나리오(2개 동시 적용, 이음판두께·갭은 제외, 이음판 강종 SM355 유지) — 엔진 재계산값
const GS_COMBO = { base: GS_BASE, kg: 14527.4, pct: -15.4, fails: 4, baseFails: 4 };

const nf = (v: number) => Math.abs(v).toLocaleString('en-US');

export default function SensitivityPanel({ onClose, girderLock }: { onClose: () => void; girderLock?: boolean }) {
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);
  const [tab, setTab] = useState<'all' | 'gs'>(girderLock ? 'gs' : 'all');
  const gsMaxLever = Math.max(...GS_ADOPTED.map(v => Math.abs(v.pct)), ...GS_EXCLUDED.map(v => Math.abs(v.pct)));
  const gsMaxAlpha = Math.max(...GS_ALPHA.map(v => Math.abs(v.pct)));

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
        <div className="seg sens-tabseg" role="group" aria-label={L('민감도 탭', 'Sensitivity tab')}>
          <button type="button" className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{L('전체 (73종)', 'All (73)')}</button>
          <button type="button" className={tab === 'gs' ? 'on' : ''} onClick={() => setTab('gs')}>GS (GIRDER SPLICE)</button>
        </div>
        {tab === 'all' && <>
        <p className="cond-line">
          {L('기준선', 'Baseline')} <b>{nf(BASE)} kg</b>
          <span className="qty-badge">{L('이음판', 'Plate')} 6,616 kg (75%) · {L('볼트', 'Bolt')} 2,257 kg (25%) · 73{L('개 부재', ' members')}</span>
        </p>

        <div className="sens-body">
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
              <span className="sens-note">
                {L(v.note![0], v.note![1])}
                {v.risk && <span className="sens-risk">⚠ {L(v.risk[0], v.risk[1])}</span>}
              </span>
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

        {/* ── 7. [보완] 전체 H vs 상용 H 비교 ────────────────────── */}
        <div className="sens-sec">{L('⑦ 상용(Preferred) H 비교 — 단면군에 따라 최적 레버가 달라진다', '⑦ Preferred-H comparison — best lever shifts by section set')}</div>

        {/* 상용 H 개별 레버 막대 */}
        <div className="sens-bars" style={{ marginBottom: 10 }}>
          {PREF_LEVERS.map((v, i) => (
            <div className="sens-row" key={v.en}>
              <span className="sens-rank">{i + 1}</span>
              <span className="sens-lbl">{L(v.ko, v.en)}</span>
              <span className="sens-track">
                <span className="sens-fill save" style={{ width: `${(Math.abs(v.pct) / 11.5) * 100}%` }} />
              </span>
              <span className="sens-val save">−{Math.abs(v.pct).toFixed(1)}%</span>
            </div>
          ))}
        </div>

        {/* 전체 H vs 상용 H 비교표 */}
        <div className="sens-cmp">
          <div className="sens-cmp-h">
            <span>{L('항목', 'Item')}</span>
            <span>{L('전체 H (73종)', 'All H (73)')}</span>
            <span>{L('상용 H (21종)', 'Preferred H (21)')}</span>
          </div>
          {CMP.map(r => (
            <div className="sens-cmp-r" key={r.k[0]}>
              <span className="sens-cmp-k">{L(r.k[0], r.k[1])}</span>
              <span>{Array.isArray(r.all) ? L(r.all[0], r.all[1]) : r.all}</span>
              <span className="hi">{Array.isArray(r.pref) ? L(r.pref[0], r.pref[1]) : r.pref}</span>
            </div>
          ))}
        </div>

        <div className="sens-callout">
          <b>{L('상용 H 최적 조합', 'Preferred-H best combo')} −{PREF_BEST.toFixed(1)}%</b>
          <span>{L(
            '이음판 SM460 + 엇모 제외 + 볼트 M20·F13T + 분담 area + 갭 0mm → 1,085 kg (전 부재 DCR ≤ 1.0)',
            'Plate SM460 + no-stagger + M20·F13T + area share + gap 0 → 1,085 kg (all DCR ≤ 1.0)')}</span>
        </div>

        <div className="sens-foot">{L(
          '결론: 전체 H는 순단면(구멍) 인장파단이 지배 → 엇모제외·볼트직경이 핵심. 상용 H는 플랜지 부재 휨파단이 지배 → 이음판이 물량의 74%라 「이음판 강종 상향(SM460)」이 최대 레버로 부상(−11.5%). 판 강종은 원 민감도(SM355 고정)에서 빠진 숨은 최대 레버이며, 엇모제외·M20·판분담은 두 경우 모두 유효. 볼트직경 확대는 둘 다 역효과.',
          'Bottom line: All-H is net-section-governed → no-stagger & bolt Ø dominate. Preferred-H is flange-member-governed → since plates are 74% of weight, upgrading plate grade (SM460) becomes the top lever (−11.5%) — a hidden lever the original study fixed at SM355. No-stagger, M20 and area-share help in both; larger bolt Ø hurts in both.')}</div>

        {/* ── 권장 설계 (추천) ──────────────────────────────────── */}
        <div className="sens-sec">{L('◎ 권장 설계 (추천)', '◎ Recommended design')}</div>
        <div className="sens-reco">
          {RECO.map(r => (
            <div className={'sens-reco-r ' + r.cls} key={r.tier + r.cls}>
              <span className="sens-reco-t">{r.tier}</span>
              <span className="sens-reco-d">{L(r.ko, r.en)}</span>
            </div>
          ))}
        </div>
        </div>
        </>}

        {tab === 'gs' && (
        <>
        <p className="cond-line">
          {L('기준선(GS·95종·AISC16 최적화 ON)', 'Baseline (GS · 95 sections · AISC16 optimizer ON)')} <b>{nf(GS_BASE)} kg</b>
          <span className="qty-badge">{L('최종 채택안', 'Final adopted plan')} −{Math.abs(GS_COMBO.pct).toFixed(1)}%</span>
        </p>

        <div className="sens-body">
        {/* ── 최종 채택안 콜아웃 ─────────────────────── */}
        <div className="sens-callout">
          <b>{L('최종 채택안', 'Final adopted plan')} −{Math.abs(GS_COMBO.pct).toFixed(1)}%</b>
          <span>{L(
            `엇모 제외(1열) + 분담비율 면적비례 (이음판두께·갭은 미채택, 이음판 강종 SM355 유지) → ${nf(GS_COMBO.kg)} kg (기준 ${nf(GS_COMBO.base)} kg 대비, 부분강도 단면 ${GS_COMBO.fails}개 — 기준과 동일, 안전성 저하 없음)`,
            `No-stagger + area-based plate share (plate-thickness split and gap not adopted; plate grade kept SM355) → ${nf(GS_COMBO.kg)} kg vs baseline ${nf(GS_COMBO.base)} kg (partial-strength count ${GS_COMBO.fails} — same as baseline, no loss of safety margin)`)}</span>
        </div>

        {/* ── 채택 2개 ─────────────────────── */}
        <div className="sens-sec">{L('✓ 채택 — GS 기본값 변경 확정 2건', '✓ Adopted — 2 confirmed GS default changes')}</div>
        <div className="sens-bars">
          {GS_ADOPTED.map((v, i) => (
            <div className="sens-row" key={v.en}>
              <span className="sens-rank">{i + 1}</span>
              <span className="sens-lbl">{L(v.ko, v.en)}</span>
              <span className="sens-track">
                <span className="sens-fill save" style={{ width: `${(Math.abs(v.pct) / gsMaxLever) * 100}%` }} />
              </span>
              <span className="sens-val save">{v.pct < 0 ? '−' : '+'}{Math.abs(v.pct).toFixed(1)}%</span>
              <span className="sens-note">{L(v.note[0], v.note[1])}</span>
            </div>
          ))}
        </div>

        {/* ── 검토 후 미채택 ─────────────────────── */}
        <div className="sens-sec">{L('검토 후 미채택 — 참고용', 'Reviewed but not adopted — for reference')}</div>
        <div className="sens-bars">
          {GS_EXCLUDED.map((v, i) => (
            <div className="sens-row" key={v.en}>
              <span className="sens-rank pen">{i + 1}</span>
              <span className="sens-lbl">{L(v.ko, v.en)}</span>
              <span className="sens-track">
                <span className={'sens-fill ' + (v.pct > 0 ? 'pen' : 'neu')} style={{ width: `${(Math.abs(v.pct) / gsMaxLever) * 100}%` }} />
              </span>
              <span className={'sens-val ' + (v.pct > 0 ? 'pen' : 'neu')}>{v.pct < 0 ? '−' : v.pct > 0 ? '+' : ''}{Math.abs(v.pct).toFixed(1)}%</span>
              <span className="sens-note">{L(v.note[0], v.note[1])}</span>
            </div>
          ))}
        </div>

        {/* ── 강도비 α ─────────────────────── */}
        <div className="sens-sec">{L('강도비 α — 설계요구 조정(자유 절감 아님)', 'Strength ratio α — design requirement (not free)')}</div>
        <div className="sens-atable">
          <div className="sens-ahead">
            <span>{L('강도비 α', 'Ratio α')}</span>
            <span>{L('결과 물량', 'Result')}</span>
            <span className="sens-abar-h">{L('절감률 (기준 100% 대비)', 'Change vs 100%')}</span>
            <span>{L('절감률', 'Saving %')}</span>
          </div>
          {GS_ALPHA.map(a => (
            <div className={'sens-arow' + (a.pct === 0 ? ' base' : '')} key={a.a}>
              <span className="sens-acell"><b>α = {a.a}</b><em>{L('부재강도', 'member')} {a.apct}%</em></span>
              <span className="sens-acell num">{nf(a.kg)} kg</span>
              <span className="sens-abar">
                <span className="sens-abar-track">
                  <span className={'sens-fill ' + (a.pct <= 0 ? 'save' : 'pen')} style={{ width: `${(Math.abs(a.pct) / gsMaxAlpha) * 100}%` }} />
                </span>
                <span className="sens-abar-kg">{a.pct === 0 ? L('기준', 'base') : `${a.pct > 0 ? '+' : '−'}${nf(a.kg - GS_BASE)} kg`}</span>
              </span>
              <span className="sens-acell pctcell">{a.pct === 0 ? '—' : `${a.pct > 0 ? '+' : '−'}${Math.abs(a.pct).toFixed(1)}%`}</span>
            </div>
          ))}
        </div>
        <p className="sens-warn">{L(
          '※ α는 부재 자체의 구조요구이며, 90%가 100%보다 오히려 무거워지는 비단조 구간이 있어 실사용 전 개별 검증을 권장한다. 물량 절감을 위해 임의로 낮추지 말 것.',
          '※ α is a structural requirement; note the non-monotonic dip at 90% (heavier than 100%) — verify per-case before relying on it. Never lower α purely to save material.')}</p>

        <p className="sens-tip">{L(
          '데이터 출처: docs/gs-sensitivity-analysis.md — GS 모드(K모드·95종 KS전단면), AISC16 최적화 항상 ON, 엔진 직접 실행(designConnection + aiscAutoCorrect + quantityOf) 검증.',
          'Source: docs/gs-sensitivity-analysis.md — GS mode (K-mode, 95 KS sections), AISC16 optimizer always ON, verified by direct engine execution.')}</p>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
