# 설계안 (구현 전, 승인 요청) — 자녀 · 직업 · 모험자 지망 · 파밀리아 · 팔나 상태 분리

작성: Claude (주 개발자) · 상태: **제안만 있음, 코드 미구현** · 승인권자: 프로젝트 총괄

## 1. 현재 구조와 문제 (실제 코드·측정 근거)

| 항목 | 현재 동작 | 문제 |
|---|---|---|
| `S.job === 'child'` | 진로 선택 전의 아이. `career_choice` 또는 파밀리아 입단 시 `JOB_FAMILIA` 기본 직업으로 덮임 | 직업이 "무엇이 되고 싶은가"와 "무엇을 하는가"를 겸함 |
| `adventurer` 직업 | 파밀리아 입단 시점에 부여, 팔나 수령(`falnaAt`)은 이후. 시드 20261104 3,000판: 모험자가 된 356생 중 248생(70%)이 팔나 이전에 `adventurer` | 팔나 없는 모험자가 존재. 던전 이벤트는 막았지만 직업 표시·연간 엑세리아·부모 편지 등은 그대로 모험자 취급 |
| 입단 ≠ 팔나 | `falnaAt = max(age, rnd(m.falna))`, 비모험자 파밀리아는 30%만 팔나 | v1.7.1 측정의 "입단 후 10년 이상 지연"은 출생 즉시 입단(0세) 때문이었음(v1.7.2에서 부모 소속과 분리해 최대 6년으로 감소). 그러나 0~6년 지연의 서사적 근거는 여전히 없음 |
| 가입 시도/거절 | `join`, `join_hard` 이벤트가 곧바로 `familia:'roll'` | 시도·거절·추천·입단 구분 없음 |

## 2. 제안 상태 모델

```
S.stage            'infant' | 'child' | 'youth' | 'adult'      // 달력 나이 구간(예: ~11 / 12~17 / 18+의 임의 구간)
S.job              실제 생업만: 'none' | merchant | farmer | ... | adventurer | soldier ...
S.aspiration       { kind, since, source }  // 희망 진로. 직업이 아님 (adventurer_aspirant, craftsman_aspirant ...)
S.application      { familiaId, attempts, rejections, recommender } // 입단 절차 상태
S.familiaHistory[] (v1.7.2 구현됨) 입단·탈퇴·변경 이력
S.falnaHistory[]   (v1.7.2 구현됨) 팔나 취득 이력
S.employer         (v1.7.2 구현됨) 조직·고용처(팔나 없음)
S.parentFamilia    (v1.7.2 구현됨) 부모 소속(자녀 소속과 분리)
S.currentLocation  // 별도 설계(위치 제안) 대상
```

원칙:
1. `job === 'adventurer'` ⇔ 팔나 보유 ∧ 길드 등록. 팔나 전의 모험자 지망생은 `aspiration.kind === 'adventurer'`이며 직업은 `none`/`child`.
2. 입단은 사건(신청 → 심사 → 거절/추천/입단), 팔나는 입단 사건과 **같은 순간**에 부여가 기본. 지연은 명시적 사유(신 부재, 대기, 의식 일정)가 있는 별도 사건에서만 허용.
3. 파밀리아 기본 직업(`JOB_FAMILIA`)은 **입단(=팔나) 시점에** 적용하되 기존 직업이 있으면 보존(현행 정책 유지). Ares/Kali → soldier 정책은 그대로.
4. 부모 소속은 추천 가중치로만 작용(현재 `PARENT_FAMILIA_BIAS = 6`, 임의값).

## 3. 영향 범위

- `cond.job` 사용 이벤트 중 `['adventurer']` 한정 이벤트(`wargame`, `parent_worry`, `buy_*`, 던전 16개 등)는 팔나 후에만 발생. 팔나 전 지망생용 이벤트 풀(수련, 지원, 낙방, 길드 견학)이 필요해 **신규 이벤트 약 6~8개**.
- `yearlyActivity`의 `ANNUAL_ACTIVITY.adventurer`(팔나 전 잠재력 적립)는 지망생 키 `aspirant_adventurer`로 이동 필요 → 잠재력/레벨 분포가 바뀌므로 **재측정 후 밸런스 승인 필요**.
- `core/growth.js`·`core/relations.js` 변경 없음. `script.js`(`setJob`, `rollFamilia`, `checkFalna`, `match`)·`events.js` 수정.
- 테스트: "모험자 직업인데 팔나 없음 = 0" 불변식, 입단-팔나 간격 분포(사유 포함), 지망생 이벤트 도달률, 다중 시드 A/B.

