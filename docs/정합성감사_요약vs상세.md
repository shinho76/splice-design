# 정합성 감사 — 요약계산서 ↔ 상세계산서

**감사일** 2026-08-10 · **감사자** Claude (steel-connection 관점 인라인 감사)
**대상** AISC/KDS: `AiscCalcReport.tsx`(요약) ↔ `AiscDetailReport.tsx`(상세) / KBC-09: `CalcReport.tsx`(요약) ↔ `KbcDetailReport.tsx`(상세)
**공통 소스** `aisc/compat.ts` → `aisc/optimize.ts` → `aisc/run.ts` → `flange.ts`·`web.ts`·`geometry.ts` / `kbcCheck.ts`

---

## 1. 요약 결론

| 축 | 결과 |
|----|------|
| AISC 검토항목 **집합** 일치 | ✅ 완전 일치 (동일 배열 참조) |
| AISC **값**(φRn·소요·DCR·판정) 일치 | ✅ 완전 일치 (동일 객체) |
| AISC 블록전단 Case 일치 | ✅ 일치 (요약 지배 = 상세 지배행) |
| AISC 헤더 **플랜지력 Pf** 표기 | ⚠ **부분강도 부재에서 불일치 1건** |
| 부분강도(캡핑) 정보 반영 | ✅ 양쪽 모두 표시(방식만 상이) |
| KBC 경로 요약↔상세 | ✅ 정합 (`kbcCheck` 공통) |

**불일치 총 1건**(경미, 부분강도 부재 한정). 그 외 항목·값은 구조적으로 완전 정합.

---

## 2. 항목별 정합성

### 2.1 검토항목 집합 — ✅ 일치
- 두 계산서 모두 `aiscAutoCorrect(result, cond)`를 호출 (`AiscCalcReport.tsx:46`, `AiscDetailReport.tsx:128`).
- 요약은 `ac.report.checks`, 상세는 `ac.checks`를 순회하는데, `compat.ts:39`에서 **`checks: o.report.checks`** — 즉 **동일 배열 참조**. 한쪽에만 있는 한계상태는 원천적으로 불가능.
- 그룹핑 로직도 동일: `for (const c of …) { if(!groups[c.group]) order.push(c.group); … }` (요약 `:54`, 상세 `:138`).
- 커버 한계상태: 플랜지 FB1·FB2·FP1~5·FI1~5·FM1~5, 웨브 WB1·WB2·WR1·WP1·WI1·WI2·WM1·WM2, 블록전단 Case A/B/C/D — 양쪽 동일.

### 2.2 값(φRn·소요·DCR·판정) — ✅ 일치
- 동일 배열의 `c.phiRn`·`c.demand`·`c.dcr`·`c.ok`를 두 계산서가 그대로 렌더 → **값 불일치 불가능**.
- 반올림: `c.phiRn`은 엔진에서 이미 `kN()`(N→kN, 0.1 반올림)로 확정된 값(`flange.ts`·`web.ts`). 상세 블록전단표(`AiscDetailReport.tsx:94`)의 `c.phiRn/1e3`도 동일 값 → 표기 자릿수만 `nf(…,1)`로 동일. 불일치 없음.
- 볼트강도 표기 변경(항목6) 정합: FB1/FB2/WB1/WB2의 `detail`(요약, ‘φrₙ×n=φRn’)과 `steps`(상세, ‘per-bolt φrₙ’→‘Total φRn=φrₙ·n’)의 **총 φRn = 동일 `c.phiRn`**. 검증 하니스 실측: `211.9 kN/EA ×8 = 1695.6 kN = φRn`.

### 2.3 블록전단 — ✅ 일치
- 요약: 지배 케이스 1개만 표기(`c.detail`=요약, `c.phiRn`=`gov.phiRn`, `c.dcr`=`gov.dcr`).
- 상세: `BlockCaseTable`로 전 케이스(A/B/C/D) 나열, `c.gov` 행 강조, 결론은 `c.phiRn/c.demand/c.dcr`(=지배) 사용.
- 요약의 단일 DCR = 상세 지배행 DCR (둘 다 `blockShearGovern`의 `gov`) → 일치.

