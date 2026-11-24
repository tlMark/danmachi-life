#!/usr/bin/env python3
# 정본 판별기 v2 — 결정 기록 v13 G0~G6. 사용: python3 -I canon_check_v2.py <묶음을 푼 디렉터리>
# 문서 관리 확인용 일회성 도구. 저장소 밖에서만 쓴다. 입력 파일을 바꾸지 않는다.
import sys, os, re, hashlib

ROOT = sys.argv[1]
SPEC = [('F1D4A_DECISIONS', 'DECISION_SHEET'), ('F1D4A_DECISIONS', 'DECISION_LOG'),
        ('F1D4A_REVIEW_REGION_FALNA_DUNGEON', 'REVIEW')]
HUNK_RE = re.compile(r'^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@')
RANGE_RE = re.compile(r'`?-(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?`?')

def read_lines(p):
    with open(p, 'rb') as f:
        data = f.read()
    return data, data.decode('utf-8').split('\n')

def parse_diff(path):
    """단일 파일 unified diff 파싱. 머리 2줄과 hunk 목록을 돌려준다. 형식이 틀리면 예외."""
    _, L = read_lines(path)
    if L and L[-1] == '':
        L = L[:-1]
    heads = [l for l in L if l.startswith('--- ') or l.startswith('+++ ')]
    hunks, cur = [], None
    for l in L:
        if l.startswith('--- ') or l.startswith('+++ '):
            continue
        m = HUNK_RE.match(l)
        if m:
            a, b, c, d = m.group(1), m.group(2), m.group(3), m.group(4)
            cur = {'os': int(a), 'ol': int(b) if b is not None else 1, 'ns': int(c), 'nl': int(d) if d is not None else 1,
                   'range': '-%s,%s +%s,%s' % (a, b if b is not None else 1, c, d if d is not None else 1), 'body': []}
            hunks.append(cur)
            continue
        if l.startswith('\\'):  # "\ No newline at end of file"
            cur['body'].append(l)
            continue
        if cur is None or not l or l[0] not in ' +-':
            raise ValueError('diff 본문 형식 오류: %r' % l[:40])
        cur['body'].append(l)
    return heads, hunks

def strict_apply(src_lines, hunks):
    """offset·fuzz 없이 적용. 각 hunk의 옛 줄(문맥+삭제)이 머리에 적힌 줄 번호에서 정확히 일치해야 한다.
    hunk 머리의 줄 수와 본문 줄 수도 일치해야 한다. 실패하면 (None, 사유)."""
    out, pos = [], 0  # pos: src의 0기준 다음 복사 위치
    for i, h in enumerate(hunks, 1):
        old = [l[1:] for l in h['body'] if l[:1] in (' ', '-')]
        new = [l[1:] for l in h['body'] if l[:1] in (' ', '+')]
        if len(old) != h['ol'] or len(new) != h['nl']:
            return None, 'hunk %d 머리 줄 수 불일치' % i
        start = h['os'] - 1 if h['ol'] > 0 else h['os']
        if start < pos:
            return None, 'hunk %d 순서·겹침 오류' % i
        if src_lines[start:start + len(old)] != old:
            return None, 'hunk %d 문맥 불일치(적힌 위치 %d에서 정확히 맞지 않음 = offset 또는 fuzz 필요)' % (i, h['os'])
        out.extend(src_lines[pos:start]); out.extend(new); pos = start + len(old)
    out.extend(src_lines[pos:])
    return out, None

def summary_claims(dd, dname, hunk_ranges):
    """같은 디렉터리의 CHANGES_* 중 diff 이름을 적은 파일을 모두 모아 줄 수 기재와 hunk 대응 행을 뽑는다."""
    files, counts, rows = [], [], []
    for c in sorted(os.listdir(dd)):
        if not (c.startswith('CHANGES') and os.path.isfile(os.path.join(dd, c))):
            continue
        _, L = read_lines(os.path.join(dd, c))
        if not any(dname in l for l in L):
            continue
        files.append(c)
        for l in L:
            if dname in l:
                ma = re.search(r'추가 (\d+)줄', l); md = re.search(r'(?:삭제|대체) (\d+)줄', l)
                if ma or md:
                    counts.append((c, int(ma.group(1)) if ma else None, int(md.group(1)) if md else None))
            if l.startswith('|'):
                cells = [x.strip() for x in l.strip().strip('|').split('|')]
                if len(cells) >= 3 and cells[0].isdigit():
                    m = RANGE_RE.search(cells[1])
                    if m:
                        r = '-%s,%s +%s,%s' % (m.group(1), m.group(2) or 1, m.group(3), m.group(4) or 1)
                        rows.append((c, int(cells[0]), r, cells[2][:40]))
    return files, counts, rows