## 4. 단계 (각 단계마다 3,000판 × 다중 시드 + 브라우저 테스트)

1. `aspiration` 도입 + 표시. 직업 부여 규칙은 그대로(안전한 선행 단계)
2. 입단 절차 사건화(신청/거절/추천/입단), `join`·`join_hard` 재작성
3. 입단과 팔나 동시 부여로 전환, 지연은 사유 이벤트로 이동
4. `adventurer` 직업 부여를 팔나 시점으로 이동 + 지망생 이벤트 풀 + 밸런스 재측정

## 5. 승인이 필요한 결정

1. 팔나 전 `adventurer` 직업을 금지할지(권장: 금지, 지망생으로 대체)
2. 입단 즉시 팔나 vs 지연 허용(권장: 즉시, 지연은 사유 이벤트)
3. 비모험자 파밀리아(데메테르·미아흐 등)의 팔나 30% 규칙 유지 여부(원작 근거 미확인 → 임의값)
4. 1~4단계 중 어디까지 진행할지

## 6. QA 권고 반영 메모 (v1.7.3)

- 결정 1·2(팔나 전 모험자 직업 금지, 입단=팔나 원칙)와 4(1~4단계 순차 진행)는 QA 권고 승인, **총괄 최종 승인은 별도**. 결정 3(비모험자 30% 규칙)은 QA가 반대 — 아직 변경하지 않았고 정식 단원/보호 대상/고용 조직 분리 설계 후 재정의 필요.
- `stage` 나이 구간은 원작 정설이 아닌 **게임 규칙**임을 표시한다.
- `application`은 "진행 중 신청(현재)"과 "과거 신청 이력"을 분리한다.
- `adventurer` 직업을 팔나+길드 등록으로 정의하면 `guildRegisteredAt` 등 등록 상태를 별도 데이터로 둔다.
- `familiaHistory`↔`falnaHistory` 연결 규칙: 현재 `falnaHistory[].membershipIndex`로 팔나를 받은 소속을 가리키고, 다른 소속으로 이적하면 새 소속 항목에 `falnaAlreadyHeld:true`가 기록된다. 이적 시 기존 팔나 처리(1년 개종 제한, 양측 신 동의)는 원작 근거 확보 전까지 구현하지 않는다.
- **1단계 구현 상태(v1.7.3):** `S.aspiration`/`S.aspirationHistory`만 도입. 직업 부여 규칙은 변경 없음.

## 7. 2단계 상세 설계 — 입단 절차 · 무명 파밀리아 · 개인/파밀리아 명성 (설계만, 코드 미구현)

> **원칙:** 이 절에는 확률·문턱값을 넣지 않는다. 모든 수치는 `RECRUIT_TUNING`(미정, 밸런스 단계에서 총괄 승인 후 채움)로 모으고, 이 설계안은 **상태·전이·판정 입력**만 정한다. 원작 사례는 Gemini의 원문 기준 정정(확정/추론/미확인 분류)이 도착한 뒤 경로별 근거로 연결한다. QA가 지적한 구분(레피야=이미 소속된 모집 담당, 오탈의 발견≠정식 입단, 미아의 보은형 입단, 프레이야 세례의 입단 심사/가입 후 훈련 구분, 류·아폴론 혼동 정정, 개종과 외부 협력 구분)은 **설계 제약**으로만 반영한다.

### 7.1 현재 문제 (코드 근거)
`join`/`join_hard`는 거절 문구를 출력한 뒤 곧바로 `rollFamilia()`(가중치 추첨)를 호출한다. 신청·심사·거절·추천·스카우트는 상태가 아니며, 명시된 원작 파밀리아 풀(`data.js`)만 있어 작은 파밀리아가 없다.

### 7.2 파밀리아 종류와 데이터

