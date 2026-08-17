// ═══════════════════════════════════════════════════════════════════════════
// 플랜지 엇모(staggered) 배치 — 블록전단 파단선 패턴
//   볼트 지그재그 → 인장 파단면이 경사(stepped)로 엇갈림 볼트 통과.
//   게이지선 4개: ±aOut(외곽, off 0) · ±aIn(내측, off 45). n행, 피치 90.
//   외부 1a·1b·2a·2b·2c·3 · 내부 4a·4b·5a·5b · 부재 6a·6b·7·8.
//   🔴 전단(∥Pf, 게이지선) · 🔵 인장(⊥Pf, 경사 폴리라인) · 🟡 탈락블록 · Pf=왼쪽.
// ═══════════════════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = new URL('../docs/파단선/patternStag/', import.meta.url); mkdirSync(OUT, { recursive: true });

const C = { SH:'#d1495b', TE:'#2c6fbb', BF:'#f5b847', BS:'#e0a92e', HOLE:'#8b93a0',
  PL:'#5b6675', PLF:'#f1f3f7', LOAD:'#12a794', INK:'#2b3038', SUB:'#6b7280' };
const LN=(x1,y1,x2,y2,o={})=>`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${o.s??C.INK}" stroke-width="${o.w??1}"${o.d?` stroke-dasharray="${o.d}"`:''}${o.cap?` stroke-linecap="${o.cap}"`:''}/>`;
const RC=(x,y,w,h,o={})=>`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${o.f??'none'}" stroke="${o.s??'none'}" stroke-width="${o.w??1}"/>`;
const T=(x,y,s,o={})=>`<text x="${x}" y="${y}" font-size="${o.fs??11}" font-weight="${o.fw??400}" fill="${o.fill??C.INK}" text-anchor="${o.a??'start'}">${s}</text>`;
const PLl=(pts,o={})=>`<polyline points="${pts.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${o.s}" stroke-width="${o.w}"${o.d?` stroke-dasharray="${o.d}"`:''} stroke-linecap="round" stroke-linejoin="round"/>`;
function hatch(poly){
  const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const inside=(x,y)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[xi,yi]=poly[i],[xj,yj]=poly[j];if(((yi>y)!==(yj>y))&&(x<((xj-xi)*(y-yi))/(yj-yi)+xi))c=!c;}return c;};
  const it=(ax,ay,bx,by,cx,cy,dx,dy)=>{const r1=bx-ax,r2=by-ay,s1=dx-cx,s2=dy-cy,den=r1*s2-r2*s1;if(Math.abs(den)<1e-9)return null;const t=((cx-ax)*s2-(cy-ay)*s1)/den,u=((cx-ax)*r2-(cy-ay)*r1)/den;return(t>=-1e-6&&t<=1+1e-6&&u>=-1e-6&&u<=1+1e-6)?t:null;};
  let g=`<polygon points="${poly.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="${C.BF}" fill-opacity="0.22"/>`;
  for(let c=x0-y1;c<=x1-y0;c+=7){const Ax=c+y0,Ay=y0,Bx=c+y1,By=y1,ts=[];
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){const t=it(Ax,Ay,Bx,By,poly[i][0],poly[i][1],poly[j][0],poly[j][1]);if(t!=null)ts.push(t);}
    if(ts.length<2)continue;ts.sort((a,b)=>a-b);
    for(let k=0;k<ts.length-1;k++){const tm=(ts[k]+ts[k+1])/2;if(!inside(Ax+(Bx-Ax)*tm,Ay+(By-Ay)*tm))continue;
      g+=LN(Ax+(Bx-Ax)*ts[k],Ay+(By-Ay)*ts[k],Ax+(Bx-Ax)*ts[k+1],Ay+(By-Ay)*ts[k+1],{s:C.BS,w:0.8});}}
  g+=`<polygon points="${poly.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="${C.BS}" stroke-width="1.1" stroke-dasharray="3 2"/>`;
  return g;
}