def check(d, pre):
    dd = os.path.join(ROOT, d); pat = re.compile(r'^%s_v(\d+)\.md$' % pre); R = {}; stop = []
    direct = [f for f in os.listdir(dd) if os.path.isfile(os.path.join(dd, f))]
    R['G0 하위 디렉터리 무시'] = [os.path.relpath(os.path.join(dp, f), dd) for dp, _, fs in os.walk(dd) if dp != dd for f in fs if pat.match(f)] or '없음'
    R['G1 제외'] = sorted(f for f in direct if f.startswith(pre) and f.endswith('.md') and not pat.match(f)) or '없음'
    cands = sorted((int(pat.match(f).group(1)), f) for f in direct if pat.match(f))
    if not cands:
        return {'판정': '중단(G6): 후보 없음'}
    N = cands[-1][0]; tops = [f for n, f in cands if n == N]; R['G2'] = tops
    if len(tops) != 1: stop.append('G2')
    cur = os.path.join(dd, tops[0]); cur_bytes, cur_lines = read_lines(cur)
    hist = [int(x) for x in re.findall(r'^- v(\d+):', cur_bytes.decode('utf-8'), re.M)]
    g3 = bool(re.search(r'\bv%d\b' % N, cur_lines[0])) and N in hist and max(hist) == N
    R['G3'] = g3; g3 or stop.append('G3')
    dname = '%s_v%d_to_v%d.diff' % (pre, N - 1, N); dp = os.path.join(dd, dname); prev = os.path.join(dd, '%s_v%d.md' % (pre, N - 1))
    if not (os.path.exists(dp) and os.path.exists(prev)):
        stop.append('G4-5 자료 누락'); R['판정'] = '중단(G6): ' + ', '.join(stop); return R
    heads, hunks = parse_diff(dp)
    g41 = len(heads) == 2 and heads[0].split()[1] == os.path.basename(prev) and heads[1].split()[1] == tops[0]
    R['G4-1 비교 대상(자동)'] = g41; g41 or stop.append('G4-1')
    _, prev_lines = read_lines(prev)
    res, why = strict_apply(prev_lines, hunks)
    R['G4-2 원본 엄격 적용(자동, 자체 적용기: offset·fuzz 0)'] = why or True; (why is None) or stop.append('G4-2')
    g43 = res is not None and '\n'.join(res).encode('utf-8') == cur_bytes
    R['G4-3 결과 바이트 일치(자동)'] = g43; g43 or stop.append('G4-3')
    adds = sum(1 for h in hunks for l in h['body'] if l.startswith('+'))
    dels = sum(1 for h in hunks for l in h['body'] if l.startswith('-'))
    R['diff 실제'] = '추가 %d, 삭제 %d, hunk %d' % (adds, dels, len(hunks))
    files, counts, rows = summary_claims(dd, dname, [h['range'] for h in hunks])
    R['G4-4 대상 요약 파일'] = files or '없음'
    cnt_ok = bool(counts) and all(a == adds and (dl == dels) for _, a, dl in counts)
    R['G4-4a 줄 수(자동, 모든 요약 파일)'] = (counts, cnt_ok)
    cnt_ok or stop.append('G4-4a 줄 수')
    by_hunk = {}
    for f, num, rng, desc in rows:
        by_hunk.setdefault(rng, []).append((f, num, desc))
    unknown = [r for r in by_hunk if r not in [h['range'] for h in hunks]]
    missing = [h['range'] for h in hunks if h['range'] not in by_hunk]
    dup = {r: v for r, v in by_hunk.items() if len(v) > 1}
    auto_ok = bool(rows) and not missing and not dup and not unknown
    R['G4-4b hunk 대응(자동)'] = {'대응 행': len(rows), '누락 hunk': missing or '없음', '중복 대응': dup or '없음', '모르는 범위': unknown or '없음', '결과': auto_ok}
    R['_auto_hunk_ok'] = auto_ok
    # 기계 판독 대응표가 있는데 틀렸으면(누락·중복·모르는 범위) 사람 확인으로 넘기지 않고 중단한다.
    # 대응표가 아예 없을 때만(rows == 0) 사람 확인 경로를 허용한다.
    R['_hunk_mode'] = 'auto' if auto_ok else ('stop' if rows else 'human')
    if rows and not auto_ok: stop.append('G4-4b hunk 대응')
    sums = {}
    for l in open(os.path.join(dd, 'SHA256SUMS'), encoding='utf-8'):
        if l.strip():
            h, n = l.split(None, 1); sums[n.strip()] = h
    g5 = sums.get(tops[0]) == hashlib.sha256(cur_bytes).hexdigest(); R['G5'] = g5; g5 or stop.append('G5')
    R['_stop'] = stop; R['_top'] = tops[0]
    return R

print('최상위 디렉터리:', sorted(d for d in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, d))))
print('묶음 안 zip:', [os.path.join(dp, f) for dp, _, fs in os.walk(ROOT) for f in fs if f.endswith('.zip')] or '없음')
for d, pre in SPEC:
    R = check(d, pre)
    print('==', pre)
    for k, v in R.items():
        if not k.startswith('_'):
            print('  ', k, ':', v)
    if '_stop' in R:
        hunk = {'auto': '자동 통과', 'stop': '자동 실패(대응표 오류) → 중단', 'human': '기계 판독 대응표 없음 → 사람 확인 필요'}[R['_hunk_mode']]
        verdict = ('중단(G6): ' + ', '.join(R['_stop'])) if R['_stop'] else ('정본 후보 ' + R['_top'])
        print('   자동 판정:', verdict, '| G4-4b:', hunk)