```
familia record
  id, label
  kind        'canon' | 'minor'            // minor = 절차적 생성(비공식 창작, UI에 표시)
  official    true | false
  god         { trait[] }                  // 신의 성향(예: 방임/엄격/호기심/보은 중시 …) — 목록은 Gemini 조사 후 확정
  purpose     운영 목적(탐색/생산/구호/학구/지역 봉사 …)
  needs       필요 인재(직업·재능·종족 선호)  // 단순 확률이 아니라 판정 입력
  recruitment { routes[], openCall(bool) }  // 이 파밀리아가 허용하는 입단 경로
  fame        'unknown' | 'local' | 'orario' | 'major'   // 서사 단계(문턱값 TBD). 표시명은 대상별 분리(§9.4): 개인용 / 파밀리아용
```
- `minor` 파밀리아는 **출신 지역·시기에 맞게 생애 시작 시 몇 개를 생성**해 `S.minorFamilias`에 캐시(같은 생애에서 이름·성향이 일관). 시드로 재현 가능해야 한다.
- 기존 `FAMILIA_BIAS`·`PARENT_FAMILIA_BIAS` 같은 가중치는 `canon` 추천 입력으로 이동한다.
- 유명 `canon` 파밀리아(로키·프레이야 등)는 **자격 조건(predicate)** 으로 문턱을 둔다(추첨 풀에서 제거). 구체적 자격은 원작 근거 확정 후.

### 7.3 입단 절차(상태 전이)

```
S.application = {
  current: null | { targetId, route, startedAt, attempts },   // 진행 중 신청은 하나
  history: [ { targetId, route, at, outcome, reasonCode } ]     // 과거 신청 이력(별도)
}
outcome: accepted | rejected | withdrawn | ignored | deferred
route:   open_call | self_apply | referral | scout | exam | persistence | god_whim
```
전이: `aspiration → (route 선택) → current → 판정 → history` → `accepted`면 입단 항목 생성(`familiaHistory`).
팔나 시점은 **목표 규칙**과 **단계별 임시 규칙**을 분리한다(§8.1 표).
- 거절은 사망·영구 이탈이 아니다. 재지원·추천·다른 파밀리아 지원 가능. 재지원 제한(대기기간)은 `RECRUIT_TUNING`.
- `scout`/`god_whim`은 지원 없이 `history`에 `accepted`로 직접 기록(신의 선택), 신청 상태는 거치지 않음.
- `referral`: 추천인은 `S.relations`의 실제 인물(부모·친구·고용처 등) 또는 소속 단원이어야 한다(추천인 id 저장). 부모 소속은 추천 후보 중 하나로만 작용(현재 `PARENT_FAMILIA_BIAS` 대체).
- 판정 함수 시그니처(구현은 2단계에서): `evaluateApplication(S, familia, route) → { outcome, reasonCode }`. 입력: 신의 성향, 파밀리아 인력 수요(`needs`), 지원자의 직업·재능·종족·인연, 과거 신청 이력, 추천인 유무, 파밀리아 명성 단계. **판정은 이 입력만 사용하고 전역 단일 확률표를 쓰지 않는다.**

### 7.4 명성: 개인과 파밀리아의 분리

```
S.fame            { stage, credits[] }        // 개인: 공개적으로 알려진 업적(영웅 이벤트·토벌·구조 등)
S.familiaFame     { [membershipId]: { familiaId, stage, creditIds[] } }   // 소속 이력(familiaHistory[].id)별로 보관. 이적해도 이전 업적이 사라지지 않음
```
- 개인 명성은 업적의 **공개 여부**로, 파밀리아 명성은 업적이 **그 파밀리아의 이름으로 인정**될 때만 오른다(소속이 알려진 상태의 임무·전쟁유희·구조). 소속을 숨긴 업적이나 입단 전 업적은 개인 명성에만 반영.
- 단계는 서사 4단계 `unknown → local → orario → major`(코드 `GameCore.Recruit.FAME_STAGES`; 표시명은 개인/파밀리아 분리, §9.4)로 관리하고, 단계 전환 문턱은 숨은 누적값(`credits` 가중합)으로 두되 **값은 미정**.
- 명성의 효과(예정): 신규 지원자 유입/모집 경로 개방, 추천 가능성, 이벤트 풀 변화. 플레이어는 **단원**이며 신이 아니므로 파밀리아 창설·운영은 범위 밖(별도 기획).
- 명성 증가원은 기존 이벤트 중 `wargame`, `hero_sacrifice`, 던전 위업 이벤트를 후보로 하되, 각 이벤트의 `fx`에 `familiaCredit`/`personalCredit` 키를 새로 추가하는 방식(기존 `fx` 구조 확장).

