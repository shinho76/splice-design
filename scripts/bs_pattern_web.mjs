// ═══════════════════════════════════════════════════════════════════════════
// 웨브 이음판(Web Splice Plate) 블록전단 파단선 — 1열 / 2열 배치
//   입면. 하중 Vu = 수직(전단). 이음면 기준 한쪽 절반만 검토(웨브 H=0 정책).
//   전단면 = 수직(∥Vu, 볼트열 따라) · 인장면 = 수평(⊥Vu, 최하단행) · 빗금 = 탈락블록.
//   1열 = 볼트 1열(수직) · 2열 = 볼트 2열.
// ═══════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = new URL('../docs/파단선/patternWeb/', import.meta.url); mkdirSync(OUT, { recursive: true });

const C = { SH:'#d1495b', TE:'#2c6fbb', BF:'#f5b847', BS:'#e0a92e', HOLE:'#8b93a0',
  PL:'#5b6675', PLF:'#f1f3f7', LOAD:'#12a794', INK:'#2b3038', SUB:'#6b7280' };
const LN=(x1,y1,x2,y2,o={})=>`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${o.s??C.INK}" stroke-width="${o.w??1}"${o.d?` stroke-dasharray="${o.d}"`:''}${o.cap?` stroke-linecap="${o.cap}"`:''}/>`;
const RC=(x,y,w,h,o={})=>`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${o.f??'none'}" stroke="${o.s??'none'}" stroke-width="${o.w??1}"/>`;
const T=(x,y,s,o={})=>`<text x="${x}" y="${y}" font-size="${o.fs??11}" font-weight="${o.fw??400}" fill="${o.fill??C.INK}" text-anchor="${o.a??'start'}">${s}</text>`;
// 45° 해치(해석적 클리핑)
function hatch(poly){
  const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const inside=(x,y)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[xi,yi]=poly[i],[xj,yj]=poly[j];if(((yi>y)!==(yj>y))&&(x<((xj-xi)*(y-yi))/(yj-yi)+xi))c=!c;}return c;};
  const inter=(ax,ay,bx,by,cx,cy,dx,dy)=>{const r1=bx-ax,r2=by-ay,s1=dx-cx,s2=dy-cy,den=r1*s2-r2*s1;if(Math.abs(den)<1e-9)return null;const t=((cx-ax)*s2-(cy-ay)*s1)/den,u=((cx-ax)*r2-(cy-ay)*r1)/den;return(t>=-1e-6&&t<=1+1e-6&&u>=-1e-6&&u<=1+1e-6)?t:null;};
  let g=`<polygon points="${poly.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="${C.BF}" fill-opacity="0.22"/>`;
  for(let c=x0-y1;c<=x1-y0;c+=7){const Ax=c+y0,Ay=y0,Bx=c+y1,By=y1,ts=[];
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){const t=inter(Ax,Ay,Bx,By,poly[i][0],poly[i][1],poly[j][0],poly[j][1]);if(t!=null)ts.push(t);}
    if(ts.length<2)continue;ts.sort((a,b)=>a-b);
    for(let k=0;k<ts.length-1;k++){const tm=(ts[k]+ts[k+1])/2;if(!inside(Ax+(Bx-Ax)*tm,Ay+(By-Ay)*tm))continue;
      g+=LN(Ax+(Bx-Ax)*ts[k],Ay+(By-Ay)*ts[k],Ax+(Bx-Ax)*ts[k+1],Ay+(By-Ay)*ts[k+1],{s:C.BS,w:0.8});}}
  g+=`<polygon points="${poly.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${C.BS}" stroke-width="1.1" stroke-dasharray="3 2"/>`;
  return g;
}

// cfg: {cols:[축방향 거리(이음면 기준)…], nVert, Pc, edge, dp, wpL, title, sub}
function webPanel(cfg){
  const W=250,Hs=250,padX=56,padT=44,padB=28;
  const {cols,nVert,Pc,edge}=cfg, Lv=edge+(nVert-1)*Pc, dep=Lv+edge;
  const outCol=Math.max(...cols), half=cfg.wpL/2;
  const sc=Math.min((Hs-padT-padB)/dep,(W-2*padX)/half), u0=padT, vJ=W-padX;
  const M=(u,v)=>[vJ - v*sc, u0 + u*sc];               // v=축(이음0→좌), u=춤(Vu 아래)
  let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hs}" font-family="'Segoe UI',system-ui,sans-serif">`;
  s+=T(14,16,cfg.title,{fs:13,fw:800,fill:C.INK});
  s+=T(14,30,cfg.sub,{fs:9,fill:C.SUB});
  // 판(이음면 우측 절반)
  const[px,py]=M(0,half),pw=half*sc,ph=dep*sc;
  s+=RC(px,py,pw,ph,{s:C.PL,w:1.2,f:C.PLF});
  // 탈락블록: 외곽열(outCol)~이음면(0), 상단 자유단(0)~하단 인장(Lv)
  const b=[M(0,outCol),M(Lv,outCol),M(Lv,0),M(0,0)];
  s+=hatch(b);
  // 볼트(각 열 × nVert)
  for(const cv of cols) for(let i=0;i<nVert;i++){const[bx,by]=M(edge+i*Pc,cv);s+=`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="4.4" fill="none" stroke="${C.INK}" stroke-width="1.5"/>`;}
  // 전단면(빨강, 수직 ∥Vu) — 지정 볼트열만(기본 전열)
  for(const cv of (cfg.shearCols ?? cols)){const[x1,ya]=M(0,cv),[,yb]=M(Lv,cv);s+=LN(x1,ya,x1,yb,{s:C.SH,w:2.6,cap:'round'});}
  // 인장면(파랑, 수평 ⊥Vu) — 최하단행, 외곽열→이음면
  {const[x1,yy]=M(Lv,outCol),[x2]=M(Lv,0);s+=LN(x1,yy,x2,yy,{s:C.TE,w:2.6,cap:'round'});}
  // 이음 CL(우측 수직)
  s+=LN(vJ,u0-6,vJ,u0+ph+6,{s:C.HOLE,w:1,d:'8 3 2 3'});s+=T(vJ-2,u0+ph+15,'이음 ℄',{fs:8,fill:C.HOLE,a:'end'});
  // 하중 Vu(하향)
  const ax=px-24;s+=LN(ax,py+4,ax,py+ph-4,{s:C.LOAD,w:3.5,cap:'round'});s+=`<path d="M${ax},${(py+ph-4).toFixed(1)} l-6,-10 h12 z" fill="${C.LOAD}"/>`;s+=T(ax-14,py+ph/2,'Vu',{fs:11,fw:800,fill:C.LOAD});
  s+='</svg>';return s;
}

