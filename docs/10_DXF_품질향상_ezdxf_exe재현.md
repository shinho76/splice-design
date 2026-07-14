# DXF 품질 향상 — ezdxf 기준 점검 & JointDetailDWG.exe 동일 재현 방법

> 목적: `src/engine/dxf.ts`(브라우저에서 직접 R12 텍스트를 쓰는 생성기)의 CAD 품질을,
> ezdxf 품질 항목 기준으로 점검하고, 레거시 **JointDetailDWG.exe** 출력과 동일 수준으로 끌어올린다.
> 대상: **단위 · 스케일 · 레이어(선두께·선타입) · 폰트/텍스트 · 블록 · 해치 · 치수표기**
>
> ⚠️ **본 문서는 exe 실제 샘플(`dxf_samples/H-500x200x10x16_보이음_JDD.dxf`)을 ezdxf로 실측하여 정정된 버전이다.**
> (초판의 "exe=romans/ R2000 필요" 가정은 오류였음 — 아래 §0-B 실측표 참조)
>
> ✅ **구현 완료(2026-07-13)** — 트랙 A(exe 동일)·트랙 B(고품질 승격) 모두 반영·ezdxf 검증(audit 0 errors). §10 참조.

---

## 0-A. 전제 — ezdxf는 브라우저에서 못 돈다 (두 트랙)

| 구분 | 사실 |
|---|---|
| ezdxf | **Python 라이브러리**. 무서버 TS SPA에 직접 못 들어감(검증/렌더/오프라인 생성용) |
| 현재 생성기 | `dxf.ts`가 **손으로 R12(AC1009) 텍스트** 조립 |

- **트랙 A (브라우저·exe 동일)** — `dxf.ts`를 **R12 유지**한 채 exe 실측 규약(ARCHTICK 화살촉·TTF 폰트·DIMSTYLE 변수)에 맞춤. 사용자가 웹에서 받는 DXF가 exe와 시각 동일.
- **트랙 B (오프라인·exe 초월 고품질)** — 앱 export JSON → **ezdxf**가 **R2018 + 객체 선두께 + 해치**로 "현대 CAD 프리미엄" 생성. exe엔 없는 기능. 선택.

---

## 0-B. exe 실측 규약 (검증 완료)

`ezdxf 1.3.4`로 `H-500x200x10x16_보이음_JDD.dxf` 파싱 결과:

| 항목 | 실측값 | 의미 |
|---|---|---|
| **버전** | **AC1009 (R12)** | 370(객체선두께)·LWPOLYLINE·HATCH **전무** |
| **선두께** | **색상 펜(CTB)** | 레이어 색으로 굵기 표현(플롯 시 펜테이블) |
| **레이어** | `MAIN7·FLG_PL3·WEB_PL4·BOLT6·VER_BOLT1·DIM7` + `0`,`Defpoints` | 전부 Continuous |
| **폰트** | **`OpenSansCondensed-Light.ttf`** (+OpenSans/Liberation 패밀리 26종 로드) | **TTF**, romans/txt.shx 아님 |
| **치수 문자** | h=20(값)·18, 중앙(72=1)·중간(73=2), 치수선 위 | |
| **치수 화살촉** | **`_ARCHTICK` 블록 INSERT, scale 5.0**, 각도정렬(90/270) | 45° 건축 틱(원형 채운머리 아님) |
| **DIMSTYLE(Standard)** | dimasz41=5·dimexo42=3·dimdli43=3.75·dimexe44=1.25·dimtxt140=20·dimcen141=2.5·dimgap147=2·dimtad77=1·dimtofl172=1·dimzin78=8 | |
| **볼트** | `CIRCLE r=11`(BOLT층) + 십자 LINE | 블록 아님 |
| **첨판** | 외곽 LINE만 | 해치 없음(=현행) |
| **치수구조** | `DIMENSION` + `*Dn` 지오메트리 블록 + `Defpoints` POINT 3개/치수 | 정식 |
| **엔티티 통계** | LINE242·POINT72·INSERT48·TEXT45·CIRCLE36·BLOCK29·DIMENSION24 | INSERT48=24치수×2틱 |

> 결론: **exe = R12 + 색상펜 + TTF(OpenSansCondensed) + ARCHTICK 틱.**
> 우리 레이어/색/버전/볼트/첨판/치수구조는 **이미 일치**. 실제 격차는 **폰트·화살촉·DIMSTYLE 3가지뿐**.

---

## 1. 단위(Units)
- exe/현행 모두 `$INSUNITS=4`(mm). ✅
- 보강 권장 헤더: `$MEASUREMENT=1`, `$LUNITS=2`, `$LUPREC=0`.
- 좌표는 1:1(mm)로 그림(현행). exe도 실척 좌표(예 9000, 4000 등 실치수 표기).

