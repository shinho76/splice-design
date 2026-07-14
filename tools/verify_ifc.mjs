// 생성된 IFC를 web-ifc로 파싱 검증(엔티티 수·스키마 확인). 사용: node tools/verify_ifc.mjs <파일.ifc>
import { IfcAPI } from 'web-ifc';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/verify_ifc.mjs <file.ifc>'); process.exit(1); }
const __dirname = path.dirname(fileURLToPath(import.meta.url));
void __dirname;

const api = new IfcAPI();   // node 빌드는 web-ifc-node.wasm 자동 탐색
await api.Init();
const data = new Uint8Array(fs.readFileSync(file));
const model = api.OpenModel(data);
const schema = api.GetModelSchema(model);
const lines = api.GetAllLines(model);
const count = (name, code) => { try { return api.GetLineIDsWithType(model, code).size(); } catch { return '?'; } };
console.log('schema      :', schema);
console.log('total lines :', lines.size());
// 주요 요소 카운트(IFC4 type codes)
const T = { IFCBEAM:0, IFCPLATE:0, IFCMECHANICALFASTENER:0, IFCEXTRUDEDAREASOLID:0, IFCISHAPEPROFILEDEF:0 };
import * as WebIFC from 'web-ifc';
for (const k of Object.keys(T)) T[k] = count(k, WebIFC[k]);
console.log('elements    :', T);
// 지오메트리 tessellation 확인
let meshes = 0, verts = 0;
api.StreamAllMeshes(model, (mesh) => {
  meshes++;
  const g = mesh.geometries;
  for (let i = 0; i < g.size(); i++) {
    const geo = api.GetGeometry(model, g.get(i).geometryExpressID);
    verts += api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize()).length / 6;
  }
});
console.log('geometry    :', meshes, 'meshes,', Math.round(verts), 'vertices');
api.CloseModel(model);
console.log(schema && lines.size() > 0 && meshes > 0 ? 'IFC VALID ✓ (parse + geometry)' : 'IFC INVALID ✗');