// 1열 / 2열 (nVert=4 depth, Pc=60, edge=40, 축피치 60)
const P1 = { cols:[45], nVert:4, Pc:60, edge:40, wpL:220, title:'Web Path 1 — 1열 배치', sub:'볼트 1열 · 전단1면(수직)+하단인장 · U_bs 0.5' };
const P2 = { cols:[45,105], shearCols:[105], nVert:4, Pc:60, edge:40, wpL:290, title:'Web Path 1 — 2열 배치', sub:'볼트 2열 · 외곽열 전단1면(내부 전단면 제외)+하단인장' };
const s1=webPanel(P1), s2=webPanel(P2);
writeFileSync(new URL('web-1row.svg',OUT), s1,'utf8');
writeFileSync(new URL('web-2row.svg',OUT), s2,'utf8');

const html=`<title>웨브 이음판 파단선 — 1열 / 2열</title>\n<style>
:root{color-scheme:light dark}
.wrap{--bg:#fff;--fg:#1e2530;--sub:#6b7280;--card:#f7f8fa;--bd:#e3e6ec;--acc:#c8871a}
@media(prefers-color-scheme:dark){.wrap{--bg:#12151b;--fg:#e7eaf0;--sub:#98a1ae;--card:#1b1f27;--bd:#2a2f3a}}
:root[data-theme=dark] .wrap{--bg:#12151b;--fg:#e7eaf0;--sub:#98a1ae;--card:#1b1f27;--bd:#2a2f3a}
:root[data-theme=light] .wrap{--bg:#fff;--fg:#1e2530;--sub:#6b7280;--card:#f7f8fa;--bd:#e3e6ec}
.wrap{background:var(--bg);color:var(--fg);font-family:'Segoe UI',system-ui,sans-serif;padding:22px;max-width:760px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}.lede{color:var(--sub);font-size:12.5px;line-height:1.55;margin:0 0 12px}
.key{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--sub);background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;margin-bottom:14px}
.pnls{display:flex;flex-wrap:wrap;gap:14px}.pnls svg{background:#fff;border:1px solid var(--bd);border-radius:7px;width:250px;height:auto}
.note{font-size:12px;color:var(--sub);background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:11px 13px;line-height:1.6;margin-top:12px}
</style>\n<div class="wrap"><h1>웨브 이음판(Web Splice Plate) 블록전단 — 1열 / 2열</h1>
<p class="lede">입면. 하중 <b>Vu = 수직 전단</b>. 웨브 수평력 H=0(단순전단 이음)이므로 <b>수직 V블록</b>만, <b>이음면 기준 한쪽 절반</b>만 검토. 🔴 전단(∥Vu, 볼트열 수직) · 🔵 인장(⊥Vu, 최하단행) · 🟡 탈락블록.</p>
<div class="key"><span><b style="color:#d1495b">━</b> 전단면</span><span><b style="color:#2c6fbb">━</b> 인장면</span><span><b style="color:#e0a92e">▨</b> 탈락블록</span><span><b>Vu</b> 전단</span></div>
<div class="pnls">${s1}${s2}</div>
<div class="note"><b>Path 1 (Web Splice Plate)</b> · 볼트열(수직)을 따라 전단, 최하단행에서 수평 인장. <b>1열</b>=전단 1면(U<sub>bs</sub> 0.5, L형) · <b>2열</b>=전단 2면(U<sub>bs</sub> 1.0, U형). φRn=φ[min(0.6F<sub>u</sub>A<sub>nv</sub>, 0.6F<sub>y</sub>A<sub>gv</sub>)+U<sub>bs</sub>F<sub>u</sub>A<sub>nt</sub>]×2매(양면 이음판).<br>Web Path 2·3(H블록)·Girder Web Path 4·5는 H=0으로 <b>검토 제외</b>.</div>
</div>`;
writeFileSync(new URL('index.html',OUT), html,'utf8');
console.log('rendered web 1열/2열');