## 2. 스케일(Scale)
- exe: 레이아웃 미사용, 모델 실척 + 문자/틱 **절대크기 고정**(문자 18~20, 틱 5). 현행과 동일 철학. ✅
- 조정: 현행 문자높이 `TH=20`은 exe와 일치(값 20). 세부치수는 18로 낮추면 더 근접.
- 트랙 B만 배치+뷰포트 1:20 + DIMSCALE 사용(정석 출력).

## 3. 레이어 — 선두께 · 선타입
- **선두께**: exe는 **객체 선두께(370) 미사용 → 색상 펜**. 현행 레이어 색이 exe와 **완전 일치**(MAIN7/FLG3/WEB4/BOLT6/VER1/DIM7). ✅ **추가 작업 불필요.**
  - (트랙 B에서만) R2018 객체 선두께로 "현대적 굵기 위계"를 원하면 lineweight(35~50) 부여 — exe엔 없는 기능.
- **선타입**: exe는 표준 라이브러리(CENTER/DASHED/DOT/PHANTOM/DIVIDE±X2/2) 전부 로드하나 **전 레이어 Continuous**. 현행은 CONTINUOUS 1종.
  - 조치(선택·cosmetic): 표준 LTYPE 라이브러리를 테이블에 추가하면 exe와 테이블까지 동일(그리기는 여전히 Continuous). 실익 낮음.
- **레이어 배치 차이**: exe는 치수 지오메트리를 **레이어 `0`**, 정의점을 **`Defpoints`** 에 둠. 현행은 `DIM`층. → exe 동일하게 하려면 치수 블록 내부를 `0`층, defpoint를 `Defpoints`층으로.

## 4. 폰트 · 텍스트 — **정정 포인트**
- **exe = `OpenSansCondensed-Light.ttf`(TTF, 폭 1.0)**. 현행 = `romans.shx`. **불일치.**
- exe 동일화: STYLE 테이블에 `OpenSansCondensed-Light`(font `OpenSansCondensed-Light.ttf`) 정의 후 전 TEXT `7=OpenSansCondensed-Light`.
  - 장점: exe와 시각 동일(가늘고 좁은 산세리프, 도면 깔끔). **한글 렌더 가능**(TTF) → 정보표 한글칸 깨짐 해소.
  - 유의: 뷰어에 해당 TTF 미설치 시 대체폰트로 렌더(치수 위치엔 영향 없음). OpenSansCondensed는 무료(Apache) — 배포 가능.
- 현행 폭계수 0.85 → exe는 1.0(폰트 자체가 Condensed라 별도 압축 불필요).

## 5. 블록 — 재사용성
- exe 블록: `_ARCHTICK/_CLOSEDFILLED/_CLOSEDBLANK`(화살촉) + `*Dn`(치수). **볼트는 블록 아님**(raw CIRCLE+LINE).
- 즉 exe 동일 목적엔 **볼트 블록화 불필요**(현행 raw 방식이 exe와 동일). 
- 단 **화살촉은 반드시 `_ARCHTICK` 블록**으로 INSERT(§7).
- (재사용성 향상은 트랙 B의 modern 옵션 — 볼트 BLOCK+INSERT로 파일 축소. exe와는 다름.)

## 6. 해치 — exe는 미사용
- exe: HATCH 0개. 첨판·부재 **외곽선만**. 현행과 동일. ✅ **추가 금지(exe 동일 유지).**
- (트랙 B 옵션) 실제 절단면에 ANSI31 — exe엔 없는 modern 기능.

## 7. 치수표기 — **정정 포인트(화살촉·DIMSTYLE)**
- **화살촉**: exe = **`_ARCHTICK` 45° 틱, INSERT scale 5.0**, 치수선 방향에 맞춰 회전(90/270 등). 현행 = **커스텀 원형 채운머리(roundDot)**. **불일치.**
  - exe 동일화: `_ARCHTICK` 블록 정의(45° 사선 1개, 단위길이) → `*Dn` 블록 안에서 양끝 INSERT(scale 5, rot=치수각±). roundDot 제거.
- **DIMSTYLE(Standard) 실측값 이식**:

| 코드 | 변수 | exe값 | 현행 |
|---|---|---|---|
| 41 | DIMASZ(화살크기) | **5.0** | (없음) |
| 42 | DIMEXO(보조선offset) | 3.0 | — |
| 43 | DIMDLI(기준선간격) | 3.75 | — |
| 44 | DIMEXE(보조선연장) | 1.25 | — |
| 140 | DIMTXT(문자높이) | 20 | 20 ✅ |
| 141 | DIMCEN | 2.5 | — |
| 147 | DIMGAP | 2.0 | 4.0 |
| 77 | DIMTAD(문자위치) | 1(위) | 0 |
| 172 | DIMTOFL(선강제) | 1 | — |
| 78 | DIMZIN | 8 | — |