### 7.5 영향 범위·구현 순서(각 단계마다 전체 ZIP + 다중 시드 + 브라우저)
1. **2a (v1.7.5 구현 완료)** 데이터 모델만: `kind`/`official` 필드, `S.application`, `RECRUIT_TUNING` 자리(빈 값), `minorFamilias` 생성기(이름·성향 목록은 조사 후). 동작 변화 없음(기존 `join`/`join_hard`는 그대로).
2. **2b** `join`/`join_hard`를 신청·판정·이력 기록으로 교체(경로 `self_apply`/`open_call`만). **임시 규칙:** 입단 확정 후 팔나 시점은 기존 `falnaAt` 방식 유지(목표 규칙은 3단계, §8.1).
3. **2c** `referral`/`scout`/`exam`/`persistence`/`god_whim` 경로 이벤트.
4. **2d** 명성(개인/파밀리아) 기록과 효과.
- 테스트: 거절이 `endLife`를 부르지 않음, `current`는 항상 0~1개, `accepted`와 `familiaHistory` 1:1, 추천인 실재, `minor`는 UI에서 비공식 표시, 경로별 도달 분포 보고(숫자는 임의값임을 명시), 같은 시드 재현성, `official:false` 파밀리아에 canon 전용 이벤트가 걸리지 않음.

### 7.6 총괄 결정이 필요한 질문
1. `minor` 파밀리아의 이름·성향을 비공식 절차 생성으로 하는 것에 동의하는가(원작 고유명 사용 금지 원칙 포함).
2. 명성 4단계 명칭과 효과 범위(모집 경로 개방까지만 / 이벤트 풀 변화까지).
3. `canon` 유명 파밀리아의 자격 조건을 원작 근거가 확정된 것만 적용하고 나머지는 `minor`와 같은 심사 경로로 둘지.
4. 2a~2d 중 다음 버전에서 진행할 범위(권장: 2a만, 동작 변화 없는 데이터 모델 선행).

## 8. v1.7.4 QA 지적 5건 정리 (설계 확정안, 승인 대기)

### 8.1 입단과 팔나 시점: 목표 규칙 vs 단계별 임시 규칙

| 구분 | 입단 확정(accepted)과 팔나 | 적용 단계 |
|---|---|---|
| **목표 규칙** | 입단 확정 순간에 팔나 부여. 지연은 신 부재·의식 대기 등 **명시적 사유 이벤트**(`falnaDeferred` 사유 코드 기록)에서만 | 3단계(승인 후) |
| 임시 규칙 | 입단 확정과 팔나가 분리되어 있음(현행 `falnaAt` 방식 유지). 입단-팔나 간격 통계는 계속 보고 | 현재 ~ 2c |
| 예외 | 이미 팔나를 보유한 채 이적(`falnaAlreadyHeld:true`)하면 새 팔나는 없고 기존 팔나 처리는 원작 근거 확정 후 | 별도 |

2a~2c 동안 코드는 "임시 규칙"만 구현하며, 목표 규칙은 3단계 승인 전에 켜지지 않는다.

### 8.2 파밀리아 명성 보존(소속 이력별)
- `familiaHistory[]` 항목에 순차 `id`(membershipId, v1.7.5에 구현)를 부여하고, 명성·업적은 이 id에 연결한다.
- 이적/탈퇴해도 해당 소속 기간의 명성 기록은 삭제하지 않는다. 같은 파밀리아에 재가입하면 **새 membershipId**로 새 기록이 생기고, 파밀리아 전체 요약은 `familiaId`로 합산해 표시한다(합산은 표시용, 원본은 membership별).

### 8.3 신의 직접 선택(scout / god_whim) 경로
`application.current`를 거치지 않는 별도 함수 `admitDirect(S, familiaId, route, reason)`를 둔다.
1. `history`에 `{ outcome:'accepted', route:'scout'|'god_whim', initiator:'god', reasonCode, at }`를 추가한다. `current`는 만들지 않는다.
2. 이미 `current`가 같은 파밀리아를 향하면 그 신청을 `accepted`(initiator `god`)로 닫는다. 다른 파밀리아를 향하면 `current`는 건드리지 않는다(플레이어가 별도로 철회/유지).
3. 입단 항목(`familiaHistory`, 새 membershipId)을 만든다. 팔나는 §8.1 규칙을 따른다.
4. `initiator` 열거: `applicant | familia | god | referrer`(코드 `GameCore.Recruit.INITIATORS`).
5. 이미 소속이 있는 경우의 직접 스카우트는 이적 절차(개종)로 취급하며, 개종 제한은 원작 근거 확정 전까지 구현하지 않는다.

