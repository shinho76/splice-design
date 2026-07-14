import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { DesignResult, DesignCondition } from '../engine/types.ts';
import { connParts, type PartBolt } from '../engine/connParts.ts';
import { connChecks } from '../engine/connChecks.ts';

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

// 캔버스 텍스처 스프라이트 라벨(멀티뷰포트 대응)
function makeLabel(text: string, worldH: number): THREE.Sprite {
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d')!;
  const fs = 34, pad = 9; ctx.font = `700 ${fs}px monospace`;
  const tw = Math.ceil(ctx.measureText(text).width);
  cv.width = tw + pad * 2; cv.height = fs + pad * 2;
  ctx.font = `700 ${fs}px monospace`;
  ctx.fillStyle = 'rgba(16,26,46,0.82)';
  ctx.beginPath(); ctx.roundRect(0, 0, cv.width, cv.height, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,213,74,0.45)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#ffd54a'; ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, cv.height / 2 + 1);
  const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true }));
  spr.scale.set(worldH * cv.width / cv.height, worldH, 1);
  return spr;
}

export default function ThreeViewer({ r, cond, onClose }: { r: DesignResult; cond: DesignCondition; onClose: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const dimRef = useRef<{ regG: Record<'flange' | 'web', THREE.Group> } | null>(null);
  const modeRef = useRef<'3D' | '2D'>('3D');
  const [mode, setMode] = useState<'3D' | '2D'>('3D');
  const [regions, setRegions] = useState({ flange: false, web: false });
  const [showChk, setShowChk] = useState(false);
  const C = connChecks(r);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const P = connParts(r);
    const isCol = cond.member === '기둥';   // 기둥: 부재축(길이)을 수직으로 세워 표시
    const W = el.clientWidth || 1000, Hh = el.clientHeight || 620;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1524);
    const dist = Math.max(P.H, P.segLen * 2, P.B) * 1.7;
    const camera = new THREE.PerspectiveCamera(38, W / Hh, 1, 9000);
    camera.position.set(dist * 0.72, dist * 0.5, dist * 0.92);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, Hh); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.6); d1.position.set(500, 700, 600); scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x88aaff, 0.7); d2.position.set(-600, 200, -400); scene.add(d2);
    const grid = new THREE.GridHelper(P.segLen * 4, 24, 0x24406a, 0x182c4a);
    grid.position.y = isCol ? -(P.segLen + P.gap / 2) - 40 : -P.H / 2 - 80; scene.add(grid);

    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, metalness: 0.75, roughness: 0.42 });
    const flgMat = new THREE.MeshStandardMaterial({ color: 0x39c46e, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.9 });
    const webMat = new THREE.MeshStandardMaterial({ color: 0x2bb6d6, metalness: 0.5, roughness: 0.5, transparent: true, opacity: 0.9 });
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, metalness: 0.9, roughness: 0.34 });
    const nutMat = new THREE.MeshStandardMaterial({ color: 0x232529, metalness: 0.9, roughness: 0.4 });
    const washMat = new THREE.MeshStandardMaterial({ color: 0x8b929c, metalness: 0.85, roughness: 0.4 });

    const model = new THREE.Group(); scene.add(model);
    const beamGeo = new THREE.ExtrudeGeometry(hShape(P.B, P.H, P.tw, P.tf, P.r), { depth: P.segLen, bevelEnabled: false });
    for (const sgn of [1, -1] as const) {
      const m = new THREE.Mesh(beamGeo, steel);
      m.position.z = sgn > 0 ? P.gap / 2 : -P.gap / 2 - P.segLen; model.add(m);
    }
    for (const bx of P.boxes) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(bx.sx, bx.sy, bx.sz), bx.kind === 'web' ? webMat : flgMat);
      m.position.set(bx.cx, bx.cy, bx.cz); model.add(m);
    }
    const wH = 3.2;
    const makeBolt = (b: PartBolt) => {
      const g = new THREE.Group();
      const wR = b.headR * 1.05, shankLen = b.grip + 2 * wH + b.nutH + b.protr;
      const shank = new THREE.Mesh(new THREE.CylinderGeometry(b.shankR, b.shankR, shankLen, 20), boltMat);
      shank.position.y = b.dir * (b.nutH + b.protr) / 2; g.add(shank);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(b.headR, b.headR, b.headH, 6), boltMat);
      head.position.y = -b.dir * (b.grip / 2 + wH + b.headH / 2); g.add(head);
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(b.headR, b.headR, b.nutH, 6), nutMat);
      nut.position.y = b.dir * (b.grip / 2 + wH + b.nutH / 2); g.add(nut);
      for (const s of [-1, 1] as const) {
        const wsh = new THREE.Mesh(new THREE.CylinderGeometry(wR, wR, wH, 20), washMat);
        wsh.position.y = s * (b.grip / 2 + wH / 2) * b.dir; g.add(wsh);
      }
      g.position.set(b.cx, b.cy, b.cz);
      if (b.axis === 'x') g.rotation.z = -Math.PI / 2;
      return g;
    };
    for (const b of P.bolts) model.add(makeBolt(b));
    if (isCol) model.rotation.x = -Math.PI / 2;   // 길이축 Z → 수직(Y)
    model.updateMatrixWorld(true);

    // ── 2D 삼각법 카메라(개별 화면 최대 확대) + 등각 ── (치수 추가 전 = 지오메트리 기준)
    const bbox = new THREE.Box3().setFromObject(model);
    const sz = bbox.getSize(new THREE.Vector3());
    const hX = sz.x / 2, hY = sz.y / 2, hZ = sz.z / 2, D = Math.max(sz.x, sz.y, sz.z) * 3;
    const mkOrtho = (pos: [number, number, number], up: [number, number, number]) => {
      const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 9000);
      c.position.set(...pos); c.up.set(...up); c.lookAt(0, 0, 0); return c;
    };
    const planCam = mkOrtho([0, D, 0], [1, 0, 0]);   // 평면도 90° 회전(길이=가로)
    const frontCam = mkOrtho([D, 0, 0], [0, 1, 0]);  // 정면도(입면)
    const sideCam = mkOrtho([0, 0, D], [0, 1, 0]);   // 측면도(단면)
    const isoCam = new THREE.PerspectiveCamera(35, W / Hh, 1, 9000);
    const isoDir = new THREE.Vector3(1, 0.82, 1).normalize(), sphR = sz.length() / 2;
    const orthoViews: { cam: THREE.OrthographicCamera; hh: number; vh: number }[] = [
      { cam: planCam, hh: hZ, vh: hX }, { cam: frontCam, hh: hZ, vh: hY }, { cam: sideCam, hh: hX, vh: hY },
    ];
    const fitCams = (a: number) => {                 // 각 사분면 화면에 부재가 최대로
      for (const v of orthoViews) {
        const ht = Math.max(v.vh, v.hh / a) * 1.06;
        v.cam.top = ht; v.cam.bottom = -ht; v.cam.left = -ht * a; v.cam.right = ht * a; v.cam.updateProjectionMatrix();
      }
      isoCam.aspect = a; isoCam.updateProjectionMatrix();
      isoCam.position.copy(isoDir).multiplyScalar(sphR / Math.sin(THREE.MathUtils.degToRad(35 / 2)) * 1.12);
      isoCam.lookAt(0, 0, 0);
    };
    fitCams(W / Hh);

    // ── 치수(부위별 그룹, 스프라이트) — 3D 토글 전용(2D 제외) ──
    const regG = { flange: new THREE.Group(), web: new THREE.Group() };
    model.add(regG.flange, regG.web); dimRef.current = { regG };
    regG.flange.visible = false; regG.web.visible = false;
    const dimMat = new THREE.LineBasicMaterial({ color: 0xffd54a });
    const lblH = Math.max(P.H, P.segLen) * 0.05;
    for (const d of C.dims) {
      const a = new THREE.Vector3(...d.a), b = new THREE.Vector3(...d.b), gr = regG[d.region];
      gr.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), dimMat));
      const lbl = makeLabel(d.label, lblH); lbl.position.copy(a.clone().add(b).multiplyScalar(0.5)); gr.add(lbl);
    }

    let raf = 0, spin = true, t = 0;
    controls.addEventListener('start', () => { spin = false; });
    const render = () => {
      raf = requestAnimationFrame(render);
      const w = el.clientWidth, h = el.clientHeight;
      if (modeRef.current === '3D') {
        renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
        if (spin) { t += 0.0035; camera.position.x = Math.cos(t) * dist * 0.92; camera.position.z = Math.sin(t) * dist * 0.92; camera.lookAt(0, 0, 0); }
        controls.update(); renderer.render(scene, camera);
      } else {
        renderer.setScissorTest(true);
        const hw = w / 2, hh = h / 2;
        const quads: [THREE.Camera, number, number][] = [[planCam, 0, hh], [isoCam, hw, hh], [frontCam, 0, 0], [sideCam, hw, 0]];
        for (const [cam, x, y] of quads) { renderer.setViewport(x, y, hw, hh); renderer.setScissor(x, y, hw, hh); renderer.render(scene, cam); }
        renderer.setScissorTest(false);
      }
    };
    render();

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return;
      renderer.setSize(w, h); const a2 = w / h;
      camera.aspect = a2; camera.updateProjectionMatrix();
      fitCams(a2);
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose(); beamGeo.dispose();
      dimRef.current = null; renderer.domElement.remove();
    };
  }, [r]);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    const d = dimRef.current; if (!d) return;
    const on3d = mode === '3D';                        // 치수는 3D 토글 전용(2D 제외)
    d.regG.flange.visible = on3d && regions.flange;
    d.regG.web.visible = on3d && regions.web;
  }, [regions, mode]);

  return (
    <div className="v3d-back" onClick={onClose}>
      <div className="v3d-card" onClick={e => e.stopPropagation()}>
        <div className="v3d-top">
          <b>{r.section}</b><span>· {cond.member} {cond.jointType}접합 · {cond.bolt}</span>
          <div className="v3d-mode">
            <button className={mode === '2D' ? 'on' : ''} onClick={() => setMode('2D')}>2D</button>
            <button className={mode === '3D' ? 'on' : ''} onClick={() => setMode('3D')}>3D</button>
          </div>
          {mode === '3D' && <div className="v3d-regions">
            {(['flange', 'web'] as const).map(k => (
              <button key={k} className={'v3d-chip' + (regions[k] ? ' on' : '')} onClick={() => setRegions(s => ({ ...s, [k]: !s[k] }))}>
                {k === 'flange' ? '플랜지' : '웨브'}
              </button>
            ))}
            <button className={'v3d-chip' + (showChk ? ' on' : '')} onClick={() => setShowChk(v => !v)}>체결</button>
          </div>}
          <button className="close" onClick={onClose} aria-label="닫기">✕</button>
        </div>
        <div className="v3d-canvas" ref={mount}>
          {mode === '3D' && showChk && <div className="v3d-checks" onClick={e => e.stopPropagation()}>
            <div className="v3d-checks-h">체결 검토 · AISC clearance (M{C.db})</div>
            {C.checks.map((c, i) => (
              <div key={i} className={'v3d-chk' + (c.ok ? '' : ' ng')}>
                <span className="ck-ic">{c.ok ? '✔' : '⚠'}</span>
                <span className="ck-lb">{c.label}</span>
                <span className="ck-vl">{c.value}<em>{c.limit}</em></span>
                {c.note && <span className="ck-nt">{c.note}</span>}
              </div>
            ))}
          </div>}
          {mode === '2D' && <>
            <span className="v3d-q v3d-q-tl">평면도</span>
            <span className="v3d-q v3d-q-bl">정면도(입면)</span>
            <span className="v3d-q v3d-q-br">측면도(단면)</span>
            <span className="v3d-q v3d-q-tr">3D 등각</span>
            <span className="v3d-cross v3d-cross-v" /><span className="v3d-cross v3d-cross-h" />
          </>}
        </div>
        <div className="v3d-legend">
          <span><i style={{ background: '#9aa7b4' }} />H형강(필렛R)</span>
          <span><i style={{ background: '#39c46e' }} />플랜지 첨판</span>
          <span><i style={{ background: '#2bb6d6' }} />웨브 첨판</span>
          <span><i style={{ background: '#2e3138' }} />고력볼트(머리·너트·와셔2·여장)</span>
          <span className="v3d-hint">{mode === '2D' ? '평면(90°)·정면·측면 + 3D 등각 (화면맞춤)' : '드래그=회전 · 휠=줌 · 플랜지/웨브=치수'}</span>
        </div>
      </div>
    </div>
  );
}