### 2.4 입력조건 헤더 — ⚠ 1건 불일치
- 강종(H/판)·볼트·나사조건(N/X)·부재/접합: 두 계산서 모두 동일 `cond`/`r`에서 파생 → 일치.
- **플랜지력 Pf 표기 불일치**:
  - 요약 `AiscCalcReport.tsx:69` → **`r.Puf_kN`** (부재 원(原)플랜지력, **무캡핑**).
  - 상세 `AiscDetailReport.tsx:169` → **`dem.Pf`** = `r.Puf_kN·fScale` (**부분강도 캡핑 반영**, `demand.ts:41`).
  - 전강도(fScale=1) 부재는 두 값 동일. **부분강도(memberLimited) 부재에서만 헤더 "Pf"가 서로 다른 수치**로 표시됨.
  - 심각도 **경미**: 두 계산서 모두 캡핑을 별도 표기(요약 ‘소요 캡핑’ 행 `:81` `r.Puf_kN→pfCap`, 상세 `capScale` 주석 `:184`)하므로 정보 손실은 없음. 다만 동일 라벨 "Pf"가 다른 값을 가리켜 **혼동 소지**.

### 2.5 부분강도(소요캡핑) 반영 — ✅ 정보 일치
- 요약: ‘소요 캡핑’ 행 + 테이블 부분강도 배지(%) + `pfCap`/`vuCap`.
- 상세: 소요력 절 `capScale<1` 주석(‘발현력 X%로 제한’) + `pfCap`/`vuCap`.
- 캡핑 배율 소스 동일(`flangeScale`/`webScale`) → 수치 일치. 표현 방식만 상이.

### 2.6 KBC-09 경로 — ✅ 정합
- 요약 `CalcReport.tsx:21`, 상세 `KbcDetailReport.tsx:38` **모두 `kbcCheck(result, cond)`**를 DCR 소스로 사용 → 한계상태 DCR 정합.
- 요약(CalcReport)은 추가로 `result.steps`(순방향 설계 스텝)를 함께 표기하나, 이는 동일 `result` 파생이며 상세의 kbcCheck 항목과 상충하지 않음.

---

## 3. 발견 불일치 · 권고

| # | 발견 | 근거(file:line) | 심각도 | 권고 |
|---|------|-----------------|--------|------|
| A | 부분강도 부재의 헤더 **"플랜지력 Pf"**가 요약(무캡핑 `r.Puf_kN`) vs 상세(캡핑 `dem.Pf`)로 상이 | 요약 `AiscCalcReport.tsx:69` · 상세 `AiscDetailReport.tsx:169` · `demand.ts:41` | 경미 | 둘 중 하나로 통일. **권고**: 요약 헤더도 ‘Pf(부재) → Pf(발현)’ 병기하거나, 상세 헤더에 무캡핑 값도 병기. 최소 수정은 요약 헤더 라벨을 "플랜지력 Pf(부재)"로 명확화. |

그 외 **불일치 없음**. 두 계산서는 동일 `checks` 배열을 공유하므로 항목·강도·판정은 구조적으로 항상 일치한다.

---

## 4. 감사 방법
- 데이터 흐름 정적 추적: `cond`/`result` → `aiscAutoCorrect` → `o.report.checks`(=`ac.checks`=`ac.report.checks`) → 두 계산서 렌더.
- 값 정합 실측: 엔진 하니스로 FB1/FB2/WB1/WB2 `detail`·`steps`·`phiRn` 대조(‘1개강도×본수=총 φRn’ 일치 확인).
- 캡핑 경로 확인: `demand.ts:41` `Pf = r.Puf_kN·fScale` → 상세 헤더 `dem.Pf`가 캡핑 반영됨을 확정.