### 8.4 업적(크레딧) 귀속 기록 스키마

```
credit = {
  id, at(달력 나이), sourceEvent,                // 어떤 이벤트에서 생긴 업적인가
  public: true | false,                          // 업적이 공개적으로 알려졌는가
  membershipId: null | n,                        // 업적 당시의 소속(없으면 null)
  publicAffiliation: null | familiaId,           // 공개된 소속 이름(숨겼다면 null)
  attributedTo: 'personal' | 'familia' | 'both', // 누구의 이름으로 인정되었는가
  retroactive: false                             // 소급 귀속 금지(항상 false)
}
```
규칙:
- `membershipId == null`(입단 전) 또는 `publicAffiliation == null`(소속을 숨김)이면 `attributedTo`는 `personal`뿐이다.
- 파밀리아 명성은 `public && publicAffiliation == 소속 familiaId`인 크레딧만 해당 membershipId의 명성에 반영한다.
- 기록된 크레딧은 수정·재귀속하지 않는다(나중에 입단하거나 소속이 알려져도 과거 크레딧은 그대로).
- 명성 기록의 근거는 `S.fame.credits[]`(개인)와 membershipId별 `creditIds`(파밀리아)에 남긴다.

### 8.5 QA §6 권고 반영 상태(총괄 최종 승인 대기)

| 결정 | 반영 |
|---|---|
| minor 파밀리아 | 조건부 동의 반영: 원작 고유명·기존 신 이름 예약어 검사(`RESERVED_NAMES` + 게임 데이터 라벨), 비공식 표시(`note`, `official:false`), 생애 시작 시 1회 캐시 예정, 별도 파생 RNG(`createDerivedRng`) 사용 — 2a에 구현·테스트됨(비활성) |
| 명성 단계 | enum/표시명 통일. 초기 효과는 모집 경로 개방·지원자 유입·추천 기회까지, 이벤트 풀 변화는 후속 |
| canon 자격 조건 | 원작 근거가 확인된 제한만 적용. 미확정이면 canon 분류 유지 + 일반 신청 절차, 임의 자격 창작·minor 재분류 금지 |
| 범위 | **2a만** 구현. 2a 불변 주장은 같은 시드 `lifeDigest` 회귀 비교로 증명(`tests/regression_digest.js`) |

## 9. v1.7.5 QA 지적 반영 — 소속 역할 모델 설계 (설계만, 코드 미구현 · 총괄 승인 대기)

### 9.1 문제
기본 3,000판에서 `membershipsWithoutFalna=112`. 현재는 "파밀리아 소속"과 "팔나 보유"만 분리되어 있어, 팔나 없는 소속이 **정식 단원인데 팔나 수여가 아직 안 된 상태**인지 **보호·거주 대상**인지 구분되지 않는다. 이 구분 없이 2b의 `accepted`를 연결하면 입단 수락의 의미가 불명확하다. (현재 비팔나 소속의 직접 원인은 `rollFamilia()`가 비모험자형 파밀리아에서 팔나를 30%만 주는 임의 규칙 — 원작 근거 없음.)

### 9.2 세 가지 소속 유형(제안)

| 유형 | 코드값 | 팔나 | 데이터 위치 | 정의 |
|---|---|---|---|---|
| 정식 팔나 단원 | `member` | 입단 확정과 함께 보유(목표 규칙; 임시 규칙 동안은 수여 대기 허용) | `S.familiaHistory[]` (`role:'member'`) | 신의 파밀리아에 정식 계약, 던전·전쟁유희·파밀리아 명성의 주체 |
| 비팔나 보호·거주 대상 | `protected` | 없음 | `S.familiaHistory[]` (`role:'protected'`) | 같은 파밀리아의 보호·부양·거주를 받으나 팔나 계약은 아님. 예: 아이·피보호자·가족 |
| 외부 조직 고용 | (소속 아님) | 없음 | `S.employer` (v1.7.2에 구현됨) | 길드·주점처럼 신의 파밀리아가 아닌 조직 |

원작에서 어떤 인물이 어느 유형인지의 근거는 Gemini 정정 자료 도착 전에는 연결하지 않는다. 위 유형은 **게임 상태 분류**이며 원작 정설이 아니다.

