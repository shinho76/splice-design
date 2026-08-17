// ─────────────────────────────────────────────────────────────────────────
// 블록전단 파단선 — 전 Path (AISIsplice Appendix C, 빗금=탈락블록)
//  확정: ① Outer Path1 인장=외측연단  ② Inner Path4 인장=판 외측연단
//        ③ 도해만(엔진 미변경)  ④ H-700 엇모=경사(stepped) 파단선 + 첨부 sub-case
//  좌표: 플랜지 평면 x=하중축(자유단0→이음), y=폭(웨브0). 웨브 입면 별도.
//  각 Path = {name,ubs, shear:[{y,xEnd}], tension:[[ [x,y].. ]], block:[[ [x,y].. ]]}
// ─────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = new URL('../docs/파단선/paths/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const C = { SH:'#d1495b', TE:'#2c6fbb', BF:'#f5b847', BS:'#e0a92e', HOLE:'#8b93a0',
  PL:'#5b6675', PLF:'#f1f3f7', LOAD:'#12a794', INK:'#2b3038', WEB:'#7b8695', SUB:'#6b7280' };

const SAMPLES = [
  { name:'H-450x200x9x14', tag:'플랜지 1열배치', slug:'H450', dia:20, B:200, tw:9,
    fl:{ lines:[-60,60], n:4, pitch:60, edge:40, stag:false, innerW:70 },
    web:{ nVert:3, Pc:120, edge:40, wpL:290 } },
  { name:'H-700x300x13x24', tag:'플랜지 엇모배치', slug:'H700', dia:22, B:300, tw:13,
    fl:{ lines:[-115,-65,65,115], n:3, pitch:90, edge:40, stag:true, innerW:110 },
    web:{ nVert:6, Pc:90, edge:40, wpL:290 } },
  { name:'H-400x400x13x21', tag:'플랜지 2열배치', slug:'H400', dia:22, B:400, tw:13,
    fl:{ lines:[-160,-75,75,160], n:4, pitch:60, edge:40, stag:false, innerW:160 },
    web:{ nVert:3, Pc:90, edge:40, wpL:290 } },
];

// ── SVG ──────────────────────────────────────────────────────────────────────
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const T=(x,y,s,o={})=>`<text x="${x}" y="${y}" font-size="${o.fs??11}" font-weight="${o.fw??400}" fill="${o.fill??C.INK}" text-anchor="${o.a??'start'}">${esc(s)}</text>`;
const LN=(x1,y1,x2,y2,o={})=>`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${o.s??C.INK}" stroke-width="${o.w??1}"${o.d?` stroke-dasharray="${o.d}"`:''}${o.cap?` stroke-linecap="${o.cap}"`:''}/>`;
const RC=(x,y,w,h,o={})=>`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${o.f??'none'}" stroke="${o.s??'none'}" stroke-width="${o.w??1}"/>`;
const PL=(pts,o={})=>`<polyline points="${pts.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${o.s}" stroke-width="${o.w}"${o.d?` stroke-dasharray="${o.d}"`:''} stroke-linecap="round" stroke-linejoin="round"/>`;

function ptIn(x,y,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const[xi,yi]=p[i],[xj,yj]=p[j];if(((yi>y)!==(yj>y))&&(x<((xj-xi)*(y-yi))/(yj-yi)+xi))c=!c;}return c;}
function segT(ax,ay,bx,by,cx,cy,dx,dy){const r1=bx-ax,r2=by-ay,s1=dx-cx,s2=dy-cy,den=r1*s2-r2*s1;if(Math.abs(den)<1e-9)return null;const t=((cx-ax)*s2-(cy-ay)*s1)/den,u=((cx-ax)*r2-(cy-ay)*r1)/den;return(t>=-1e-6&&t<=1+1e-6&&u>=-1e-6&&u<=1+1e-6)?t:null;}
function hatch(poly){ // screen-coord polygon → 45° 해치(해석적 클리핑)
  const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  let g=`<polygon points="${poly.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="${C.BF}" fill-opacity="0.22"/>`;
  for(let c=x0-y1;c<=x1-y0;c+=7){const Ax=c+y0,Ay=y0,Bx=c+y1,By=y1,ts=[];
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){const t=segT(Ax,Ay,Bx,By,poly[i][0],poly[i][1],poly[j][0],poly[j][1]);if(t!=null)ts.push(t);}
    if(ts.length<2)continue;ts.sort((a,b)=>a-b);
    for(let k=0;k<ts.length-1;k++){const tm=(ts[k]+ts[k+1])/2;if(!ptIn(Ax+(Bx-Ax)*tm,Ay+(By-Ay)*tm,poly))continue;
      g+=LN(Ax+(Bx-Ax)*ts[k],Ay+(By-Ay)*ts[k],Ax+(Bx-Ax)*ts[k+1],Ay+(By-Ay)*ts[k+1],{s:C.BS,w:0.8});}}
  g+=`<polygon points="${poly.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${C.BS}" stroke-width="1.1" stroke-dasharray="3 2"/>`;
  return g;
}