// ── H-700×300 엇모 (M22): 게이지선 ±65(내,off45)·±115(외,off0), n=3, 피치90 ──
const F = { n:3, pitch:90, edge:40, B:300, innerW:110 };
const aIn=65, aOut=115, ym=F.B/2, outerEdge=aOut+35, innerEdge=outerEdge-F.innerW;
const OFF={ [aOut]:0, [-aOut]:0, [aIn]:45, [-aIn]:45 };
const lastOf=(y)=>F.edge+OFF[y]+(F.n-1)*F.pitch;                 // 그 열 최이음측 볼트 x
const XT=Math.max(aIn,aOut) && Math.max(lastOf(aOut),lastOf(aIn)); // 최이음측
const Xj=XT+F.edge;
const S=(y)=>({y, x0:0, x1:lastOf(y)});                          // 전단선(그 열 볼트까지)
const nj=(y)=>[lastOf(y), y];                                    // near-joint 볼트점
const rect=(x1,x2,y1,y2)=>[[x1,y1],[x2,y1],[x2,y2],[x1,y2]];

// 렌더 (엇모 볼트 오프셋 + 경사 인장 폴리라인)
function panel(cfg){
  const W=250,Hs=236,padL=20,padR=20,padT=46,padB=24;
  const sc=Math.min((W-padL-padR)/Xj,(Hs-padT-padB)/(2*ym)), x0=padL, cy=padT+(Hs-padT-padB)/2;
  const M=([x,y])=>[x0+x*sc, cy-y*sc], mp=p=>p.map(M);
  const p=cfg.path;
  let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hs}" font-family="'Segoe UI',system-ui,sans-serif">`;
  s+=T(padL,15,p.label,{fs:13,fw:800});
  s+=T(padL,30,`${p.desc}`,{fs:8.5,fill:C.SUB});
  for(const pl of cfg.plates){const[ax,ay]=M([0,pl[1]]),[bx,by]=M([Xj,pl[0]]);s+=RC(ax,ay,bx-ax,by-ay,{s:C.PL,w:1.2,f:C.PLF});}
  if(cfg.web){const[ax,ay]=M([0,cfg.web[1]]),[bx,by]=M([Xj,cfg.web[0]]);s+=`<rect x="${ax}" y="${ay}" width="${(bx-ax).toFixed(1)}" height="${(by-ay).toFixed(1)}" fill="#2b3038" opacity="0.62"/><text x="${((ax+bx)/2).toFixed(1)}" y="${((ay+by)/2+3).toFixed(1)}" font-size="8" font-weight="700" fill="#fff" text-anchor="middle">WEB</text>`;}
  for(const blk of p.tear) s+=hatch(mp(blk));
  // 볼트(엇모 오프셋)
  const shy=new Set(p.shear.map(v=>v.y));
  for(const y of cfg.boltYs){const off=OFF[y]; for(let i=0;i<F.n;i++){const[bx,by]=M([F.edge+off+i*F.pitch,y]);s+=`<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="4.2" fill="none" stroke="${shy.has(y)?C.INK:C.HOLE}" stroke-width="${shy.has(y)?1.5:0.9}"/>`;}}
  for(const sh of p.shear){const[a1,b1]=M([0,sh.y]),[a2]=M([sh.x1,sh.y]);s+=LN(a1,b1,a2,b1,{s:C.SH,w:2.4,cap:'round'});}
  for(const t of p.tension) s+=PLl(mp(t),{s:C.TE,w:2.4,d:'5 3'});
  const[jx,jy1]=M([Xj,ym]),[,jy2]=M([Xj,-ym]);s+=LN(jx,jy1-5,jx,jy2+5,{s:C.HOLE,w:1,d:'8 3 2 3'});s+=T(jx,jy1-8,'이음 ℄',{fs:8,fill:C.HOLE,a:'middle'});
  s+=LN(x0-4,cy,padL-2,cy,{s:C.LOAD,w:3.5,cap:'round'});s+=`<path d="M${padL-2},${cy} l10,-6 v12 z" fill="${C.LOAD}"/>`;s+=T(padL+2,cy-8,'Pf',{fs:11,fw:800,fill:C.LOAD});
  s+='</svg>';return s;
}

// near-joint 계단 인장(전 게이지선 통과)  y↑
const stepAll=[nj(-aOut),nj(-aIn),nj(aIn),nj(aOut)];
const stepAllPoly=[[0,-aOut],...stepAll,[0,aOut]];
// 상/하 밴드 계단(외곽↔내측)
const stepTop=[nj(aIn),nj(aOut)], stepBot=[nj(-aOut),nj(-aIn)];

