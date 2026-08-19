// Tekla Structures 연동 데이터 출력 — C# Open API 매크로(.cs) 생성기.
//   전 부재의 스플라이스(이음판·볼트군) 형상을 임베드하고, Tekla.Structures.Model
//   API로 ContourPlate(이음판) + BoltArray(볼트군)를 모델에 생성하는 매크로를 만든다.
//   Tekla: Applications & components ▸ Macros 폴더에 저장 후 실행(모델 열린 상태).
import type { DesignCondition, DesignResult } from './types.ts';
import { sectionByName } from './sections.ts';

const n2 = (v: number | undefined) => (v == null || !isFinite(v) ? 0 : +v.toFixed(2));
const cs = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// Tekla 프로파일 표기: H-400x200x8x13 → "H400*200*8*13", W형강은 원 표기(label) 우선.
function teklaProfile(r: DesignResult): string {
  const s = sectionByName(r.section);
  if (s?.label) return s.label;                       // 예: W16X40
  const m = r.section.match(/H-?(\d+)x(\d+)x([\d.]+)x([\d.]+)/i);
  if (m) return `H${m[1]}*${m[2]}*${m[3]}*${m[4]}`;
  return r.section;
}

// KS/ASTM 강종 → Tekla 재질명(모델 프로파일 카탈로그에 맞게 조정 가능).
const MAT: Record<string, string> = {
  SS275: 'SS275', SM275: 'SM275', SM355: 'SM355', SN355: 'SN355', SS400: 'SS400',
  SM490: 'SM490', SM520: 'SM520', SM570: 'SM570', SN490: 'SN490', SHN490: 'SHN490',
  A36: 'A36', A572: 'A572-50', A992: 'A992', A588: 'A588',
};

interface TeklaRow {
  name: string; profile: string; plateMat: string; boltStd: string; boltDia: number;
  H: number; B: number; tw: number; tf: number;
  ofT: number; ofW: number; ofL: number;   // 외부 이음판
  inT: number; inW: number; inL: number;    // 내부 이음판(없으면 0)
  webT: number; webW: number; webL: number; // 웨브 이음판
  fM: number; fN: number; fG1: number; fPitch: number;   // 플랜지 볼트군
  wM: number; wN: number; wPx: number; wPy: number;       // 웨브 볼트군
  gap: number;
}

function toRow(r: DesignResult, cond: DesignCondition): TeklaRow {
  const s = sectionByName(r.section);
  const plateMat = MAT[cond.plateSteel || cond.steel] || (cond.plateSteel || cond.steel);
  const of = r.flange.outerPlate, ip = r.flange.innerPlate, wp = r.web.webPlate;
  return {
    name: r.section, profile: teklaProfile(r), plateMat, boltStd: cond.bolt, boltDia: r.boltDia,
    H: s?.H ?? 0, B: s?.B ?? 0, tw: s?.tw ?? 0, tf: s?.tf ?? 0,
    ofT: of?.t ?? 0, ofW: of?.w ?? 0, ofL: of?.L ?? 0,
    inT: ip?.t ?? 0, inW: ip?.w ?? 0, inL: ip?.L ?? 0,
    webT: wp?.t ?? 0, webW: wp?.w ?? 0, webL: wp?.L ?? 0,
    fM: r.flange.bolt.m, fN: r.flange.bolt.n, fG1: r.flange.gauge?.g1 ?? 0, fPitch: r.flange.pitch ?? 60,
    wM: r.web.bolt.m, wN: r.web.bolt.n, wPx: r.web.pitch ?? 60, wPy: r.web.Pc ?? 60,
    gap: r.flange.gap ?? r.web.gap ?? cond.gap ?? 10,
  };
}

function dataLiteral(rows: TeklaRow[]): string {
  return rows.map(m => '      new M{'
    + `Name="${cs(m.name)}",Profile="${cs(m.profile)}",PlateMat="${cs(m.plateMat)}",BoltStd="${cs(m.boltStd)}",BoltDia=${m.boltDia},`
    + `H=${n2(m.H)},B=${n2(m.B)},Tw=${n2(m.tw)},Tf=${n2(m.tf)},`
    + `OfT=${n2(m.ofT)},OfW=${n2(m.ofW)},OfL=${n2(m.ofL)},InT=${n2(m.inT)},InW=${n2(m.inW)},InL=${n2(m.inL)},`
    + `WebT=${n2(m.webT)},WebW=${n2(m.webW)},WebL=${n2(m.webL)},`
    + `Fm=${m.fM},Fn=${m.fN},Fg1=${n2(m.fG1)},Fpitch=${n2(m.fPitch)},Wm=${m.wM},Wn=${m.wN},Wpx=${n2(m.wPx)},Wpy=${n2(m.wPy)},Gap=${n2(m.gap)}}`)
    .join(',\n');
}