// ── 볼트 위치 ────────────────────────────────────────────────────────────────
function bolts(sm){
  const {lines,n,pitch,edge,stag}=sm.fl, mx=Math.max(...lines.map(Math.abs)), pit=stag?90:pitch;
  return lines.map(y=>{const off=stag&&Math.abs(y)<mx-0.5?45:0;const xs=Array.from({length:n},(_,i)=>edge+off+i*pit);return{y,off,xs,last:xs[n-1]};});
}
const near=(bs,y)=>bs.find(b=>Math.abs(b.y-y)<0.5);

// ── 플랜지 패널 ──────────────────────────────────────────────────────────────
function flangePanel(sm, el, path){
  const W=250,Hs=234,padL=20,padR=20,padT=46,padB=24;
  const bs=bolts(sm), XT=Math.max(...bs.map(b=>b.last)), Xj=XT+sm.fl.edge, ym=sm.B/2;
  const sc=Math.min((W-padL-padR)/Xj,(Hs-padT-padB)/(2*ym)), x0=padL, cy=padT+(Hs-padT-padB)/2;
  const M=(x,y)=>[x0+x*sc,cy-y*sc];
  const mapPoly=poly=>poly.map(([x,y])=>M(x,y));
  let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hs}" font-family="'Segoe UI',system-ui,sans-serif">`;
  s+=T(padL,16,path.name,{fs:13,fw:800,fill:C.INK});
  s+=T(padL,31,`${path.desc} · U${path.ubs.toFixed(1)}`,{fs:9,fill:C.SUB});
  for(const p of el.plates){const[ax,ay]=M(0,p[1]),[bx,by]=M(Xj,p[0]);s+=RC(ax,ay,bx-ax,by-ay,{s:C.PL,w:1.2,f:C.PLF});}
  if(el.webBar){const[ax,ay]=M(0,el.webBar[1]),[bx,by]=M(Xj,el.webBar[0]);s+=`<rect x="${ax}" y="${ay}" width="${(bx-ax).toFixed(1)}" height="${(by-ay).toFixed(1)}" fill="#2b3038" opacity="0.62"/>`;s+=T((ax+bx)/2,(ay+by)/2+3,'WEB',{fs:8,fw:700,fill:'#fff',a:'middle'});}
  for(const blk of path.block) s+=hatch(mapPoly(blk));
  // 볼트
  for(const b of bs){const on=path.shear.some(sh=>Math.abs(sh.y-b.y)<0.5);for(const x of b.xs){const[bx,by]=M(x,b.y);s+=`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="4.4" fill="none" stroke="${on?C.INK:C.HOLE}" stroke-width="${on?1.5:0.9}"/>`;}}
  // 전단면(빨강 ∥하중)
  for(const sh of path.shear){const[x1,yy]=M(0,sh.y),[x2]=M(sh.xEnd,sh.y);s+=LN(x1,yy,x2,yy,{s:C.SH,w:2.6,cap:'round'});}
  // 인장면(파랑 점선 ⊥하중)
  for(const t of path.tension) s+=PL(mapPoly(t),{s:C.TE,w:2.6,d:'5 3'});
  // 이음 CL
  const[jx,jy1]=M(Xj,ym),[,jy2]=M(Xj,-ym);s+=LN(jx,jy1-5,jx,jy2+5,{s:C.HOLE,w:1,d:'8 3 2 3'});s+=T(jx,jy1-8,'이음 ℄',{fs:8,fill:C.HOLE,a:'middle'});
  // 하중 Pf(좌)
  s+=LN(x0-4,cy,padL-2,cy,{s:C.LOAD,w:3.5,cap:'round'});s+=`<path d="M${(padL-2).toFixed(1)},${cy} l10,-6 v12 z" fill="${C.LOAD}"/>`;s+=T(padL+2,cy-8,'Pf',{fs:11,fw:800,fill:C.LOAD});
  s+='</svg>';return s;
}