const outer=[
  { id:'P1a', label:'Path 1a', ubs:0.5, desc:'L·경사(계단 인장, 상부 연단까지)',
    shear:[S(-aOut)],
    tension:[[nj(-aOut),nj(-aIn),nj(aIn),nj(aOut),[lastOf(aOut),ym]]],
    tear:[[[0,-aOut],nj(-aOut),nj(-aIn),nj(aIn),nj(aOut),[lastOf(aOut),ym],[0,ym]]] },
  { id:'P1b', label:'Path 1b', ubs:0.5, desc:'L·경사(전 계단, 상단 수직→연단)',
    shear:[S(-aOut)],
    tension:[[nj(-aOut),nj(-aIn),nj(aIn),[lastOf(aIn),ym]]],
    tear:[[[0,-aOut],nj(-aOut),nj(-aIn),nj(aIn),[lastOf(aIn),ym],[0,ym]]] },
  { id:'P2a', label:'Path 2a', ubs:1.0, desc:'U·경사(전 계단 인장)',
    shear:[S(-aOut),S(aOut)], tension:[stepAll], tear:[stepAllPoly] },
  { id:'P2b', label:'Path 2b', ubs:1.0, desc:'Path 4b 동일 — 내측선 전단 + 내측선→연단(2밴드)',
    shear:[S(aIn),S(-aIn)],
    tension:[[nj(aIn),[lastOf(aIn),ym]],[[lastOf(-aIn),-ym],nj(-aIn)]],
    tear:[[[0,aIn],nj(aIn),[lastOf(aIn),ym],[0,ym]],[[0,-ym],[lastOf(-aIn),-ym],nj(-aIn),[0,-aIn]]] },
  { id:'P2c', label:'Path 2c', ubs:1.0, desc:'내측선 전단 + 계단(외곽볼트 통과)→연단, 중앙부 미탈락',
    shear:[S(aIn),S(-aIn)],
    tension:[[nj(aIn),nj(aOut),[lastOf(aOut),ym]],[[lastOf(-aOut),-ym],nj(-aOut),nj(-aIn)]],
    tear:[[[0,aIn],nj(aIn),nj(aOut),[lastOf(aOut),ym],[0,ym]],[[0,-ym],[lastOf(-aOut),-ym],nj(-aOut),nj(-aIn),[0,-aIn]]] },
  { id:'P3', label:'Path 3', ubs:1.0, desc:'밴드분할·경사(내·외 4면)',
    shear:[S(aOut),S(aIn),S(-aIn),S(-aOut)],
    tension:[stepTop,stepBot],
    tear:[[[0,aIn],nj(aIn),nj(aOut),[0,aOut]],[[0,-aOut],nj(-aOut),nj(-aIn),[0,-aIn]]] },
];

