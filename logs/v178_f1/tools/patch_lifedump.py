# 러너 계측(읽기 전용, 환경 변수 SIM_LIFE_DUMP 지정 시에만 동작): 생애별 digest 항목과 join_hard(persistence) 거절·차단 경험 여부를 파일로 남긴다.
import sys,io
p=sys.argv[1]; s=io.open(p,encoding='utf8').read()
def rep(o,n):
    global s; assert s.count(o)==1,o[:60]; s=s.replace(o,n)
rep("            lifeDigest = fnv(lifeDigest, JSON.stringify([S.age, +S.physicalAge.toFixed(3), S.level, S.job, S.familia ? S.familia.id : null, Math.round(S.hp * 1000), S.valis, S.bond, S.power, S.cause, currentLifeEvents.join(',')]));\n",
"""            lifeDigest = fnv(lifeDigest, JSON.stringify([S.age, +S.physicalAge.toFixed(3), S.level, S.job, S.familia ? S.familia.id : null, Math.round(S.hp * 1000), S.valis, S.bond, S.power, S.cause, currentLifeEvents.join(',')]));
            if (typeof __lifeDump !== 'undefined' && __lifeDump) {   // 생애별 기록(읽기 전용, SIM_LIFE_DUMP 지정 시에만)
                const app = S.application || {};
                const persistenceFail = (app.history || []).some(h => h.route === 'persistence' && h.outcome === 'rejected') || (app.blocked || []).some(b => b.route === 'persistence');
                __lifeDump.push({ i: run, d: fnv(2166136261, JSON.stringify([S.age, +S.physicalAge.toFixed(3), S.level, S.job, S.familia ? S.familia.id : null, Math.round(S.hp * 1000), S.valis, S.bond, S.power, S.cause, currentLifeEvents.join(',')])), pf: persistenceFail, job: S.job, sup: S.flags.includes('supporter'), fam: !!(S.familiaHistory || []).length, falna: (S.falnaHistory || []).length > 0, ev: currentLifeEvents.slice() });
            }
""")
rep("    __rngCalls: () => rng.calls(),\n", "    __rngCalls: () => rng.calls(),\n    __lifeDump: process.env.SIM_LIFE_DUMP ? [] : undefined,\n")
s=s.rstrip('\n')+"\nif (process.env.SIM_LIFE_DUMP && context.__lifeDump) fs.writeFileSync(process.env.SIM_LIFE_DUMP, JSON.stringify(context.__lifeDump));\n"
io.open(p,'w',encoding='utf8').write(s); print('ok')
