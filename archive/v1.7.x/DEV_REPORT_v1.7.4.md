> **[보관 문서]** 당시 제출본의 기록입니다(파일 위치만 `archive/v1.7.x/`로 이동, 내용 불변). 현행 상태는 루트의 `DEV_REPORT_v1.7.7.md`와 `DOCS_INDEX.md`를 보세요. 문서 안의 로그 경로(`logs/…`)는 당시 기준이며 일부는 `archive/v1.7.x/logs/`로 옮겨졌습니다.

# 던만추 인생 시뮬레이터 v1.7.4 — 소규모 보완 + 2단계 설계 (주 개발자 제출)

기준: v1.7.3 QA(조건부 승인: 개발 기준점 O / 정식 릴리스 반려)의 다음 작업 지시 2·3.

## 1. 처리 내용

| 지시 | 처리 | 검증 |
|---|---|---|
| `EVENT_AREA.wargame` 오래된 주석 | 현재 조건(`hasFamilia:true`)을 반영하도록 정정. **동작 불변** | `node test_runner.js` 3,000판 출력이 저장 로그와 동일 |
| 다중 시드 동시 실행 제한 | 작업 큐 + 동시 실행 수 제한(`MAX_PARALLEL`, 기본 min(CPU 수, 4)). 잘못된 모드 거부 유지 | 4시드×2모드×200판 `MAX_PARALLEL=2` PASS, `typo` 모드 exit 1 |
| 2단계 설계: 무명 파밀리아 입단 경로 · 개인/파밀리아 명성 분리 | `DESIGN_PROPOSAL_status_separation.md` §7 — 데이터 모델, 입단 상태 전이, 신청 현재/이력 분리, 명성 분리, 구현 2a~2d, 테스트 계획, 총괄 결정 4건. **확률·문턱값 없음** | 설계만(코드 미구현) |

## 2. 설계안 §7 요점
- `kind: canon|minor`, `official`, `god.trait`, `needs`, `recruitment.routes`, `fame`(4단계 서사). `minor` 파밀리아는 시드 재현 가능한 절차 생성, 비공식 창작임을 UI에 표시.
- `S.application`: 진행 중 신청(0~1개)과 과거 이력을 분리. 경로 7종(open_call/self_apply/referral/scout/exam/persistence/god_whim), 결과 5종. 거절은 사망·이탈이 아님. 입단 확정 시 팔나 동시 부여(승인된 결정 2).
- 판정은 `evaluateApplication(S, familia, route)`의 입력(신의 성향·인력 수요·지원자 속성·이력·추천인·명성)만 사용. 모든 수치는 `RECRUIT_TUNING`(미정)으로 분리.
- `S.fame`(개인)과 `S.familiaFame`(소속 파밀리아)을 분리: 파밀리아 명성은 소속이 알려진 상태의 업적만 반영.
- QA가 지적한 원작 구분(레피야·오탈·미아·프레이야 세례·류/아폴론·개종과 외부 협력)은 **설계 제약**으로만 반영했고, 경로별 원작 근거 연결은 Gemini 원문 정정 이후로 보류했습니다. 제가 원작 사례를 새로 확인하거나 주장하지 않았습니다.

## 3. 변하지 않은 것 / 남은 일
- 게임 코드(`script.js`, `core/*`, `data.js`)와 3,000판 로그는 v1.7.3과 동일. 이전에 제출한 48,000생애·Chromium 24생애 로그는 게임 동작이 바뀌지 않았으므로 재생성하지 않았습니다(재현은 `node tests/multi_seed_stats.js`).
- 팔나 전 `adventurer` 직업, 입단 절차 사건화(2b 이후), 3~4단계, 30% 팔나 규칙, 층수·지역·위치·세계 연도는 미구현/보류입니다.
- 브라우저 독립 재현은 검수 환경 제약(`ERR_BLOCKED_BY_ADMINISTRATOR`)으로 QA가 inline 로드 방식으로 7/7만 확인했고, 일반 파일 서버 경로 검증은 남아 있습니다.

## 4. 승인 요청
설계안 §7.6의 4건(비공식 `minor` 생성 동의, 명성 효과 범위, `canon` 자격 적용 범위, 다음 버전 구현 범위 — 권장 2a).