const uEdge=outerEdge, iEdge=innerEdge;
const inner=[
  { id:'P4a', label:'Path 4a', ubs:0.5, desc:'Path 4b 동일 — 내측선 전단 + 판 외측연단',
    shear:[S(aIn),S(-aIn)],
    tension:[[nj(aIn),[lastOf(aIn),uEdge]],[[lastOf(-aIn),-uEdge],nj(-aIn)]],
    tear:[[[0,aIn],nj(aIn),[lastOf(aIn),uEdge],[0,uEdge]],[[0,-uEdge],[lastOf(-aIn),-uEdge],nj(-aIn),[0,-aIn]]] },
  { id:'P4b', label:'Path 4b', ubs:0.5, desc:'Path 2c 동일 — 내측선 전단 + 계단(외곽볼트 통과)→판 외측연단',
    shear:[S(aIn),S(-aIn)],
    tension:[[nj(aIn),nj(aOut),[lastOf(aOut),uEdge]],[[lastOf(-aOut),-uEdge],nj(-aOut),nj(-aIn)]],
    tear:[[[0,aIn],nj(aIn),nj(aOut),[lastOf(aOut),uEdge],[0,uEdge]],[[0,-uEdge],[lastOf(-aOut),-uEdge],nj(-aOut),nj(-aIn),[0,-aIn]]] },
  { id:'P5a', label:'Path 5a', ubs:1.0, desc:'내·외 4면 + 내측 인장',
    shear:[S(aOut),S(aIn),S(-aIn),S(-aOut)],
    tension:[stepTop,stepBot],
    tear:[[[0,aIn],nj(aIn),nj(aOut),[0,aOut]],[[0,-aOut],nj(-aOut),nj(-aIn),[0,-aIn]]] },
  { id:'P5b', label:'Path 5b', ubs:1.0, desc:'내·외 4면 + 각 판 연단·끝선 2스트립',
    shear:[S(aOut),S(aIn),S(-aIn),S(-aOut)],
    tension:[[nj(aOut),[lastOf(aOut),uEdge]],[[lastOf(aIn),iEdge],nj(aIn)],[[lastOf(-aIn),-iEdge],nj(-aIn)],[nj(-aOut),[lastOf(-aOut),-uEdge]]],
    tear:[[[0,aOut],nj(aOut),[lastOf(aOut),uEdge],[0,uEdge]],[[0,iEdge],[lastOf(aIn),iEdge],nj(aIn),[0,aIn]],
          [[0,-aIn],nj(-aIn),[lastOf(-aIn),-iEdge],[0,-iEdge]],[[0,-uEdge],[lastOf(-aOut),-uEdge],nj(-aOut),[0,-aOut]]] },
];

const girder=[
  { id:'P6a', label:'Path 6a', ubs:0.5, desc:'Path 4b 동일(웨브 양측) — 내측선 전단 + 외측연단',
    shear:[S(aIn),S(-aIn)],
    tension:[[nj(aIn),[lastOf(aIn),ym]],[[lastOf(-aIn),-ym],nj(-aIn)]],
    tear:[[[0,aIn],nj(aIn),[lastOf(aIn),ym],[0,ym]],[[0,-ym],[lastOf(-aIn),-ym],nj(-aIn),[0,-aIn]]] },
  { id:'P6b', label:'Path 6b', ubs:0.5, desc:'Path 2c 동일(웨브 양측) — 내측선 전단 + 계단→연단',
    shear:[S(aIn),S(-aIn)],
    tension:[[nj(aIn),nj(aOut),[lastOf(aOut),ym]],[[lastOf(-aOut),-ym],nj(-aOut),nj(-aIn)]],
    tear:[[[0,aIn],nj(aIn),nj(aOut),[lastOf(aOut),ym],[0,ym]],[[0,-ym],[lastOf(-aOut),-ym],nj(-aOut),nj(-aIn),[0,-aIn]]] },
  { id:'P7', label:'Path 7', ubs:1.0, desc:'Path 5a 동일(웨브 양측)',
    shear:[S(aOut),S(aIn),S(-aIn),S(-aOut)],
    tension:[stepTop,stepBot],
    tear:[[[0,aIn],nj(aIn),nj(aOut),[0,aOut]],[[0,-aOut],nj(-aOut),nj(-aIn),[0,-aIn]]] },
  { id:'P8', label:'Path 8', ubs:1.0, desc:'Path 5b 동일(웨브 양측) — 각 반 2스트립(외곽선→연단·내곽선→끝선)',
    shear:[S(aOut),S(aIn),S(-aIn),S(-aOut)],
    tension:[[nj(aOut),[lastOf(aOut),ym]],[[lastOf(aIn),iEdge],nj(aIn)],[[lastOf(-aIn),-iEdge],nj(-aIn)],[nj(-aOut),[lastOf(-aOut),-ym]]],
    tear:[[[0,aOut],nj(aOut),[lastOf(aOut),ym],[0,ym]],[[0,iEdge],[lastOf(aIn),iEdge],nj(aIn),[0,aIn]],
          [[0,-aIn],nj(-aIn),[lastOf(-aIn),-iEdge],[0,-iEdge]],[[0,-ym],[lastOf(-aOut),-ym],nj(-aOut),[0,-aOut]]] },
];