// ── 웨브 입면(한쪽 절반) ─────────────────────────────────────────────────────
function webPanel(sm){
  const W=210,Hs=252,padX=54,padT=44,padB=30, w=sm.web,nV=w.nVert,edge=w.edge,Pc=w.Pc;
  const Lv=edge+(nV-1)*Pc, dep=Lv+edge, halfL=w.wpL/2;
  const sc=Math.min((Hs-padT-padB)/dep,(W-2*padX)/halfL), u0=padT, vJ=W-padX;
  const M=(u,v)=>[vJ-v*sc,u0+u*sc];
  let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hs}" font-family="'Segoe UI',system-ui,sans-serif">`;
  s+=T(14,16,'웨브 이음판 Path 1',{fs:13,fw:800,fill:C.INK});
  s+=T(14,31,'한쪽 절반(이음면 기준)·전단1면·U1.0',{fs:9,fill:C.SUB});
  const colV=halfL*0.45,[px,py]=M(0,halfL),pw=halfL*sc,ph=dep*sc;
  s+=RC(px,py,pw,ph,{s:C.PL,w:1.2,f:C.PLF});
  const[h1,hy1]=M(0,colV),[h2,hy2]=M(Lv,0);s+=hatch([[h1,hy1],[h2,hy1],[h2,hy2],[h1,hy2]]);
  for(let i=0;i<nV;i++){const[bx,by]=M(edge+i*Pc,colV);s+=`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="4.4" fill="none" stroke="${C.INK}" stroke-width="1.5"/>`;}
  {const[x1,ya]=M(0,colV),[,yb]=M(Lv,colV);s+=LN(x1,ya,x1,yb,{s:C.SH,w:2.6,cap:'round'});}
  {const[x1,yy]=M(Lv,colV),[x2]=M(Lv,0);s+=LN(x1,yy,x2,yy,{s:C.TE,w:2.6,d:'5 3',cap:'round'});}
  s+=LN(vJ,u0-6,vJ,u0+ph+6,{s:C.HOLE,w:1,d:'8 3 2 3'});s+=T(vJ-2,u0+ph+15,'이음 ℄',{fs:8,fill:C.HOLE,a:'end'});
  const ax=px-24;s+=LN(ax,py+4,ax,py+ph-4,{s:C.LOAD,w:3.5,cap:'round'});s+=`<path d="M${ax},${(py+ph-4).toFixed(1)} l-6,-10 h12 z" fill="${C.LOAD}"/>`;s+=T(ax-14,py+ph/2,'Vu',{fs:11,fw:800,fill:C.LOAD});
  s+='</svg>';return s;
}

