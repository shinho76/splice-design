import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DesignCondition } from '../engine/types.ts';
import { sectionByName } from '../engine/sections.ts';
import { connPartsShear, type ShearPartBolt } from '../engine/shear/connParts.ts';
import type { ShearResult } from '../engine/shear/singlePlate.ts';
import { useLang } from '../i18n.ts';

// GS(ThreeViewer.tsx)의 hShape()와 동일 — 단면 프로파일(필렛R 포함) 압출용.
function hShape(B: number, H: number, tw: number, tf: number, r: number) {
  const b = B / 2, h = H / 2, w = tw / 2, yi = h - tf, rr = Math.min(r, yi - 1, b - w - 1);
  const s = new THREE.Shape(), P = Math.PI;
  s.moveTo(-b, h); s.lineTo(b, h); s.lineTo(b, yi); s.lineTo(w + rr, yi);
  s.absarc(w + rr, yi - rr, rr, P / 2, P, false);
  s.lineTo(w, -(yi - rr)); s.absarc(w + rr, -(yi - rr), rr, P, 1.5 * P, false);
  s.lineTo(b, -yi); s.lineTo(b, -h); s.lineTo(-b, -h); s.lineTo(-b, -yi); s.lineTo(-(w + rr), -yi);
  s.absarc(-(w + rr), -(yi - rr), rr, 1.5 * P, 2 * P, false);
  s.lineTo(-w, yi - rr); s.absarc(-(w + rr), yi - rr, rr, 0, P / 2, false);
  s.lineTo(-b, yi); s.closePath(); return s;
}

/** SC(단일판 전단접합) 3D 뷰어 — GS ThreeViewer의 렌더링 기법을 재사용하되,
 *  피지지보 1개 + 전단판(편측) + 볼트군만 표시(지지부재는 Phase 1 엔진이 산정하지 않아 미표시). */
export default function ShearViewer({ r, cond, onClose }: { r: ShearResult; cond: DesignCondition; onClose: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const lang = useLang();
  const L = (ko: string, en: string) => (lang === 'en' ? en : ko);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const P = connPartsShear(r);
    const W = el.clientWidth || 1000, Hh = el.clientHeight || 620;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1524);
    const dist = Math.max(P.H, P.segLen, P.B) * 1.9;
    const camera = new THREE.PerspectiveCamera(38, W / Hh, 1, 9000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, Hh); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.6); d1.position.set(500, 700, 600); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x88aaff, 0.7); d2.position.set(-600, 200, -400); scene.add(d2);
    const grid = new THREE.GridHelper(P.segLen * 3, 24, 0x24406a, 0x182c4a);
    grid.position.y = -P.H / 2 - 80; grid.position.z = P.segLen / 2; scene.add(grid);

    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, metalness: 0.75, roughness: 0.42 });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x2bb6d6, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.9 });
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, metalness: 0.9, roughness: 0.34 });
    const nutMat = new THREE.MeshStandardMaterial({ color: 0x232529, metalness: 0.9, roughness: 0.4 });
    const washMat = new THREE.MeshStandardMaterial({ color: 0x8b929c, metalness: 0.85, roughness: 0.4 });

    const model = new THREE.Group(); scene.add(model);
    const hSh = hShape(P.B, P.H, P.tw, P.tf, P.r);
    const beamGeo = new THREE.ExtrudeGeometry(hSh, { depth: P.segLen, bevelEnabled: false });
    const beam = new THREE.Mesh(beamGeo, steel);   // z=0(지지면) → +z
    model.add(beam);

    const pm = new THREE.Mesh(new THREE.BoxGeometry(P.plate.sx, P.plate.sy, P.plate.sz), plateMat);
    pm.position.set(P.plate.cx, P.plate.cy, P.plate.cz);
    model.add(pm);

    const wH = 3.2;
    const makeBolt = (b: ShearPartBolt) => {
      const g = new THREE.Group();
      const wR = b.headR * 1.05, shankLen = b.grip + 2 * wH + b.nutH + b.protr;
      const shank = new THREE.Mesh(new THREE.CylinderGeometry(b.shankR, b.shankR, shankLen, 20), boltMat);
      shank.position.y = -(b.nutH + b.protr) / 2; g.add(shank);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(b.headR, b.headR, b.headH, 6), boltMat);
      head.position.y = b.grip / 2 + wH + b.headH / 2; g.add(head);
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(b.headR, b.headR, b.nutH, 6), nutMat);
      nut.position.y = -(b.grip / 2 + wH + b.nutH / 2); g.add(nut);
      for (const s of [-1, 1] as const) {
        const wsh = new THREE.Mesh(new THREE.CylinderGeometry(wR, wR, wH, 20), washMat);
        wsh.position.y = s * (b.grip / 2 + wH / 2); g.add(wsh);
      }
      g.position.set(b.cx, b.cy, b.cz);
      g.rotation.z = -Math.PI / 2;   // 축=X(웨브 관통)
      return g;
    };
    for (const b of P.bolts) model.add(makeBolt(b));
    model.updateMatrixWorld(true);

    const bbox = new THREE.Box3().setFromObject(model);
    const center = bbox.getCenter(new THREE.Vector3());
    controls.target.copy(center);
    camera.position.set(center.x + dist * 0.72, center.y + dist * 0.5, center.z + dist * 0.92);
    camera.lookAt(center);

    let raf = 0, spin = true, t = 0;
    controls.addEventListener('start', () => { spin = false; });
    const render = () => {
      raf = requestAnimationFrame(render);
      if (spin) {
        t += 0.0035;
        camera.position.x = center.x + Math.cos(t) * dist * 0.92;
        camera.position.z = center.z + Math.sin(t) * dist * 0.92;
        camera.lookAt(center);
      }
      controls.update(); renderer.render(scene, camera);
    };
    render();

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); beamGeo.dispose();
      renderer.domElement.remove();
    };
  }, [r, lang]);

  return (
    <div className="v3d-back" onClick={onClose}>
      <div className="v3d-card" onClick={e => e.stopPropagation()}>
        <div className="v3d-top">
          <b>{sectionByName(r.section)?.label ?? r.section}</b>{sectionByName(r.section)?.label && <span className="v3d-mm">{r.section}</span>}
          <span>· {L('단일판 전단접합', 'Single-plate shear')} · {cond.steel} · {cond.bolt}</span>
          <button className="close" onClick={onClose} aria-label={L('닫기', 'Close')}>✕</button>
        </div>
        <div className="v3d-canvas" ref={mount} />
        <div className="v3d-legend">
          <span><i style={{ background: '#9aa7b4' }} />{L('H형강(필렛R)', 'H-beam (fillet R)')}</span>
          <span><i style={{ background: '#2bb6d6' }} />{L('전단판', 'Shear plate')}</span>
          <span><i style={{ background: '#2e3138' }} />{L('고력볼트(머리·너트·와셔2·여장)', 'H.S. bolt (head·nut·2 washers·stickout)')}</span>
          <span className="v3d-hint">{L('드래그=회전 · 휠=줌 (피지지보만 표시 — 지지 부재는 별도 검토)', 'Drag=rotate · Wheel=zoom (supported member only — support side not modeled)')}</span>
        </div>
      </div>
    </div>
  );
}
