// IFC4 내보내기 — 최종 확정 수치(좌표·두께·직경·필렛R)를 글로벌 표준 IFC(STEP) 파일로 패킹.
// H형강 = IfcIShapeProfileDef(필렛 R 내장) 압출, 첨판 = 사각형 압출, 볼트 = 원형 압출.
// 생성 결과는 web-ifc(IfcAPI.OpenModel)로 파싱 검증됨(tools/verify_ifc.mjs).
import type { DesignResult, DesignCondition } from './types.ts';
import { connParts } from './connParts.ts';

const G = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
const guid = (n: number) => { let s = ''; for (let i = 0; i < 22; i++) s += G[(n * 13 + i * 7) % 64]; return s; };
const f = (n: number) => (Number.isInteger(n) ? n + '.' : String(n).includes('.') ? String(n) : n + '.');

export function toIFC(r: DesignResult, cond: DesignCondition): string {
  const P = connParts(r);
  const L: string[] = [];
  let id = 0;
  const add = (body: string) => { const i = ++id; L.push(`#${i}=${body};`); return i; };
  const R = (i: number) => `#${i}`;
  const pt3 = (x: number, y: number, z: number) => add(`IFCCARTESIANPOINT((${f(x)},${f(y)},${f(z)}))`);
  const dir3 = (x: number, y: number, z: number) => add(`IFCDIRECTION((${f(x)},${f(y)},${f(z)}))`);
  const dir2 = (x: number, y: number) => add(`IFCDIRECTION((${f(x)},${f(y)}))`);
  // 표준 축/원점
  const O = pt3(0, 0, 0), DZ = dir3(0, 0, 1), DX = dir3(1, 0, 0);
  const world = add(`IFCAXIS2PLACEMENT3D(${R(O)},${R(DZ)},${R(DX)})`);
  const p2origin = add(`IFCCARTESIANPOINT((0.,0.))`);
  const place2 = add(`IFCAXIS2PLACEMENT2D(${R(p2origin)},${R(dir2(1, 0))})`);

  // 단위(mm) + 표현 컨텍스트
  const lenU = add(`IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`);
  const areaU = add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`);
  const angU = add(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`);
  const units = add(`IFCUNITASSIGNMENT((${R(lenU)},${R(areaU)},${R(angU)}))`);
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,${R(world)},$)`);

  // Owner history(최소)
  const person = add(`IFCPERSON($,'SPLICE',$,$,$,$,$,$)`);
  const org = add(`IFCORGANIZATION($,'SpliceDesign',$,$,$)`);
  const po = add(`IFCPERSONANDORGANIZATION(${R(person)},${R(org)},$)`);
  const app = add(`IFCAPPLICATION(${R(org)},'1.0','SpliceDesign','SPLICE')`);
  const now = Math.floor(Date.now() / 1000);
  const owner = add(`IFCOWNERHISTORY(${R(po)},${R(app)},$,.ADDED.,${now},${R(po)},${R(app)},${now})`);

  // 공간 위계
  const proj = add(`IFCPROJECT('${guid(1)}',${R(owner)},'${P.section} ${cond.member} ${cond.jointType}',$,$,$,$,(${R(ctx)}),${R(units)})`);
  const site = add(`IFCSITE('${guid(2)}',${R(owner)},'Site',$,$,${R(add(`IFCLOCALPLACEMENT($,${R(world)})`))},$,$,.ELEMENT.,$,$,$,$,$)`);
  const bldg = add(`IFCBUILDING('${guid(3)}',${R(owner)},'Building',$,$,${R(add(`IFCLOCALPLACEMENT($,${R(world)})`))},$,$,.ELEMENT.,$,$,$)`);
  // 부재축 정렬(IFC는 Z=상방). 기둥: 길이 Z를 수직 유지(항등). 보: X축 +90° 회전 → 춤 Y=수직, 길이 Z=수평.
  const isCol = cond.member === '기둥';
  const storeyAxis = isCol ? world : add(`IFCAXIS2PLACEMENT3D(${R(O)},${R(dir3(0, -1, 0))},${R(DX)})`);
  const storeyPl = add(`IFCLOCALPLACEMENT($,${R(storeyAxis)})`);
  const storey = add(`IFCBUILDINGSTOREY('${guid(4)}',${R(owner)},'Connection',$,$,${R(storeyPl)},$,$,.ELEMENT.,0.)`);
  add(`IFCRELAGGREGATES('${guid(5)}',${R(owner)},$,$,${R(proj)},(${R(site)}))`);
  add(`IFCRELAGGREGATES('${guid(6)}',${R(owner)},$,$,${R(site)},(${R(bldg)}))`);
  add(`IFCRELAGGREGATES('${guid(7)}',${R(owner)},$,$,${R(bldg)},(${R(storey)}))`);

  const products: number[] = [];
  // 로컬배치 + 압출 형상 → 제품 헬퍼
  const shapeOf = (solid: number) => {
    const rep = add(`IFCSHAPEREPRESENTATION(${R(ctx)},'Body','SweptSolid',(${R(solid)}))`);
    return add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${R(rep)}))`);
  };
  const placeAt = (x: number, y: number, z: number, ax?: [number, number, number], rf?: [number, number, number]) => {
    const loc = pt3(x, y, z);
    const a3 = ax ? add(`IFCAXIS2PLACEMENT3D(${R(loc)},${R(dir3(...ax))},${R(dir3(...rf!))})`)
      : add(`IFCAXIS2PLACEMENT3D(${R(loc)},$,$)`);
    return add(`IFCLOCALPLACEMENT(${R(storeyPl)},${R(a3)})`);
  };
  const extrude = (profile: number, depth: number) =>
    add(`IFCEXTRUDEDAREASOLID(${R(profile)},${R(world)},${R(DZ)},${f(depth)})`);

  // ── H형강 부재 2분할 (IfcIShapeProfileDef : 필렛 R 포함) ──
  const iProf = add(`IFCISHAPEPROFILEDEF(.AREA.,'${P.section}',${R(place2)},${f(P.B)},${f(P.H)},${f(P.tw)},${f(P.tf)},${f(P.r)},$,$)`);
  for (const sgn of [1, -1] as const) {
    const startZ = sgn > 0 ? P.gap / 2 : -P.gap / 2 - P.segLen;
    const pl = placeAt(0, 0, startZ);
    const prod = add(`IFCBEAM('${guid(100 + products.length)}',${R(owner)},'H-Beam ${sgn > 0 ? 'R' : 'L'}',$,'${P.section}',${R(pl)},${R(shapeOf(extrude(iProf, P.segLen)))},$,.BEAM.)`);
    products.push(prod);
  }
  // ── 첨판(사각형 압출) ──
  for (const bx of P.boxes) {
    const prof = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${R(place2)},${f(bx.sx)},${f(bx.sy)})`);
    const pl = placeAt(bx.cx, bx.cy, bx.cz - bx.sz / 2);
    const nm = bx.kind === 'web' ? 'Web-PL' : bx.kind === 'inner' ? 'InnerFlg-PL' : 'OuterFlg-PL';
    products.push(add(`IFCPLATE('${guid(300 + products.length)}',${R(owner)},'${nm}',$,$,${R(pl)},${R(shapeOf(extrude(prof, bx.sz)))},$,.NOTDEFINED.)`));
  }
  // ── 볼트(원형 압출, 머리+그립+너트+여장 전체 길이) ──
  for (const b of P.bolts) {
    const len = b.headH + b.grip + b.nutH + b.protr;
    const prof = add(`IFCCIRCLEPROFILEDEF(.AREA.,$,${R(place2)},${f(b.shankR)})`);
    // 머리쪽 끝점 + 축방향
    const off = b.grip / 2 + b.headH;
    let x = b.cx, y = b.cy, z = b.cz, ax: [number, number, number], rf: [number, number, number];
    if (b.axis === 'y') { y = b.cy - b.dir * off; ax = [0, b.dir, 0]; rf = [1, 0, 0]; }
    else { x = b.cx - b.dir * off; ax = [b.dir, 0, 0]; rf = [0, 1, 0]; }
    const loc = pt3(x, y, z);
    const a3 = add(`IFCAXIS2PLACEMENT3D(${R(loc)},${R(dir3(...ax))},${R(dir3(...rf))})`);
    const pl = add(`IFCLOCALPLACEMENT(${R(storeyPl)},${R(a3)})`);
    const solid = add(`IFCEXTRUDEDAREASOLID(${R(prof)},${R(world)},${R(DZ)},${f(len)})`);
    const rep = add(`IFCSHAPEREPRESENTATION(${R(ctx)},'Body','SweptSolid',(${R(solid)}))`);
    const shp = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(${R(rep)}))`);
    products.push(add(`IFCMECHANICALFASTENER('${guid(500 + products.length)}',${R(owner)},'M${b.shankR * 2} H.T.B',$,$,${R(pl)},${R(shp)},$,$,$)`));
  }

  add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid(9)}',${R(owner)},$,$,(${products.map(R).join(',')}),${R(storey)})`);

  const stamp = new Date().toISOString();
  const header = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');
FILE_NAME('${P.section}_${cond.member}_${cond.jointType}.ifc','${stamp}',('SpliceDesign'),('KSSC'),'SpliceDesign','SpliceDesign','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;`;
  return `${header}\n${L.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