- **문자·정렬**: h=20, 72=1(중앙)+73=2(중간), 치수선과 함께 회전. 정수 mm.
- **이중치수**(세부 체인+전체)·**Defpoints POINT**: 현행 이중치수 유지 + defpoint 추가하면 완전 동일.

---

## 8. 종합 — exe 동일화(트랙 A) 격차 & 조치

| # | 항목 | 현행 | exe 실측 | 조치 | 우선 |
|---|---|---|---|---|---|
| 1 | 버전 | R12 | **R12** | 그대로 | — ✅ |
| 2 | 레이어·색(선두께) | 일치 | 색상펜 | 그대로 | — ✅ |
| 3 | 볼트/첨판/해치 | raw·외곽·무해치 | 동일 | 그대로 | — ✅ |
| 4 | **폰트** | romans.shx | **OpenSansCondensed-Light.ttf** | STYLE 교체 | ★★★ |
| 5 | **치수 화살촉** | 원형 채운머리 | **_ARCHTICK 틱 scale5** | 블록 교체 | ★★★ |
| 6 | **DIMSTYLE 변수** | 최소 | 실측값(41/42/43/44/147/77/172/78) | 값 이식 | ★★ |
| 7 | 치수 레이어/정의점 | DIM층 | 0층 + Defpoints POINT | 배치 이관 | ★ |
| 8 | 선타입 라이브러리 | CONTINUOUS | 표준 전부(미사용) | 테이블 추가(선택) | ☆ |

> **트랙 A는 R12 유지 + 3대 정정(폰트·화살촉·DIMSTYLE)** 이면 exe와 시각 동일. R2000/해치/객체선두께는 **불필요**(오히려 exe와 달라짐).

**⚠️ 사용자 확인 필요(과거 지시와 상충):**
1. **화살촉**: 이전에 "치수선 머리를 원형으로" 요청 → 원형 채운머리 구현함. 그러나 **exe 실측은 ARCHTICK 틱**. exe 동일화하려면 원형→틱으로 되돌려야 함.
2. **폰트**: exe는 romans가 아니라 OpenSansCondensed-Light. 교체 시 뷰어에 해당 TTF 필요.

## 9. 트랙 B(선택) — ezdxf 현대 프리미엄
- `tools/dxf_gold.py`: export JSON → **R2018**, 객체 선두께(lineweight), 연관 HATCH(절단면), 볼트 BLOCK+INSERT, 완전 스타일구동 DIMSTYLE.
- exe엔 없는 "현대 CAD" 품질. exe 동일성과는 **의도적으로 다른** 산출물.
- ezdxf가 R2000 유효성(핸들·OBJECTS·BLOCK_RECORD)을 전담 → 손조립 위험 제거.

```python
import ezdxf
from ezdxf import units
doc = ezdxf.new('R2018', setup=True); doc.units = units.MM
for n,c,lw in [('MAIN',7,50),('FLG_PL',3,35),('WEB_PL',4,35),('BOLT',6,25),('DIM',7,18)]:
    (doc.layers.get(n) if n in doc.layers else doc.layers.add(n)).dxf.update({'color':c,'lineweight':lw})
ds = doc.dimstyles.get('EZDXF')
ds.dxf.dimtxt, ds.dxf.dimasz, ds.dxf.dimdec, ds.dxf.dimtad, ds.dxf.dimblk = 20,5,0,1,'ARCHTICK'
msp = doc.modelspace()
msp.add_multi_point_linear_dim(base=(0,-40), points=xs, dimstyle='EZDXF').render()
doc.saveas('gold.dxf')
```
(검증: `python r2000_probe.py` → audit 0 errors 확인 완료)

---

## 10. 구현 결과 (2026-07-13)

