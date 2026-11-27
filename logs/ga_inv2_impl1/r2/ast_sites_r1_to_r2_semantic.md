# ast_sites.js r1(3408822) → r2(57776a9) 의미 비교(lines 필드 제외)

r1: 192키 · 위치 합계 220 / r2: 200키 · 위치 합계 229

## 추가 8
- T139 | hookNamesMatch | CallExpression | `RD_gopd(list[j],'name')` | ×1
- T140 | hookNamesMatch | MemberExpression | `list[j]` | ×1
- T141 | hookNamesMatch | CallExpression | `isData(dn)` | ×1
- T142 | hookNamesMatch | MemberExpression | `names[j]` | ×2
- T143 | hookNamesMatch | MemberExpression | `dn.value` | ×1
- T144 | init | CallExpression | `hookNamesMatch(HOOK_NEW0,ref.n)` | ×1
- T145 | init | CallExpression | `hookNamesMatch(HOOK_RM0,ref.r)` | ×1
- T146 | init | CallExpression | `Object.freeze({state:'inactive_unknown',reason:'hook_baseline_mismatch'})` | ×1

## 삭제 0

## id·count·parts·allowFn 변경 0

나머지 항목은 lines(작성 시점 줄 번호, 판정에 쓰지 않는 참고 필드)만 바뀌었다. 전체 원문 diff: ast_sites_r1_to_r2_full.diff