const boltAll=[-aOut,-aIn,aIn,aOut];
const oS=outer.map(p=>panel({path:p,plates:[[-ym,ym]],boltYs:boltAll}));
const iS=inner.map(p=>panel({path:p,plates:[[iEdge,uEdge],[-uEdge,-iEdge]],web:[-iEdge,iEdge],boltYs:boltAll}));
const gS=girder.map(p=>panel({path:p,plates:[[-ym,ym]],web:[-14,14],boltYs:boltAll}));
outer.forEach((p,i)=>writeFileSync(new URL(`H700-${p.id}.svg`,OUT),oS[i],'utf8'));
inner.forEach((p,i)=>writeFileSync(new URL(`H700-${p.id}.svg`,OUT),iS[i],'utf8'));
girder.forEach((p,i)=>writeFileSync(new URL(`H700-${p.id}.svg`,OUT),gS[i],'utf8'));

const sec=(title,paths,svgs)=>`<h3>${title}</h3><div class="pnls">${paths.map((p,i)=>`<figure style="margin:0"><div class="cap"><b>${p.label}</b> · U<sub>bs</sub> ${p.ubs.toFixed(1)}</div>${svgs[i]}<figcaption>${p.desc}</figcaption></figure>`).join('')}</div>`;
const html=`<title>엇모 파단선 패턴 — H-700x300</title>\n<style>
:root{color-scheme:light dark}
.wrap{--bg:#fff;--fg:#1e2530;--sub:#6b7280;--card:#f7f8fa;--bd:#e3e6ec;--acc:#c8871a}
@media(prefers-color-scheme:dark){.wrap{--bg:#12151b;--fg:#e7eaf0;--sub:#98a1ae;--card:#1b1f27;--bd:#2a2f3a}}
:root[data-theme=dark] .wrap{--bg:#12151b;--fg:#e7eaf0;--sub:#98a1ae;--card:#1b1f27;--bd:#2a2f3a}
:root[data-theme=light] .wrap{--bg:#fff;--fg:#1e2530;--sub:#6b7280;--card:#f7f8fa;--bd:#e3e6ec}
.wrap{background:var(--bg);color:var(--fg);font-family:'Segoe UI',system-ui,sans-serif;padding:22px;max-width:1180px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:18px 0 2px;padding:6px 10px;background:var(--card);border-left:3px solid var(--acc);border-radius:4px}
h3{font-size:12.5px;margin:10px 0 6px;color:var(--sub)}
.lede{color:var(--sub);font-size:12.5px;line-height:1.55;margin:0 0 10px}
.key{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--sub);background:var(--card);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;margin-bottom:8px}
.pnls{display:flex;flex-wrap:wrap;gap:12px}.pnls svg{background:#fff;border:1px solid var(--bd);border-radius:7px;width:220px;height:auto}
.cap{font-size:11.5px;margin-bottom:3px}.cap b{color:var(--acc)}figcaption{font-size:10px;color:var(--sub);max-width:220px}
</style>\n<div class="wrap"><h1>플랜지 엇모(staggered) 배치 — 블록전단 파단 Path</h1>
<p class="lede">볼트 지그재그 → 인장 파단면이 <b>경사(계단)</b>로 엇갈림 볼트 통과. 🔴 전단(∥Pf) · 🔵 인장(⊥Pf, 경사) · 🟡 탈락블록 · Pf=왼쪽. 단면 H-700×300(M22), 게이지선 ±65(내·off45)·±115(외·off0), n=3, 피치90.</p>
<div class="key"><span><b style="color:#d1495b">━</b> 전단면</span><span><b style="color:#2c6fbb">┈</b> 인장면(경사)</span><span><b style="color:#e0a92e">▨</b> 탈락블록</span></div>
<h2>외부 이음판 (Outer)</h2>${sec('Path 1a · 1b · 2a · 2b · 2c · 3',outer,oS)}
<h2>내부 이음판 (Inner · 웨브 양측 2매)</h2>${sec('Path 4a · 4b · 5a · 5b',inner,iS)}
<h2>부재 플랜지 (Girder)</h2>${sec('Path 6a · 6b · 7 · 8',girder,gS)}
</div>`;
writeFileSync(new URL('index.html',OUT),html,'utf8');
console.log('rendered stagger', oS.length+iS.length+gS.length);
