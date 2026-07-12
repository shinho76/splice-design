import { useEffect, useState } from 'react';
import type { DesignCondition, DesignResult } from './engine/types.ts';
import FilterBar from './components/FilterBar.tsx';
import ResultTable from './components/ResultTable.tsx';
import CalcReport from './components/CalcReport.tsx';
import QuantityPanel from './components/QuantityPanel.tsx';
import ProjectPanel from './components/ProjectPanel.tsx';
import { loadProject, persistProject, newItem, type ProjectItem } from './engine/project.ts';
import { SECTIONS } from './engine/sections.ts';

const DEFAULT: DesignCondition = {
  member: '보', jointType: '마찰', steel: 'SHN490', bolt: 'F10T', strengthRatio: 1.0, sectionType: '압연',
};

export default function App() {
  const [cond, setCond] = useState<DesignCondition>(DEFAULT);
  const [selected, setSelected] = useState<DesignResult | null>(null);
  const [showQty, setShowQty] = useState(false);
  const [showProj, setShowProj] = useState(false);
  const [project, setProject] = useState<ProjectItem[]>(loadProject);
  const [dark, setDark] = useState(() =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  useEffect(() => { persistProject(project); }, [project]);

  const addToProject = (r: DesignResult) => setProject(p => [...p, newItem(r.section, cond)]);

  const sectionCount = SECTIONS.length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">S</span>
          <div>
            <h1>SPLICE<span className="accent">DESIGN</span></h1>
            <p>고력볼트 표준접합 설계 · KBC-09 · 한국강구조학회 표준접합상세</p>
          </div>
        </div>
        <button className="theme-btn" onClick={() => setDark(d => !d)} aria-label="테마 전환">
          {dark ? '☀' : '☾'}
        </button>
      </header>

      <FilterBar cond={cond} onChange={setCond} />

      <div className="badge-row">
        <span className="chip">{cond.member}</span>
        <span className="chip">{cond.jointType}접합</span>
        <span className="chip">{cond.steel}</span>
        <span className="chip">{cond.bolt}</span>
        <span className="chip accent-chip">α {Math.round(cond.strengthRatio * 100)}%</span>
        <span className="hint">행을 클릭하면 계산서가 열립니다</span>
        <button className="qty-open" onClick={() => setShowProj(true)}>🗂 프로젝트 {project.length ? `(${project.length})` : ''}</button>
        <button className="qty-open" onClick={() => setShowQty(true)}>📋 물량산정</button>
      </div>

      <ResultTable cond={cond} onSelect={setSelected} />

      <div className="statusbar">
        <span className="sdot" />
        <span>준비됨 — 행 클릭 시 상세 계산서·접합상세도(SVG)·DXF 출력</span>
        <span className="sright">{cond.member} · {cond.jointType} · {sectionCount}종 · KBC-09</span>
      </div>

      {selected && <CalcReport result={selected} cond={cond} onClose={() => setSelected(null)} onAdd={addToProject} />}
      {showQty && <QuantityPanel cond={cond} onClose={() => setShowQty(false)} />}
      {showProj && <ProjectPanel items={project} onChange={setProject} onClose={() => setShowProj(false)} />}
    </div>
  );
}
