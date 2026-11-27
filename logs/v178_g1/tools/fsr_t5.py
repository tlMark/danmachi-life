# FSR-T5 집계(외부 도구, 게임 코드 아님): 분석 사본 생애별 기록(valis·job2·cause 필드 포함)만 읽는다. 사용: python3 fsr_t5.py <A 폴더> <B 폴더>
import json, glob, sys, statistics, collections
def agg(d):
    r = collections.Counter(); val = []; supval = []
    for f in sorted(glob.glob(d + '/life_*.json')):
        for l in json.load(open(f)):
            n = l['ev'].count('free_supporter_route')
            if n: r['fsr_lives'] += 1; r['fsr_ev'] += n; val.append(l['valis'])
            if l['cause'].startswith('파티가 무너지며'): r['fsr_death'] += 1
            if l['job2'] == 'supporter': supval.append(l['valis'])
            if not l['adv'] and not l['falna']:
                if any(e in ('free_supporter_route',) for e in l['ev']) and False: pass
            r['lives'] += 1
    q = lambda a: (len(a), round(statistics.mean(a)) if a else None, statistics.median(a) if a else None) 
    return r, q(val), q(supval)
A, B = sys.argv[1], sys.argv[2]
for tag, d in (('A', A), ('B', B)):
    r, v, s = agg(d)
    print(f'{tag}: 생애 {r["lives"]} · free_supporter_route 발생 {r["fsr_ev"]}(생애 {r["fsr_lives"]}) · 이 사건 사망(중층 동행 실패 문구) {r["fsr_death"]}'
          f' · 이 사건 겪은 생애 끝 valis (수, 평균, 중앙값) {v} · 생애 끝 직업 supporter 의 끝 valis {s}')
