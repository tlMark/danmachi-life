# 2ba-t1(기준) vs 2bb — 3,000생애 실측 비교 (같은 시드, 각 버전 자체 러너)

## 시드 20261104
| 항목 | 2ba-t1 | 2bb |
|---|---|---|
| completed | 3000 | 3000 |
| allRunsCompleted | True | True |
| runtimeExceptions | 0 | 0 |
| guardTrips | 0 | 0 |
| allInvariantsPassed | True | True |
| nonFiniteValues | 0 | 0 |
| familiaJoinJobOverwrites | 0 | 0 |
| eventGateViolations | "0 []" | "0 []" |
| 소속 경험 생애(timeline.livesWithMembership) | 1631 (54.37%) | 1563 (52.10%) |
| 팔나 보유 생애 falnaRatePct | 49.1 | 46.73 |
| 지원자 중 거절 경험 % | 0(개념 없음) | 23.71 |
| initial_join 경로별(v178.rollModeByEvent) | {"join_hard:initial_join": 465, "latejoin:initial_join": 444, "join:initial_join": 622, "career_choice:initial_join": 100} | {"join:initial_join": 594, "join_hard:initial_join": 498, "latejoin:initial_join": 385, "career_choice:initial_join": 86} |
| 전이 원인(v178.transitionsByCause) | {"grant": 1509, "drop_familia": 383, "god_returned": 65, "regrant": 29} | {"grant": 1457, "god_returned": 103, "drop_familia": 413, "regrant": 48} |
| rngCallsTotal | 1582196 | 1622404 |
| maxLevelReached | 8 | 9 |
| finalLevelDistribution | {"0": 1491, "1": 497, "2": 694, "3": 192, "4": 57, "5": 29, "6": 27, "7": 7, "8": 6} | {"0": 1543, "1": 483, "2": 669, "3": 182, "4": 44, "5": 26, "6": 33, "7": 7, "8": 8, "9": 5} |
| finalJobDistribution | {"retired": 2680, "adventurer": 129, "merchant": 77, "soldier": 14, "child": 5, "supporter": 89, "blacksmith": 3, "healer": 1, "farmer": 1, "guild_staff": 1} | {"retired": 2684, "merchant": 70, "farmer": 6, "adventurer": 125, "soldier": 11, "waitstaff": 4, "supporter": 90, "guild_staff": 4, "child": 2, "blacksmith": 1, "healer": 3} |
| deathCauses | {"natural": 2720, "hp": 129, "event": 151} | {"natural": 2728, "hp": 119, "event": 153} |
| lifeDigest | 2109524451 | 3527191366 |

2bb recruit2bb: `{"livesApplied": 1531, "livesWithRejection": 363, "livesAppliedNeverAccepted": 353, "applications": 1542, "direct": 385, "blocked": 11, "blockedByReason": {"cooldown": 11}, "byRouteOutcome": {"self_apply:rejected": 131, "self_apply:accepted": 680, "persistence:accepted": 498, "persistence:rejected": 233}, "maxGeneralPerLife": 2, "currentLeftAtLifeEnd": 0, "badOutcome": 0, "acceptedWithoutMembership": 0, "rejectedButJoined": 0, "badDirect": 0, "cooldownViolations": 0, "sameFamiliaViolations": 0, "capViolations": 0, "membershipLivesPct": 52.1, "rejectionAmongAppliedPct": 23.71}`

## 시드 777
| 항목 | 2ba-t1 | 2bb |
|---|---|---|
| completed | 3000 | 3000 |
| allRunsCompleted | True | True |
| runtimeExceptions | 0 | 0 |
| guardTrips | 0 | 0 |
| allInvariantsPassed | True | True |
| nonFiniteValues | 0 | 0 |
| familiaJoinJobOverwrites | 0 | 0 |
| eventGateViolations | "0 []" | "0 []" |
| 소속 경험 생애(timeline.livesWithMembership) | 1624 (54.13%) | 1603 (53.43%) |
| 팔나 보유 생애 falnaRatePct | 48.43 | 47.37 |
| 지원자 중 거절 경험 % | 0(개념 없음) | 24.7 |
| initial_join 경로별(v178.rollModeByEvent) | {"latejoin:initial_join": 418, "career_choice:initial_join": 94, "join:initial_join": 715, "join_hard:initial_join": 397} | {"latejoin:initial_join": 452, "join_hard:initial_join": 514, "career_choice:initial_join": 72, "join:initial_join": 565} |
| 전이 원인(v178.transitionsByCause) | {"grant": 1503, "drop_familia": 407, "god_returned": 91, "regrant": 41} | {"grant": 1478, "drop_familia": 387, "god_returned": 83, "regrant": 26} |
| rngCallsTotal | 1618008 | 1615575 |
| maxLevelReached | 9 | 9 |
| finalLevelDistribution | {"0": 1497, "1": 495, "2": 657, "3": 214, "4": 57, "5": 31, "6": 27, "7": 15, "8": 5, "9": 2} | {"0": 1522, "1": 481, "2": 682, "3": 198, "4": 46, "5": 32, "6": 25, "7": 9, "8": 2, "9": 3} |
| finalJobDistribution | {"retired": 2672, "adventurer": 142, "supporter": 96, "merchant": 70, "healer": 1, "soldier": 12, "farmer": 4, "blacksmith": 1, "waitstaff": 1, "child": 1} | {"retired": 2708, "merchant": 65, "supporter": 79, "soldier": 15, "adventurer": 116, "farmer": 3, "healer": 4, "child": 4, "guild_staff": 2, "blacksmith": 2, "waitstaff": 2} |
| deathCauses | {"natural": 2713, "hp": 141, "event": 146} | {"natural": 2749, "hp": 118, "event": 133} |
| lifeDigest | 596465386 | 1476379107 |

2bb recruit2bb: `{"livesApplied": 1518, "livesWithRejection": 375, "livesAppliedNeverAccepted": 367, "applications": 1530, "direct": 452, "blocked": 13, "blockedByReason": {"cooldown": 13}, "byRouteOutcome": {"persistence:accepted": 514, "persistence:rejected": 238, "self_apply:rejected": 141, "self_apply:accepted": 637}, "maxGeneralPerLife": 2, "currentLeftAtLifeEnd": 0, "badOutcome": 0, "acceptedWithoutMembership": 0, "rejectedButJoined": 0, "badDirect": 0, "cooldownViolations": 0, "sameFamiliaViolations": 0, "capViolations": 0, "membershipLivesPct": 53.43, "rejectionAmongAppliedPct": 24.7}`

