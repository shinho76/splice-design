import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { DesignResult, DesignCondition } from '../engine/types.ts';
import { connParts, type PartBolt } from '../engine/connParts.ts';
import { connChecks } from '../engine/connChecks.ts';

// H형강 단면 Shape(필렛 R) — 압출용
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

export default function ThreeViewer({ r, cond, onClose }: { r: DesignResult; cond: DesignCondition; onClose: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const annoRef = useRef<THREE.Group | null>(null);
  const regRef = useRef<{ flange: THREE.Group; web: THREE.Group } | null>(null);
  const [checkOn, setCheckOn] = useState(false);
  const [regions, setRegions] = useState({ flange: true, web: true });
  const C = connChecks(r);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const P = connParts(r);
    const W = el.clientWidth || 800, Hh = el.clientHeight || 520;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1524);
    const camera = new THREE.PerspectiveCamera(38, W / Hh, 1, 8000);
    const dist = Math.max(P.H, P.segLen * 2, P.B) * 1.7;
    camera.position.set(dist * 0.72, dist * 0.5, dist * 0.92);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, Hh); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const labelR = new CSS2DRenderer();
    labelR.setSize(W, Hh);
    labelR.domElement.style.position = 'absolute';
    labelR.domElement.style.top = '0'; labelR.domElement.style.left = '0';
    labelR.domElement.style.pointerEvents = 'none';
    el.appendChild(labelR.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.6); d1.position.set(500, 700, 600); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x88aaff, 0.7); d2.position.set(-600, 200, -400); scene.add(d2);
    const grid = new THREE.GridHelper(P.segLen * 4, 24, 0x24406a, 0x182c4a);
    grid.position.y = -P.H / 2 - 80; scene.add(grid);

    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, metalness: 0.75, roughness: 0.42 });
    const flgMat = new THREE.MeshStandardMaterial({ color: 0x39c46e, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.9 });
    const webMat = new THREE.MeshStandardMaterial({ color: 0x2bb6d6, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.9 });
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, metalness: 0.9, roughness: 0.34 });   // 어두운 강재색
    const nutMat = new THREE.MeshStandardMaterial({ color: 0x232529, metalness: 0.9, roughness: 0.4 });

    const beamGeo = new THREE.ExtrudeGeometry(hShape(P.B, P.H, P.tw, P.tf, P.r), { depth: P.segLen, bevelEnabled: false });
    for (const sgn of [1, -1] as const) {
      const m = new THREE.Mesh(beamGeo, steel);
      m.position.z = sgn > 0 ? P.gap / 2 : -P.gap / 2 - P.segLen; scene.add(m);
    }
    for (const bx of P.boxes) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bx.sx, bx.sy, bx.sz), bx.kind === 'web' ? webMat : flgMat);
      m.position.set(bx.cx, bx.cy, bx.cz); scene.add(m);
    }
    const makeBolt = (b: PartBolt) => {
      const g = new THREE.Group();
      const shankLen = b.grip + b.nutH + b.protr;
      const shank = new THREE.Mesh(new THREE.CylinderGeometry(b.shankR, b.shankR, shankLen, 20), boltMat);
      shank.position.y = b.dir * (b.nutH + b.protr) / 2; g.add(shank);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(b.headR, b.headR, b.headH, 6), boltMat);
      head.position.y = -b.dir * (b.grip / 2 + b.headH / 2); g.add(head);
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(b.headR, b.headR, b.nutH, 6), nutMat);
      nut.position.y = b.dir * (b.grip / 2 + b.nutH / 2); g.add(nut);
      g.position.set(b.cx, b.cy, b.cz);
      if (b.axis === 'x') g.rotation.z = -Math.PI / 2;
      return g;
    };
    for (const b of P.bolts) scene.add(makeBolt(b));

    // ── 치수·검토 주석(부위별 그룹, 토글) ──
    const anno = new THREE.Group(); anno.visible = false; scene.add(anno); annoRef.current = anno;
    const regG = { flange: new THREE.Group(), web: new THREE.Group() };
    anno.add(regG.flange, regG.web); regRef.current = regG;
    const dimMat = new THREE.LineBasicMaterial({ color: 0xffd54a });
    for (const d of C.dims) {
      const a = new THREE.Vector3(...d.a), b = new THREE.Vector3(...d.b);
      const g = regG[d.region];
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), dimMat));
      const div = document.createElement('div'); div.className = 'v3d-lbl'; div.textContent = d.label;
      const lbl = new CSS2DObject(div); lbl.position.copy(a.clone().add(b).multiplyScalar(0.5)); g.add(lbl);
    }

    let raf = 0, spin = true, t = 0;
    controls.addEventListener('start', () => { spin = false; });
    const render = () => {
      raf = requestAnimationFrame(render);
      if (spin) { t += 0.0035; camera.position.x = Math.cos(t) * dist * 0.92; camera.position.z = Math.sin(t) * dist * 0.92; camera.lookAt(0, 0, 0); }
      controls.update(); renderer.render(scene, camera); labelR.render(scene, camera);
    };
    render();

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      if (w && h) { camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); labelR.setSize(w, h); }
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); beamGeo.dispose();
      annoRef.current = null; regRef.current = null;
      renderer.domElement.remove(); labelR.domElement.remove();
    };
  }, [r]);

  useEffect(() => { if (annoRef.current) annoRef.current.visible = checkOn; }, [checkOn]);
  useEffect(() => {
    const g = regRef.current; if (!g) return;
    g.flange.visible = regions.flange; g.web.visible = regions.web;
  }, [regions, checkOn]);

  return (
    <div className="v3d-back" onClick={onClose}>
      <div className="v3d-card" onClick={e => e.stopPropagation()}>
        <div className="v3d-top">
          <b>{r.section}</b><span>· {cond.member} {cond.jointType}접합 · {cond.bolt} · 3D</span>
          <button className={'v3d-toggle' + (checkOn ? ' on' : '')} onClick={() => setCheckOn(v => !v)}>📐 검토</button>
          {checkOn && <div className="v3d-regions">
            {(['flange', 'web'] as const).map(k => (
              <button key={k} className={'v3d-chip' + (regions[k] ? ' on' : '')} onClick={() => setRegions(s => ({ ...s, [k]: !s[k] }))}>
                {k === 'flange' ? '플랜지' : '웨브'}
              </button>
            ))}
          </div>}
          <button className="close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="v3d-canvas" ref={mount}>
          {checkOn && (
            <div className="v3d-checks" onClick={e => e.stopPropagation()}>
              <div className="v3d-checks-h">설치 검토 · AISC (M{C.db})</div>
              {C.checks.map((c, i) => (
                <div key={i} className={'v3d-chk' + (c.ok ? '' : ' ng')}>
                  <span className="ck-ic">{c.ok ? '✔' : '⚠'}</span>
                  <span className="ck-lb">{c.label}</span>
                  <span className="ck-vl">{c.value}<em>{c.limit}</em></span>
                  {c.note && <span className="ck-nt">{c.note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="v3d-legend">
          <span><i style={{ background: '#9aa7b4' }} />H형강(필렛R)</span>
          <span><i style={{ background: '#39c46e' }} />플랜지 첨판</span>
          <span><i style={{ background: '#2bb6d6' }} />웨브 첨판</span>
          <span><i style={{ background: '#e6b422' }} />고력볼트(머리·너트·여장)</span>
          <span className="v3d-hint">드래그=회전 · 휠=줌 · 📐검토=치수/간섭</span>
        </div>
      </div>
    </div>
  );
}
