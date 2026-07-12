import { useRef } from 'react';
import type { ProjectItem } from '../engine/project.ts';
import { condLabel, parseProjectJson } from '../engine/project.ts';
import { sectionByName } from '../engine/sections.ts';
import { designConnection } from '../engine/engine.ts';
import { quantityOf, aggregate } from '../engine/quantity.ts';
import { downloadFile } from '../engine/dxf.ts';
import { downloadXlsx } from '../engine/xlsxOut.ts';

const nf = (v: number) => v.toLocaleString('en-US');

export default function ProjectPanel({ items, onChange, onClose }: {
  items: ProjectItem[]; onChange: (i: ProjectItem[]) => void; onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rows = items.map(it => {
    const sec = sectionByName(it.section);
    const q = sec ? quantityOf(designConnection(it.cond, sec), it.cond) : null;
    return { it, q };
  });
  const qs = rows.map(r => r.q).filter((q): q is NonNullable<typeof q> => !!q);
  const agg = aggregate(qs);

  const remove = (id: string) => onChange(items.filter(x => x.id !== id));
  const saveJson = () => downloadFile('splice_project.json', JSON.stringify(items, null, 2), 'application/json');
  const loadJson = (f: File) => f.text().then(t => { try { onChange(parseProjectJson(t)); } catch { alert('불러오기 실패: JSON 형식 오류'); } });

  return (
    <div className="report" onClick={onClose}>
      <div className="report-card qty-card" onClick={e => e.stopPropagation()}>
        <div className="report-tools">
          <button className="tool-btn" onClick={() => downloadXlsx(qs, '프로젝트 물량산정', 'project_물량.xlsx')} disabled={!qs.length}>⬇ Excel</button>
          <button className="tool-btn" onClick={saveJson} disabled={!items.length}>💾 저장</button>
          <button className="tool-btn" onClick={() => fileRef.current?.click()}>📂 불러오기</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={e => e.target.files?.[0] && loadJson(e.target.files[0])} />
          <button className="close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <h2>프로젝트 부재 ({items.length})</h2>
        <p className="cond-line">
          여러 부재를 담아 물량을 합산·저장합니다.
          {items.length > 0 && <span className="qty-badge">총 볼트 {nf(agg.totalBolts)}개 · 첨판 {nf(agg.totalWeightKg)} kg</span>}
        </p>

        {items.length === 0 ? (
          <p className="note">계산서 화면의 <b>＋ 프로젝트 담기</b> 버튼으로 부재를 추가하세요. 저장한 .json을 불러올 수도 있습니다.</p>
        ) : (
          <div className="tablewrap">
            <table className="design-table qty-table">
              <thead>
                <tr>
                  <th className="col-name gcol">단면치수</th>
                  <th className="gcol">설계조건</th>
                  <th className="gcol">볼트</th>
                  <th className="gcol">개수</th>
                  <th>첨판중량(kg)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ it, q }) => (
                  <tr key={it.id}>
                    <td className="col-name gcol">{it.section}</td>
                    <td className="gcol" style={{ textAlign: 'left', fontSize: 11 }}>{condLabel(it.cond)}</td>
                    <td className="gcol">{q?.bolts[0].name ?? '—'}</td>
                    <td className="gcol">{q?.boltCount ?? '—'}</td>
                    <td>{q ? nf(q.plateWeightKg) : '—'}</td>
                    <td><button className="row-del" onClick={() => remove(it.id)} aria-label="삭제">✕</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="qty-total">
                  <td className="col-name gcol">합계</td>
                  <td className="gcol" colSpan={2}>{Object.entries(agg.boltByName).map(([k, v]) => `${k} ${nf(v)}`).join(' / ')}</td>
                  <td className="gcol">{nf(agg.totalBolts)}</td>
                  <td>{nf(agg.totalWeightKg)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