### 트랙 A — 웹서비스 `src/engine/dxf.ts` (R12 유지, exe 동일화)
| 변경 | 내용 |
|---|---|
| 폰트 | 전 TEXT 스타일 `romans.shx` → **`OpenSansCondensed-Light.ttf`**(exe 동일). STYLE 테이블에 `STANDARD(txt)` + `OpenSansCondensed-Light(ttf)` 2종 |
| 화살촉 | 커스텀 원형머리(roundDot) → **`_ARCHTICK` 블록 INSERT(scale 5.0)**. `archtick()` 헬퍼 신설, `emitDim` 종단부 교체, BLOCKS에 `_ARCHTICK` 정의 |
| DIMSTYLE | exe 실측값 이식: dimasz41=5·dimexo42=3·dimdli43=3.75·dimexe44=1.25·dimtxt140=20·dimcen141=2.5·dimgap147=2·dimtad77=1·dimzin78=8 |
| 정보표 | Joint 칸 한글(`보 마찰`) → **영문(`Beam Friction`/`Column Bearing`)** — OpenSansCondensed에 한글 글리프 없어 CAD 깨짐 방지 |
| 유지 | 버전 R12·레이어/색·볼트 raw·첨판 외곽·해치 없음(모두 exe와 이미 일치) |

**검증**: 보/기둥 생성 → ezdxf `audit` **0 errors**, `_ARCHTICK` 68개(34치수×2), 텍스트 78개 전부 OpenSansCondensed-Light, DIMSTYLE dimasz=5·dimtad=1. matplotlib 렌더로 틱·치수·정보표 시각 확인.

### 트랙 B — `tools/dxf_gold.py` (ezdxf 고품질 승격기)
- 웹 R12 출력을 입력 → **R2018(AC1032) 승격 + 레이어 객체 선두께(MAIN0.5/첨판0.35/볼트0.25/치수0.18) + $LWDISPLAY**.
- **드로잉 로직 재구현 없이** 기존 지오메트리 재사용(readfile→버전변경→선두께부여→saveas). 유지보수 부담 0.
- 사용: `python tools/dxf_gold.py 파일.dxf [-o 출력]` (일괄 가능). 검증: audit 0 errors, MAIN lineweight=50.
- exe엔 없는 "현대 CAD" 사양. exe 동일 산출물(웹)과 병존.

> 주의: `_ARCHTICK` 등 실측 시 발견 — DIMSTYLE 그룹 7은 텍스트스타일이 아니라 **DIMBLK2(화살촉 블록명)**. 폰트명을 넣으면 R2018 승격 시 "블록 없음" 오류 → 비워둠(치수문자 폰트는 블록 내 TEXT가 지정).

---

## 11. 다중 배치 & 단면도 (DXF)

### 다중 배치 — exe(도곽 시트) 참고 (`placeGrid`)
- exe는 **도면 1건 = 도곽 1장**(`FrameA4.dwg`). 이를 참고해 **전 단면의 최대 도곽으로 균일 셀**을 만들고 각 상세를 **셀 중앙 배치** → 열·행이 정렬된 시트세트(3열 그리드, `GAP=400`). `toDXFAll`이 `placeGrid` 사용.
- 🐞 **지시선 이중변환 버그 수정**: 앵커를 `pt(tM,…)` 절대좌표로 계산 후 `leader(pf,…)`가 오프셋을 이중 적용 → 배치에서 지시선 폭주. 앵커를 **로컬 변환(`tMl`)** 으로 계산해 해결.
- **단면도(우측 영역)**: `hSection()` 이 H형강 단면(필렛 R, ARC 4개)을 프레임 우측 확장 영역에 그림. 첨판 입면=두꺼운 폴리라인, 평면 내첨판·필렛=점선(HIDDEN), 내첨판 폭 치수.

## 12. 3D 뷰어 & IFC 내보내기 (앱)

> ~~AutoLISP(.lsp) 출력은 제거됨.~~ 3D 시각화와 IFC 표준 내보내기로 대체.

### 공유 지오메트리 `connParts.ts`
- `DesignResult` → 부재·첨판(박스)·볼트(머리+그립+너트+**여장**) 프리미티브. 좌표계 X=폭·Y=높이·Z=축. Three.js·IFC 공유.

### 3D 뷰어 `ThreeViewer.tsx` (Three.js)
- 단면치수 **옆 `3D` 버튼**·상세패널 `3D` → 모달. H형강=`ExtrudeGeometry`(필렛R Shape), 첨판 박스, 볼트=원기둥(머리·너트·**여장** = 축이 너트 아래로 `dir*(grip+nutH+protr)` 연장). OrbitControls.

### IFC 내보내기 `ifcOut.ts` (IFC4 STEP)
- H형강=**`IfcIShapeProfileDef`(필렛 R 내장)** 압출, 첨판=`IfcRectangleProfileDef` 압출, 볼트=`IfcCircleProfileDef` 압출. 공간위계 Project→Site→Building→Storey, 요소 `IfcBeam`/`IfcPlate`/`IfcMechanicalFastener`.
- **검증**(`tools/verify_ifc.mjs`, web-ifc): IFC4·Beam2·Plate8·Fastener22·ExtrudedSolid32·IShape1 파싱 + **지오메트리 tessellation 32메시** 성공.