### 9.3 유형별 권한 표(제안)

| 항목 | member | protected | 조직 고용 |
|---|---|---|---|
| 팔나 | 있음(목표) | 없음 | 없음 |
| `job:'adventurer'`(승인된 설계 결정 1) | 팔나 후에만 | 불가 | 불가 |
| 던전 이벤트(`EVENT_AREA: dungeon`) | 가능(팔나·직업 조건 그대로) | 불가 | 불가 |
| 전쟁유희 등 `hasFamilia` 이벤트 | 가능 | 불가 → 이벤트 조건을 `familiaRole:'member'`로 세분 | 불가 |
| 파밀리아 명성 크레딧 귀속 | 가능 | 불가(개인 명성만) | 불가 |
| 기본 직업(`JOB_FAMILIA`) | `child`일 때 적용(현행 유지) | 적용하지 않음 | `JOB_ORG`(현행) |
| 모집 경로 | 모든 경로 | 승격 이벤트로만 | `career_choice` 등 명시 이벤트 |
| 승격 | `protected → member`: 별도 사건(수락 + 팔나 수여) | — | 조직 고용 ≠ 승격 |

### 9.4 개인/파밀리아 명성 표시명 분리
enum(`unknown/local/orario/major`)은 공통, 표시명은 분리(코드: `FAME_LABELS_PERSONAL` / `FAME_LABELS_FAMILIA`). 개인용에는 "파밀리아"라는 단어를 쓰지 않는다(v1.7.6 구현·테스트됨).

| 단계 | 개인 | 파밀리아 |
|---|---|---|
| unknown | 무명 | 무명 파밀리아 |
| local | 지역에서 알려진 인물 | 지역에서 알려진 파밀리아 |
| orario | 오라리오에서 알려진 인물 | 오라리오에서 알려진 파밀리아 |
| major | 이름난 인물 | 유력 파밀리아 |

### 9.5 `accepted`의 의미 확정(2b 전제)
`application.current`에는 `targetRole: 'member' | 'protected'`를 둔다. `accepted`는 해당 `role`로 `familiaHistory` 항목을 만든다. `member`면 팔나(목표 규칙), `protected`면 팔나 없음. `admitDirect`도 `role`을 지정한다. 어떤 파밀리아가 어떤 role을 허용하는지는 파밀리아 데이터의 `memberPolicy`(예: member만 / member·protected)로 두고 **값은 미정**(`RECRUIT_TUNING` 밖의 구조 데이터이며 원작 근거 확정 후 입력).

### 9.6 현행 30% 규칙의 처리(QA 반대 의견 반영)
`falnaAt`의 30% 비팔나 분기는 `memberPolicy`가 구현되면 제거하고 **role 결정**으로 대체한다. 그전(2b까지)에는 임시로 유지한다. 대체 후 기존 비팔나 소속 112건(3,000판)은 `protected`로 해석되거나 사라질 수 있으므로 분포 변화가 크다 → 3단계에서 기준 해시를 의도적으로 갱신하고 A/B를 보고한다.

### 9.7 구현 순서·테스트(2b 전)
1. **2a-fix (v1.7.6 완료)**: `civilian` 태깅 수정, 명성 라벨 분리, off 기준 해시 편입.
2. **2a-role (다음, 동작 불변)**: `familiaHistory[].role`을 **기록만**(현행 동작과 같은 값: 팔나를 받는 항목 `member`, 못 받는 항목 `protected`로 *해석*). 테스트: role과 팔나 수여 상태 일치, 기준 해시 불변.
3. 승인 후 2b(`join`/`join_hard` 신청·판정화).
- 불변식 후보: `role==='protected'`인 항목 구간에는 `adventurer`+던전 이벤트 없음, `protected`는 파밀리아 명성 크레딧 없음, 조직 고용은 `familiaHistory`에 들어가지 않음.

### 9.8 총괄 결정 요청
1. 세 유형(member / protected / 조직 고용) 분류에 동의하는가
2. `protected`에게 `hasFamilia` 이벤트를 막을지(권장: 막고 `familiaRole` 세분 조건 사용)
3. 30% 규칙을 `memberPolicy` 도입 시 제거하는 방침 동의 여부
4. 2a-role(기록만)을 다음 버전 범위로 승인하는가
