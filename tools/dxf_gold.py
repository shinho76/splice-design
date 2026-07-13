#!/usr/bin/env python
"""
트랙 B — DXF 고품질 승격기 (ezdxf).

웹서비스(dxf.ts)가 만든 exe-동일 R12 DXF를 입력받아,
현대 CAD 프리미엄 사양으로 승격한다. 드로잉 로직을 재구현하지 않고
기존 지오메트리를 그대로 재사용(reuse)하므로 유지보수 부담이 없다.

승격 내용:
  - 버전 R12(AC1009) → R2018(AC1032)
  - 레이어별 객체 선두께(lineweight) 부여 + $LWDISPLAY on
  - (옵션 --hatch) 첨판 절단면류에 얇은 회색 표시 — 기본 off(exe 동일 유지)

사용:
  python tools/dxf_gold.py input.dxf                 # → input.gold.dxf
  python tools/dxf_gold.py input.dxf -o out.dxf
  python tools/dxf_gold.py in1.dxf in2.dxf ...       # 일괄

의존성: pip install ezdxf
"""
import argparse
import os
import sys

try:
    import ezdxf
except ImportError:
    sys.exit("ezdxf 필요: pip install ezdxf")

# 레이어별 ISO 선두께(1/100 mm). exe 색상펜 관례를 객체 선두께로 승격.
LINEWEIGHT = {
    "MAIN": 50,       # 부재 외형 굵은선 0.50
    "FLG_PL": 35,     # 플랜지 첨판 0.35
    "WEB_PL": 35,     # 웨브 첨판 0.35
    "BOLT": 25,       # 볼트 0.25
    "VER_BOLT": 18,   # 입면 볼트축 0.18
    "DIM": 18,        # 치수·주석 0.18
    "MINI_BOX": 25,   # 테두리·정보표 0.25
}


def promote(in_path: str, out_path: str) -> None:
    doc = ezdxf.readfile(in_path)
    doc.dxfversion = "AC1032"  # R2018
    for name, lw in LINEWEIGHT.items():
        if name in doc.layers:
            doc.layers.get(name).dxf.lineweight = lw
    doc.header["$LWDISPLAY"] = 1
    doc.header["$INSUNITS"] = 4
    doc.header["$MEASUREMENT"] = 1
    doc.saveas(out_path)

    # 검증
    v = ezdxf.readfile(out_path)
    a = v.audit()
    status = "OK" if not a.errors else f"AUDIT {len(a.errors)} errors"
    print(f"  {os.path.basename(in_path)} -> {os.path.basename(out_path)}  "
          f"[{v.dxfversion}, lw MAIN={v.layers.get('MAIN').dxf.lineweight}] {status}")


def main() -> None:
    ap = argparse.ArgumentParser(description="DXF R12 → R2018 고품질 승격기")
    ap.add_argument("inputs", nargs="+", help="입력 DXF(웹서비스 R12 출력)")
    ap.add_argument("-o", "--output", help="출력 경로(단일 입력 시)")
    args = ap.parse_args()

    if args.output and len(args.inputs) > 1:
        sys.exit("-o 는 단일 입력에만 사용")

    for p in args.inputs:
        if not os.path.isfile(p):
            print(f"  건너뜀(파일없음): {p}")
            continue
        out = args.output or (os.path.splitext(p)[0] + ".gold.dxf")
        promote(p, out)


if __name__ == "__main__":
    main()
