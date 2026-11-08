# 작업 준비안 — `protected` 소속의 던전·전쟁유희·정식 단원 이벤트 차단 (미적용)

상태: **준비만 완료, 본 프로젝트에 적용하지 않음.** 적용은 총괄 승인 후.
패치: `work/protected_gating.patch` (v1.7.7 기준 `patch -p1` 적용 가능, dry-run 확인)

## 1. 내용
| 대상 | 변경 |
|---|---|
| `script.js` | `match()`에 `cond.familiaRole` 조건 추가, `currentFamiliaRole()`(현재 열린 소속 항목의 role, 무소속이면 `null`) |
| `events.js` | `wargame`, `supporter_route`에 `familiaRole: ['member']` |
| `test_runner.js` | 표시 시점 게이트에 `familiaRole` 검사, 카탈로그 감사 `memberOnlyGate`, protected의 `wargame`·`hasFamilia` 이벤트 노출 0을 **관찰값 → 불변식**으로 승격 |

- 던전 이벤트: 이미 `flags:['falna']` 필수이고 protected는 정의상 팔나가 없으므로(팔나 보유 이적은 member) 별도 조건 없이 차단됨. v1.7.7에서 불변식으로 검사 중.
- 파밀리아 명성: 명성 시스템이 없어 해당 없음(2d에서 credit 스키마로 처리, 설계 §8.4).

## 2. 사전 검증(스크래치 사본에서 패치 적용 후 실행)
- `node test_runner.js`(시드 20261104, 3,000생애): exit 0, 불변식 통과, `memberOnlyGate:true`, `lifeDigest` 1438657387(기준과 동일)
- `node tests/regression_digest.js`: **10/10 동일** → 현행 데이터에서는 결과 불변(protected가 해당 이벤트 조건과 원래 겹치지 않기 때문). 즉 이 변경은 **향후 규칙 변경(2b·30% 규칙 대체 등)에 대비한 방어 규칙**입니다.

## 3. 결정 필요
1. `neglect`(소마 파밀리아 방임, `cond.familia:['soma']`)를 정식 단원 전용으로 할지. 현재 protected 노출 0(시드 20261104: 40회 중 0, 777: 46회 중 0). 서술상 보호 대상도 영향을 받을 수 있어 미포함으로 두었습니다.
2. `god_gone`("새겨진 팔나가 봉인")은 `job:adventurer`만 요구하고 팔나·소속 조건이 없습니다. 실제 노출 시 팔나 미보유 0건(86회, 105회)이지만 **조건상 빈틈**입니다. `flags:['falna'], hasFamilia:true, familiaRole:['member']` 추가를 권장하며, 이 패치에는 포함하지 않았습니다(별도 승인).
3. 적용 시점(2b 이전 권장).