/** 전 부재 → Tekla Open API 매크로(.cs) 소스 텍스트. */
export function toTeklaMacro(results: DesignResult[], cond: DesignCondition): string {
  const rows = results.map(r => toRow(r, cond));
  const header = `// ─────────────────────────────────────────────────────────────────────────────
//  고력볼트 표준접합 스플라이스 — Tekla Structures Open API 임포트 매크로
//  자동 생성: 부재 ${rows.length}종 · ${cond.member} · ${cond.jointType} · ${cond.designStd || 'AISC'}
//              모재 ${cond.steel} / 이음판 ${cond.plateSteel || cond.steel} / 볼트 ${cond.bolt}
//
//  사용법
//   1) Tekla Structures 모델을 연다.
//   2) 이 파일을 ..\\Applications\\Macros(또는 사무소 매크로 폴더)에 넣는다.
//   3) Applications & components ▸ Macros ▸ SpliceImport 실행.
//   각 부재의 이음판(ContourPlate)과 볼트군(BoltArray)이 X방향으로 2.5m 간격 배치된다.
//   ※ 참조: Tekla.Structures.Model / .Geometry3d. 재질·볼트 표준명은 모델 카탈로그에 맞게 조정.
// ─────────────────────────────────────────────────────────────────────────────
using System;
using System.Collections.Generic;
using Tekla.Structures.Model;
using Tekla.Structures.Geometry3d;

public class SpliceImport
{
    // 부재 1행 = 스플라이스 형상(단위 mm)
    struct M {
        public string Name, Profile, PlateMat, BoltStd; public double BoltDia;
        public double H, B, Tw, Tf;
        public double OfT, OfW, OfL, InT, InW, InL, WebT, WebW, WebL;
        public int Fm, Fn, Wm, Wn; public double Fg1, Fpitch, Wpx, Wpy, Gap;
    }

    static readonly M[] Data = new M[] {
${dataLiteral(rows)}
    };

    // 매크로 진입점(Tekla 매크로는 Main 실행)
    public static void Main()
    {
        Model model = new Model();
        if (!model.GetConnectionStatus()) { Console.WriteLine("Tekla 모델에 연결할 수 없습니다."); return; }

        double x = 0.0;
        int made = 0;
        foreach (M m in Data) { made += BuildMember(model, m, x); x += 2500.0; }

        model.CommitChanges();
        Console.WriteLine("스플라이스 임포트 완료 — 부재 " + Data.Length + "종, 객체 " + made + "개 생성.");
    }

    // 한 부재의 이음판 + 볼트군 생성. 반환 = 생성 객체 수.
    static int BuildMember(Model model, M m, double x0)
    {
        int cnt = 0;
        double halfL = m.OfL / 2.0;         // 이음판 절반 길이(X)
        double zTop = m.H / 2.0;            // 상부 플랜지 외면 z
        double zBot = -m.H / 2.0;

        // ── 플랜지 외부 이음판(상·하) : XY평면, 두께 z ──
        cnt += Plate(model, m.PlateMat, "SPL-OF",
            P(x0 - halfL, -m.OfW / 2, zTop), P(x0 + halfL, -m.OfW / 2, zTop),
            P(x0 + halfL, m.OfW / 2, zTop), P(x0 - halfL, m.OfW / 2, zTop), m.OfT);
        cnt += Plate(model, m.PlateMat, "SPL-OF",
            P(x0 - halfL, -m.OfW / 2, zBot), P(x0 + halfL, -m.OfW / 2, zBot),
            P(x0 + halfL, m.OfW / 2, zBot), P(x0 - halfL, m.OfW / 2, zBot), -m.InT > 0 ? m.OfT : m.OfT);

        // ── 플랜지 내부 이음판(있을 때, 상·하 웨브측) ──
        if (m.InT > 0 && m.InW > 0) {
            double yi = (m.InW / 2) + (m.Tw / 2);        // 웨브 양측 내부판 중심 y (양쪽 각 1매)
            foreach (double sgn in new double[] { -1, 1 })
            foreach (double z in new double[] { zTop, zBot })
                cnt += Plate(model, m.PlateMat, "SPL-IF",
                    P(x0 - m.InL / 2, sgn * yi - m.InW / 2, z), P(x0 + m.InL / 2, sgn * yi - m.InW / 2, z),
                    P(x0 + m.InL / 2, sgn * yi + m.InW / 2, z), P(x0 - m.InL / 2, sgn * yi + m.InW / 2, z), m.InT);
        }

        // ── 웨브 이음판 : XZ평면, 두께 y ──
        cnt += Plate(model, m.PlateMat, "SPL-WEB",
            P(x0 - m.WebL / 2, m.Tw / 2, -m.WebW / 2), P(x0 + m.WebL / 2, m.Tw / 2, -m.WebW / 2),
            P(x0 + m.WebL / 2, m.Tw / 2, m.WebW / 2), P(x0 - m.WebL / 2, m.Tw / 2, m.WebW / 2), m.WebT);

        // ── 볼트군 : 플랜지(상·하) + 웨브 ──
        double fEdge = (m.OfL / 2) - m.Gap / 2 - m.Fpitch * (m.Fn - 1) / 2;   // 이음 한쪽 첫 볼트열 X
        cnt += Bolts(model, m, GridX(x0 + fEdge, m.Fn, m.Fpitch), GridY(0, m.Fm, m.Fg1), zTop, "flange");
        cnt += Bolts(model, m, GridX(x0 + fEdge, m.Fn, m.Fpitch), GridY(0, m.Fm, m.Fg1), zBot, "flange");
        double wEdge = (m.WebL / 2) - m.Gap / 2 - m.Wpx * (m.Wm - 1) / 2;
        cnt += Bolts(model, m, GridX(x0 + wEdge, m.Wm, m.Wpx), GridZ(0, m.Wn, m.Wpy), m.Tw / 2, "web");
        return cnt;
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────
    static Point P(double x, double y, double z) { return new Point(x, y, z); }
    static List<double> GridX(double c, int n, double s) { return Grid(c, n, s); }
    static List<double> GridY(double c, int n, double s) { return Grid(c, n, s); }
    static List<double> GridZ(double c, int n, double s) { return Grid(c, n, s); }
    static List<double> Grid(double center, int n, double step) {
        var l = new List<double>(); double start = center - step * (n - 1) / 2.0;
        for (int i = 0; i < n; i++) l.Add(start + i * step); return l;
    }

    // ContourPlate 생성(4점 폐합 + 두께). thick 방향은 판 평면 법선.
    static int Plate(Model model, string mat, string name, Point p1, Point p2, Point p3, Point p4, double thick) {
        var cp = new ContourPlate();
        cp.AddContourPoint(new ContourPoint(p1, null));
        cp.AddContourPoint(new ContourPoint(p2, null));
        cp.AddContourPoint(new ContourPoint(p3, null));
        cp.AddContourPoint(new ContourPoint(p4, null));
        cp.Name = name; cp.Profile.ProfileString = "PL" + thick; cp.Material.MaterialString = mat;
        cp.Class = "9"; cp.Position.Depth = Position.DepthEnum.MIDDLE;
        return cp.Insert() ? 1 : 0;
    }

    // BoltArray 생성 — X/Y(또는 X/Z) 격자 위치에 볼트. 부재·이음판은 실무에서 선택 지정.
    static int Bolts(Model model, M m, List<double> ax, List<double> perp, double level, string kind) {
        var ba = new BoltArray();
        double x0 = ax[0], p0 = perp[0];
        ba.FirstPosition = (kind == "web") ? new Point(x0, level, p0) : new Point(x0, p0, level);
        ba.SecondPosition = (kind == "web") ? new Point(x0 + 1, level, p0) : new Point(x0 + 1, p0, level);
        for (int i = 1; i < ax.Count; i++) ba.AddBoltDistX(ax[i] - ax[i - 1]);
        for (int j = 1; j < perp.Count; j++) ba.AddBoltDistY(perp[j] - perp[j - 1]);
        ba.BoltSize = m.BoltDia; ba.Tolerance = 2.0;
        ba.BoltStandard = m.BoltStd; ba.Bolt = true; ba.Washer1 = ba.Washer2 = ba.Nut1 = true;
        ba.Position.Depth = Position.DepthEnum.MIDDLE;
        // NOTE: 실제 체결은 PartToBoltTo / PartToBeBolted 를 대상 부재·이음판으로 지정해야 한다.
        return ba.Insert() ? 1 : 0;
    }
}
`;
  return header;
}