// ── Path 카탈로그 ────────────────────────────────────────────────────────────
// 공통: aOut/aIn = 외/내 게이지선(절대), ym=B/2, bs=볼트
function ctx(sm){const L=sm.fl.lines,a=L.map(Math.abs),aOut=Math.max(...a),pos=a.filter(v=>v>.1),aIn=Math.min(...pos);return{L,aOut,aIn,ym:sm.B/2,bs:bolts(sm),m:L.length};}
const rect=(x1,x2,y1,y2)=>[[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
const vseg=(x,y1,y2)=>[[x,y1],[x,y2]];

// 외부 이음판
function outerPaths(sm){
  const {aOut,aIn,ym,bs,m}=ctx(sm);
  const lo=near(bs,-aOut), hi=near(bs,aOut), inLo=aIn!==aOut?near(bs,-aIn):null, inHi=aIn!==aOut?near(bs,aIn):null;
  if(!sm.fl.stag){
    const r=[
      {name:'Path 1',desc:'전단1면·외측연단',ubs:0.5,shear:[{y:-aOut,xEnd:lo.last}],
        tension:[vseg(lo.last,-aOut,-ym)], block:[rect(0,lo.last,-aOut,-ym)]},
      {name:'Path 2a',desc:'전단2면·내측인장(U)',ubs:1.0,shear:[{y:-aOut,xEnd:lo.last},{y:aOut,xEnd:hi.last}],
        tension:[vseg(hi.last,-aOut,aOut)], block:[rect(0,hi.last,-aOut,aOut)]},
      {name:'Path 2b',desc:'전단2면·외측연단(U)',ubs:1.0,shear:[{y:-aOut,xEnd:lo.last},{y:aOut,xEnd:hi.last}],
        tension:[vseg(hi.last,aOut,ym),vseg(lo.last,-aOut,-ym)], block:[rect(0,hi.last,aOut,ym),rect(0,lo.last,-aOut,-ym)]},
    ];
    if(m>=4) r.push({name:'Path 3',desc:'밴드분할(U)',ubs:1.0,
      shear:[{y:-aOut,xEnd:lo.last},{y:-aIn,xEnd:inLo.last},{y:aIn,xEnd:inHi.last},{y:aOut,xEnd:hi.last}],
      tension:[vseg(hi.last,aIn,aOut),vseg(lo.last,-aOut,-aIn)], block:[rect(0,hi.last,aIn,aOut),rect(0,lo.last,-aOut,-aIn)]});
    return r;
  }
  // ── 엇모: 경사(stepped) 인장면 ── near-joint 볼트 연결
  const nb=[lo,inLo,inHi,hi].filter(Boolean).sort((a,b)=>a.y-b.y); // y↑
  const stepAll=nb.map(b=>[b.last,b.y]);                            // 전 게이지선 계단(1a)
  const stepOut=[[lo.last,lo.y],[lo.last,hi.y]];                    // 외곽선만 직진(1b)
  const bandStep=(bA,bB)=>[[bA.last,bA.y],[bB.last,bB.y]];
  return [
    {name:'Path 1a',desc:'L·경사(전 계단)',ubs:0.5,shear:[{y:lo.y,xEnd:lo.last}],
      tension:[stepAll], block:[[[0,lo.y],...stepAll,[0,hi.y]]]},
    {name:'Path 1b',desc:'L·경사(외곽직진)',ubs:0.5,shear:[{y:lo.y,xEnd:lo.last}],
      tension:[stepOut], block:[[[0,lo.y],[lo.last,lo.y],[lo.last,hi.y],[0,hi.y]]]},
    {name:'Path 2a',desc:'U·경사(내측인장)',ubs:1.0,shear:[{y:lo.y,xEnd:lo.last},{y:hi.y,xEnd:hi.last}],
      tension:[stepAll], block:[[[0,lo.y],...stepAll,[0,hi.y]]]},
    {name:'Path 2b',desc:'U·외측연단(상)',ubs:1.0,shear:[{y:hi.y,xEnd:hi.last},{y:inHi.y,xEnd:inHi.last}],
      tension:[bandStep(inHi,hi).concat([[hi.last,ym]]).reverse()], block:[[[0,inHi.y],[inHi.last,inHi.y],[hi.last,hi.y],[hi.last,ym],[0,ym]]]},
    {name:'Path 2c',desc:'U·외측연단(하)',ubs:1.0,shear:[{y:lo.y,xEnd:lo.last},{y:inLo.y,xEnd:inLo.last}],
      tension:[[[lo.last,-sm.B/2],[lo.last,lo.y],[inLo.last,inLo.y]]], block:[[[0,-ym],[lo.last,-ym],[lo.last,lo.y],[inLo.last,inLo.y],[0,inLo.y]]]},
    {name:'Path 3',desc:'밴드분할·경사(U)',ubs:1.0,
      shear:[{y:lo.y,xEnd:lo.last},{y:inLo.y,xEnd:inLo.last},{y:inHi.y,xEnd:inHi.last},{y:hi.y,xEnd:hi.last}],
      tension:[bandStep(inHi,hi),bandStep(lo,inLo)], block:[[[0,inHi.y],[inHi.last,inHi.y],[hi.last,hi.y],[0,hi.y]],[[0,lo.y],[lo.last,lo.y],[inLo.last,inLo.y],[0,inLo.y]]]},
  ];
}

// 내부 이음판 — 웨브 양측 2매, 인장=판 외측연단
function innerData(sm){const{aOut}=ctx(sm),outerEdge=aOut+35,innerEdge=outerEdge-sm.fl.innerW;return{outerEdge,innerEdge,upper:[innerEdge,outerEdge],lower:[-outerEdge,-innerEdge],webBar:[-innerEdge+2,innerEdge-2]};}
function innerPaths(sm){
  const {aOut,aIn,bs,m}=ctx(sm), d=innerData(sm), oe=d.outerEdge;
  const lo=near(bs,-aOut),hi=near(bs,aOut),inLo=aIn!==aOut?near(bs,-aIn):null,inHi=aIn!==aOut?near(bs,aIn):null;
  if(!sm.fl.stag){
    const r=[{name:'Path 4',desc:'전단2면·판외측연단',ubs:0.5,
      shear:[{y:aOut,xEnd:hi.last},{y:-aOut,xEnd:lo.last}],
      tension:[vseg(hi.last,aOut,oe),vseg(lo.last,-aOut,-oe)], block:[rect(0,hi.last,aOut,oe),rect(0,lo.last,-aOut,-oe)]}];
    if(m>=4){
      r.push({name:'Path 5a',desc:'전단4면·내측인장(U)',ubs:1.0,
        shear:[{y:aOut,xEnd:hi.last},{y:aIn,xEnd:inHi.last},{y:-aIn,xEnd:inLo.last},{y:-aOut,xEnd:lo.last}],
        tension:[vseg(hi.last,aIn,aOut),vseg(lo.last,-aOut,-aIn)], block:[rect(0,hi.last,aIn,aOut),rect(0,lo.last,-aOut,-aIn)]});
      r.push({name:'Path 5b',desc:'전단4면·판외측연단(U)',ubs:1.0,
        shear:[{y:aOut,xEnd:hi.last},{y:aIn,xEnd:inHi.last},{y:-aIn,xEnd:inLo.last},{y:-aOut,xEnd:lo.last}],
        tension:[vseg(hi.last,aOut,oe),vseg(lo.last,-aOut,-oe)], block:[rect(0,hi.last,aOut,oe),rect(0,lo.last,-aOut,-oe)]});
    }
    return r;
  }
  // 엇모 내부판: 경사
  const stepU=[[inHi.last,inHi.y],[hi.last,hi.y],[hi.last,oe]];
  const stepL=[[lo.last,-oe],[lo.last,lo.y],[inLo.last,inLo.y]];
  return [
    {name:'Path 4a',desc:'경사·판외측연단',ubs:0.5,shear:[{y:hi.y,xEnd:hi.last},{y:lo.y,xEnd:lo.last}],
      tension:[stepU,stepL], block:[[[0,inHi.y],[inHi.last,inHi.y],[hi.last,hi.y],[hi.last,oe],[0,oe]],[[0,-oe],[lo.last,-oe],[lo.last,lo.y],[inLo.last,inLo.y],[0,inLo.y]]]},
    {name:'Path 4b',desc:'경사·대안경로',ubs:0.5,shear:[{y:hi.y,xEnd:hi.last},{y:lo.y,xEnd:lo.last}],
      tension:[vseg(hi.last,hi.y,oe),vseg(lo.last,-oe,lo.y)], block:[rect(0,hi.last,hi.y,oe),rect(0,lo.last,-oe,lo.y)]},
    {name:'Path 5a',desc:'전단4면·내측인장(U)',ubs:1.0,shear:[{y:hi.y,xEnd:hi.last},{y:inHi.y,xEnd:inHi.last},{y:inLo.y,xEnd:inLo.last},{y:lo.y,xEnd:lo.last}],
      tension:[[[inHi.last,inHi.y],[hi.last,hi.y]],[[lo.last,lo.y],[inLo.last,inLo.y]]], block:[[[0,inHi.y],[inHi.last,inHi.y],[hi.last,hi.y],[0,hi.y]],[[0,lo.y],[lo.last,lo.y],[inLo.last,inLo.y],[0,inLo.y]]]},
    {name:'Path 5b',desc:'전단4면·판외측연단(U)',ubs:1.0,shear:[{y:hi.y,xEnd:hi.last},{y:inHi.y,xEnd:inHi.last},{y:inLo.y,xEnd:inLo.last},{y:lo.y,xEnd:lo.last}],
      tension:[stepU,stepL], block:[[[0,inHi.y],[inHi.last,inHi.y],[hi.last,hi.y],[hi.last,oe],[0,oe]],[[0,-oe],[lo.last,-oe],[lo.last,lo.y],[inLo.last,inLo.y],[0,inLo.y]]]},
  ];
}

// 부재 플랜지 (Girder) — Outer와 동형(U)
function girderPaths(sm){
  const {aOut,aIn,bs,m}=ctx(sm), lo=near(bs,-aOut),hi=near(bs,aOut),inLo=aIn!==aOut?near(bs,-aIn):null,inHi=aIn!==aOut?near(bs,aIn):null;
  if(!sm.fl.stag){
    const r=[{name:m>=4?'Path 6·7':'Path 6',desc:'전단2면(U)',ubs:1.0,shear:[{y:-aOut,xEnd:lo.last},{y:aOut,xEnd:hi.last}],tension:[vseg(hi.last,-aOut,aOut)],block:[rect(0,hi.last,-aOut,aOut)]}];
    if(m>=4) r.push({name:'Path 8·9',desc:'밴드분할(U)',ubs:1.0,shear:[{y:-aOut,xEnd:lo.last},{y:-aIn,xEnd:inLo.last},{y:aIn,xEnd:inHi.last},{y:aOut,xEnd:hi.last}],tension:[vseg(hi.last,aIn,aOut),vseg(lo.last,-aOut,-aIn)],block:[rect(0,hi.last,aIn,aOut),rect(0,lo.last,-aOut,-aIn)]});
    return r;
  }
  const nb=[lo,inLo,inHi,hi].sort((a,b)=>a.y-b.y).map(b=>[b.last,b.y]);
  return [
    {name:'Path 6a·7',desc:'경사(U)',ubs:1.0,shear:[{y:lo.y,xEnd:lo.last},{y:hi.y,xEnd:hi.last}],tension:[nb],block:[[[0,lo.y],...nb,[0,hi.y]]]},
    {name:'Path 8',desc:'밴드분할·경사(U)',ubs:1.0,shear:[{y:lo.y,xEnd:lo.last},{y:inLo.y,xEnd:inLo.last},{y:inHi.y,xEnd:inHi.last},{y:hi.y,xEnd:hi.last}],
      tension:[[[inHi.last,inHi.y],[hi.last,hi.y]],[[lo.last,lo.y],[inLo.last,inLo.y]]],block:[[[0,inHi.y],[inHi.last,inHi.y],[hi.last,hi.y],[0,hi.y]],[[0,lo.y],[lo.last,lo.y],[inLo.last,inLo.y],[0,inLo.y]]]},
  ];
}

// ── 생성 ─────────────────────────────────────────────────────────────────────
const groups=[];
for(const sm of SAMPLES){
  const ym=sm.B/2, d=innerData(sm);
  const outerEl={plates:[[-ym,ym]],webBar:null}, innerEl={plates:[d.upper,d.lower],webBar:d.webBar}, girderEl={plates:[[-ym,ym]],webBar:[-6,6]};
  const els=[
    {label:'외부 이음판 (Outer Flange Splice Plate)',el:outerEl,paths:outerPaths(sm)},
    {label:'내부 이음판 (Inner · 웨브 양측 2매)',el:innerEl,paths:innerPaths(sm)},
    {label:'부재 플랜지 (Girder Flange)',el:girderEl,paths:girderPaths(sm)},
  ];
  const rows=els.map(e=>({label:e.label,panels:e.paths.map(p=>flangePanel(sm,e.el,p))}));
  rows.push({label:'웨브 이음판 (Web Splice Plate) — 한쪽 절반',panels:[webPanel(sm)]});
  groups.push({sm,rows});
  for(const e of els) e.paths.forEach(p=>writeFileSync(new URL(`${sm.slug}-${e.label.slice(0,2)}-${p.name.replace(/[ ·]/g,'')}.svg`,OUT),flangePanel(sm,e.el,p),'utf8'));
  writeFileSync(new URL(`${sm.slug}-web.svg`,OUT),webPanel(sm),'utf8');
}

let html=`<title>블록전단 전 Path 재구성 — 3 샘플</title>\n<style>
:root{color-scheme:light dark}
.wrap{--bg:#fff;--fg:#1e2530;--sub:#6b7280;--card:#f7f8fa;--bd:#e3e6ec;--acc:#c8871a}
@media(prefers-color-scheme:dark){.wrap{--bg:#12151b;--fg:#e7eaf0;--sub:#98a1ae;--card:#1b1f27;--bd:#2a2f3a}}
:root[data-theme=dark] .wrap{--bg:#12151b;--fg:#e7eaf0;--sub:#98a1ae;--card:#1b1f27;--bd:#2a2f3a}
:root[data-theme=light] .wrap{--bg:#fff;--fg:#1e2530;--sub:#6b7280;--card:#f7f8fa;--bd:#e3e6ec}
.wrap{background:var(--bg);color:var(--fg);font-family:'Segoe UI',system-ui,sans-serif;padding:22px;max-width:1200px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}.lede{color:var(--sub);font-size:12.5px;line-height:1.55;margin:0 0 14px}
.key{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--sub);background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;margin-bottom:18px}
.key b{color:var(--fg)}
.samp{margin:0 0 26px;border:1px solid var(--bd);border-radius:10px;overflow:hidden}
.samp>h2{font-size:15px;margin:0;padding:9px 12px;background:var(--card);border-bottom:1px solid var(--bd)}
.samp>h2 span{color:var(--acc);font-weight:800}
.el{padding:8px 12px;border-top:1px solid var(--bd)}.el>h3{font-size:12.5px;margin:2px 0 6px;color:var(--sub)}
.pnls{display:flex;flex-wrap:wrap;gap:10px}.pnls svg{background:#fff;border:1px solid var(--bd);border-radius:7px;width:230px;height:auto}
</style>\n<div class="wrap"><h1>블록전단 전 Path 재구성</h1>
<p class="lede">AISIsplice Appendix C(<b>빗금=탈락블록</b>). ① Outer Path1·② Inner Path4 인장면=<b>외측 연단</b> · ③ 내부판=<b>웨브 양측 2매</b> · 웨브=<b>한쪽 절반</b> · ④ <b>H-700 엇모=경사(stepped) 파단선 + sub-case(1a/1b/2a/2b/2c/3 · 4a/4b/5a/5b)</b>.</p>
<div class="key"><span><b style="color:#d1495b">━</b> 전단면(∥하중)</span><span><b style="color:#2c6fbb">┈</b> 인장면(⊥하중)</span><span><b style="color:#e0a92e">▨</b> 탈락블록</span><span><b>Pf</b>·<b>Vu</b> 하중</span></div>`;
for(const g of groups){html+=`<div class="samp"><h2>${g.sm.name} — <span>${g.sm.tag}</span></h2>`;for(const r of g.rows)html+=`<div class="el"><h3>${r.label}</h3><div class="pnls">${r.panels.join('')}</div></div>`;html+=`</div>`;}
html+=`</div>`;
writeFileSync(new URL('index.html',OUT),html,'utf8');
console.log('done');
