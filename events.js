// 항목(id)별 능력치 보정. data.js의 id와 연결됩니다. (보정값은 임의 값, 원작 근거 아님)
const MODS = {
    races: {
        human: { fx: { bond: 2 } }, beastman: { bias: { str: 1.5, agi: 1.5 }, fx: { hp: 6 } },
        pallum: { bias: { dex: 2, agi: 1.3 }, fx: {} }, dwarf: { bias: { str: 2, vit: 2 }, fx: { hp: 8 } },
        elf: { rate: 4, bias: { mag: 3 }, fx: { power: 3 } },
        half_elf: { bias: { mag: 1.5 }, fx: { power: 2, bond: 1 } },
        amazon: { bias: { str: 2, agi: 1.5 }, fx: { power: 5 } },
        renard: { bias: { mag: 2 }, fx: { bond: 3 } }, xenos: { fx: { power: 6, flags: ['xenos'] } }
    },
    origins: {
        orario: { fx: { valis: 600, bond: 2 } }, rakia: { fx: { power: 3, hp: 3 } }, melen: { fx: { valis: 400 } },
        far_east: { fx: { power: 2 } }, telskyura: { fx: { power: 6, hp: -5 } },
        elven_forest: { fx: { power: 3, bond: -2 } }, unknown: { fx: { power: 5 } }
    },
    talents: {
        none: { fx: {} }, dev_ability_hunter: { bias: { dex: 1.5 }, fx: { power: 5 } },
        dev_ability_craft: { bias: { dex: 2 }, fx: { valis: 600, flags: ['crafter'] } },
        basic_magic: { bias: { mag: 3 }, fx: { power: 8 } }, curse: { bias: { mag: 2 }, fx: { power: 7, hp: -5 } },
        chantless: { bias: { mag: 3 }, fx: { power: 12 } }, rare_skill: { fx: { power: 16 } },
        liaris: { fx: { power: 20, flags: ['liaris'] } }
    },
    familias: {
        ares: { adv: true, fx: { power: 4, hp: 4} }, ganesha: { adv: true, fx: { power: 3, bond: 3} },
        hephaestus: { adv: true, fx: { valis: 800} }, loki: { adv: true, fx: { power: 12} },
        freya: { adv: true, fx: { power: 12} }, kali: { adv: true, fx: { power: 8, hp: -5} },
        hermes: { adv: true, fx: { power: 3, valis: 400} }, hostess: { fx: { bond: 6, valis: 300 } },
        guild: { fx: { valis: 600, bond: 2 } }, astraea: { adv: true, fx: { bond: 8, power: 2} },
        hestia: { adv: true, fx: { power: 6, bond: 8} },
        demeter: { fx: { valis: 800, bond: 3 } }, miach: { fx: { valis: 400, bond: 4 } },
        takemikazuchi: { adv: true, falna: [5, 10], fx: { power: 6, bond: 3} }, soma: { adv: true, fx: { power: 3} }
    }
};

const DEFAULT_FALNA = [12, 18];
const MAX_LEVEL = 12;
const FAMILIA_BIAS = { rakia: { ares: 4 }, telskyura: { kali: 6 } };

const EVENTS = [
    { id: 'market', w: 20, cond: { age: [6, 13] }, text: '시장 골목에서 모험자들의 무용담을 엿들었다.', choices: [
        { label: '끝까지 귀 기울인다', text: '가슴 속에 모험에 대한 동경이 자리 잡았다.', fx: { flags: ['dreamer'], bond: 1 } },
        { label: '심부름 일을 거든다', text: '푼돈을 벌고 상인들과 안면을 텄다.', fx: { valis: 300, bond: 2 } }] },
    { id: 'sick', w: 10, cond: { age: [3, 90] }, text: '지독한 감기가 퍼졌다.', choices: [
        { label: '약을 사 먹는다', text: '돈은 들었지만 금방 나았다.', fx: { valis: -400 } },
        { label: '그냥 버틴다', chance: { p: .7, stat: 'hp', per: .003, ok: { text: '며칠 앓고 털고 일어났다.', fx: { hp: -5 } }, fail: { text: '병이 깊어졌다.', fx: { hp: -25 } } } }] },
    { id: 'join', w: 100, once: true, cond: { age: [12, 22], hasFamilia: false, notRace: ['human', 'pallum'] }, text: '스스로 파밀리아를 찾아 나설 때가 되었다. 마법과 신체 재능이 있는 종족은 신들이 먼저 눈여겨본다.', choices: [
        { label: '파밀리아의 문을 두드리고 다닌다', text: '몇 번 퇴짜를 맞은 끝에 받아 줄 신을 만났다.', fx: { familia: 'roll' } },
        { label: '길드 주변에서 서포터 일을 구한다', text: '짐꾼 일로 하루하루를 벌기 시작했다.', fx: { flags: ['supporter'], valis: 600 } }] },
    { id: 'latejoin', w: 12, once: true, cond: { age: [20, 35], hasFamilia: false, flags: ['supporter'] }, text: '오랜 서포터 생활 끝에 받아 주겠다는 신이 나타났다.', choices: [
        { label: '손을 잡는다', text: '늦었지만 새 출발을 했다.', fx: { familia: 'roll' } },
        { label: '지금의 삶이 낫다고 거절한다', text: '안정된 일상을 택했다.', fx: { bond: 3 } }] },
    { id: 'dive1', w: 60, once: true, cond: { age: [15, 40], job: ['adventurer'] }, text: '처음으로 던전 상층에 내려갔다.', choices: [
        { label: '1층만 신중하게 돈다', text: '고블린 몇 마리를 잡고 무사히 돌아왔다.', fx: { power: 6, valis: 400 } },
        { label: '욕심내서 더 깊이 내려간다', chance: { p: .55, stat: 'power', per: .004, ok: { text: '큰 수확을 안고 살아 돌아왔다.', fx: { power: 14, valis: 1200, feat: 1 } }, fail: { text: '몬스터 무리에 둘러싸여 간신히 도망쳤다.', fx: { hp: -60 } } } }] },
    { id: 'routine', w: 25, cond: { age: [16, 50], job: ['adventurer'] }, text: '평소처럼 던전에 들어갈 채비를 했다.', choices: [
        { label: '안전한 구간만 돈다', text: '소득은 적지만 무리 없는 하루였다.', fx: { power: 2, valis: 300 } },
        { label: '한 계층 더 내려간다', chance: { p: .6, stat: 'power', per: .004, ok: { text: '성과가 좋았다.', fx: { power: 5, valis: 900 } }, fail: { text: '부상을 입고 돌아왔다.', fx: { hp: -20, valis: -200 } } } }] },
    { id: 'tavern', w: 12, cond: { age: [16, 70] }, text: '저녁에 술집 ‘풍요의 여주인’ 앞을 지나게 되었다.', choices: [
        { label: '들어가 한잔한다', text: '사람들과 어울리며 즐거운 밤을 보냈다.', fx: { valis: -300, bond: 4 } },
        { label: '일손을 거들고 품삯을 받는다', text: '바쁘게 일하고 약간의 돈을 벌었다.', fx: { valis: 400 } }] },
    { id: 'love', w: 14, cond: { age: [16, 45], noFlags: ['partner'] }, text: '마음이 가는 사람이 생겼다.', choices: [
        { label: '용기 내어 마음을 전한다', chance: { p: .4, stat: 'bond', per: .01, ok: { text: '마음이 닿아 함께하게 되었다.', fx: { flags: ['partner'], bond: 10 } }, fail: { text: '거절당했지만 시간이 약이었다.', fx: { bond: -2 } } } },
        { label: '지켜보기만 한다', text: '아무 일도 일어나지 않았다.', fx: {} }] },
    { id: 'conscript', w: 80, once: true, cond: { age: [17, 28], origin: ['rakia'] }, text: '라키아에서 징집 명령이 내려왔다.', choices: [
        { label: '징집에 응한다', text: '전쟁터에서 거칠게 단련되었다.', fx: { power: 8, hp: -5, flags: ['soldier'] } },
        { label: '오라리오로 도망친다', chance: { p: .5, ok: { text: '국경을 넘어 새 삶을 시작했다.', fx: { valis: -400, bond: -3 } }, fail: { text: '추격대에 붙잡혀 크게 다쳤다.', fx: { hp: -25 } } } }] },
    { id: 'minotaur', w: 14, once: true, cond: { age: [16, 40], job: ['adventurer'], max: { power: 35 } }, text: '상층에서 있을 리 없는 미노타우로스와 마주쳤다.', choices: [
        { label: '전력으로 도망친다', chance: { p: .5, stat: 'power', per: .004, ok: { text: '살아 돌아왔지만 공포가 오래 남았다.', fx: { hp: -15, bond: -1 } }, fail: { text: '따라잡혀 중상을 입었다.', fx: { hp: -55 } } } },
        { label: '맞서 싸운다', chance: { p: .15, stat: 'power', per: .006, ok: { text: '기적처럼 살아남아 이름이 알려졌다.', fx: { power: 25, bond: 4, feat: 2 } }, fail: { text: '압도적인 힘 앞에 쓰러졌다.', fx: { hp: -65 } } } }] },
    { id: 'expedition', w: 25, once: true, cond: { age: [25, 55], job: ['adventurer'], min: { power: 55 } }, text: '심층 원정대를 꾸린다는 소식이 돌았다.', choices: [
        { label: '참가한다', chance: { p: .5, stat: 'power', per: .003, ok: { text: '원정은 성공했고 전설로 회자되었다.', fx: { power: 25, valis: 5000, flags: ['veteran'], feat: 2 } }, fail: { text: '원정 도중 돌아오지 못했다.', fx: { die: true } } } },
        { label: '지상에 남는다', text: '대신 후방 일을 도우며 안정적으로 지냈다.', fx: { valis: 800 } }] },
    { id: 'ritual', w: 90, once: true, cond: { age: [14, 22], origin: ['telskyura'] }, text: '텔스큐라의 의식에 휘말려 싸움에 나서야 한다.', choices: [
        { label: '정면으로 싸운다', chance: { p: .5, stat: 'power', per: .005, ok: { text: '살아남아 전사로 인정받았다.', fx: { power: 15, flags: ['warrior'], feat: 1 } }, fail: { text: '싸움에서 목숨을 잃었다.', fx: { die: true } } } },
        { label: '몰래 빠져나간다', chance: { p: .4, ok: { text: '무사히 도망쳤지만 고향을 잃었다.', fx: { bond: -3 } }, fail: { text: '붙잡혀 크게 다쳤다.', fx: { hp: -40 } } } }] },
    { id: 'xenos', w: 6, once: true, cond: { age: [20, 50], job: ['adventurer'] }, text: '미궁 깊은 곳에서 이성을 가진 몬스터와 마주쳤다.', choices: [
        { label: '대화를 시도한다', text: '인간과 몬스터 사이의 비밀스러운 유대가 생겼다.', fx: { flags: ['xenos_friend'], bond: 10 } },
        { label: '길드에 보고한다', text: '포상금을 받았지만 마음 한구석이 불편했다.', fx: { valis: 1600, bond: -4 } }] },
    { id: 'retire', w: 30, once: true, cond: { age: [45, 70] }, text: '몸이 예전 같지 않다. 앞으로를 생각할 때가 왔다.', choices: [
        { label: '후배를 가르친다', text: '후배들이 따르는 사람이 되었다.', fx: { bond: 8, job: 'retired' } },
        { label: '메렌으로 이주해 낚시로 지낸다', text: '그물을 손질하며 평온한 나날을 보냈다.', fx: { hp: 12, flags: ['fisher'], job: 'retired' } }] },
    { id: 'join_hard', w: 100, once: true, cond: { age: [12, 22], hasFamilia: false, race: ['human', 'pallum'] }, text: '팔나를 받으려 파밀리아를 찾아다니지만, 특별한 재능이 없어 보이면 문전박대를 당하기 쉽다.', choices: [
        { label: '끈질기게 문을 두드린다', chance: { p: .55, stat: 'power', per: .01, ok: { text: '끝내 받아 주는 신을 만났다.', fx: { familia: 'roll' } }, fail: { text: '모두 거절당해 서포터 일부터 시작했다.', fx: { flags: ['supporter'], valis: 400 } } } },
        { label: '길드 주변에서 서포터 일을 구한다', text: '짐꾼 일로 하루하루를 벌기 시작했다.', fx: { flags: ['supporter'], valis: 600 } }] },
    { id: 'supporter_scorn', w: 15, cond: { age: [16, 60], job: ['supporter'] }, text: '전리품 몫을 두고 모험자에게 업신여김을 당했다.', choices: [
        { label: '참고 넘긴다', text: '다툼은 피했지만 마음이 무거웠다.', fx: { bond: -1, valis: 100 } },
        { label: '정당한 몫을 요구한다', chance: { p: .5, stat: 'bond', per: .005, ok: { text: '떳떳한 태도에 상대가 물러섰다.', fx: { valis: 500, bond: 2 } }, fail: { text: '주먹이 돌아왔다.', fx: { hp: -15, valis: -100 } } } }] },
    { id: 'wargame', w: 8, cond: { age: [20, 55], job: ['adventurer'] }, text: '파밀리아 간의 전쟁유희가 열려 우리 파밀리아도 참가하게 되었다.', choices: [
        { label: '전선에 선다', chance: { p: .55, stat: 'power', per: .003, ok: { text: '맹활약해 승리에 크게 기여했다.', fx: { power: 12, valis: 1000, bond: 4, feat: 1 } }, fail: { text: '격전 끝에 크게 다쳤다.', fx: { hp: -50 } } } },
        { label: '후방에서 지원한다', text: '무리하지 않고 몫을 챙겼다.', fx: { valis: 300, bond: 2 } }] },
    { id: 'clash', w: 10, cond: { age: [8, 70], origin: ['orario'] }, text: '시가지 한복판에서 파밀리아 간의 항쟁이 터졌다.', choices: [
        { label: '곧장 대피한다', chance: { p: .8, ok: { text: '다치지 않고 피했다.', fx: {} }, fail: { text: '파편에 맞아 다쳤다.', fx: { hp: -20 } } } },
        { label: '구경하러 다가간다', chance: { p: .4, ok: { text: '소문 하나를 얻고 돌아왔다.', fx: { bond: 1 } }, fail: { text: '싸움에 휘말려 다쳤다.', fx: { hp: -25 } } } }] },
    { id: 'festival', w: 12, cond: { age: [5, 70], origin: ['orario'] }, text: '도시 전체가 들뜨는 모험자 축제, 몬스터 필리아가 열렸다.', choices: [
        { label: '마음껏 즐긴다', text: '사람들과 어울리며 잊지 못할 하루를 보냈다.', fx: { valis: -200, bond: 4 } },
        { label: '노점을 연다', text: '대목을 맞아 짭짤하게 벌었다.', fx: { valis: 400 } }] },
    { id: 'sea', w: 15, cond: { age: [12, 60], origin: ['melen'] }, text: '배를 타고 나갔다가 던전에서 흘러나온 몬스터와 마주쳤다.', choices: [
        { label: '서둘러 항구로 돌아간다', chance: { p: .65, stat: 'hp', per: .003, ok: { text: '무사히 돌아와 어획물을 팔았다.', fx: { valis: 200 } }, fail: { text: '배가 부서지고 다쳤다.', fx: { hp: -25, valis: -300 } } } },
        { label: '모험자에게 도움을 청한다', text: '사례금을 치렀지만 안전하게 돌아왔다.', fx: { valis: -300, bond: 1 } }] },
    { id: 'elf_touch', w: 10, cond: { age: [10, 80], race: ['elf'] }, text: '낯선 이가 허락 없이 몸에 손을 댔다.', choices: [
        { label: '참고 넘긴다', text: '불쾌함을 삼켰다.', fx: { bond: -1 } },
        { label: '단호히 밀쳐 낸다', text: '엘프다운 단호함으로 선을 그었다.', fx: { bond: -2, power: 1 } }] },
    { id: 'pallum_scorn', w: 10, cond: { age: [10, 45], race: ['pallum'] }, text: '작은 체구 때문에 사람들에게 무시를 당했다.', choices: [
        { label: '머리를 써서 되받는다', chance: { p: .5, stat: 'bond', per: .005, ok: { text: '기지로 상대를 놀라게 했다.', fx: { bond: 3, valis: 400 } }, fail: { text: '오히려 비웃음만 샀다.', fx: { bond: -2 } } } },
        { label: '묵묵히 실력을 쌓는다', text: '조용히 자신만의 기술을 갈고닦았다.', fx: { power: 3 } }] },
    { id: 'amazon_duel', w: 10, cond: { age: [15, 45], race: ['amazon'], noFlags: ['partner'] }, text: '마음에 든 상대에게 승부를 청할 기회가 왔다.', choices: [
        { label: '정면 승부를 건다', chance: { p: .5, stat: 'power', per: .003, ok: { text: '승부 끝에 서로를 인정하게 되었다.', fx: { flags: ['partner'], bond: 10 } }, fail: { text: '완패했지만 다음을 기약했다.', fx: { hp: -10, power: 3 } } } },
        { label: '그냥 지나친다', text: '아무 일도 일어나지 않았다.', fx: {} }] },
    { id: 'neglect', w: 25, once: true, cond: { age: [16, 50], familia: ['soma'] }, text: '주신이 단원들을 방임하는 탓에 파밀리아가 점점 어수선해졌다.', choices: [
        { label: '기강을 바로잡으려 나선다', chance: { p: .5, stat: 'bond', per: .01, ok: { text: '뜻을 같이하는 단원들이 모여들었다.', fx: { bond: 6, power: 3 } }, fail: { text: '반발을 사 몸싸움이 벌어졌다.', fx: { hp: -15, bond: -4 } } } },
        { label: '모른 척한다', text: '분란에 휘말리지 않으려 몸을 사렸다.', fx: { bond: -2 } }] },
    { id: 'god_gone', w: 3, once: true, cond: { age: [20, 60], job: ['adventurer'] }, text: '주신이 규칙을 어겨 천계로 송환되었고, 새겨진 팔나가 봉인되었다.', choices: [
        { label: '새 주신을 찾아 나선다', chance: { p: .6, stat: 'bond', per: .004, ok: { text: '받아 주는 신을 만나 힘을 되찾았다.', fx: { familia: 'roll' } }, fail: { text: '받아 줄 신을 찾지 못해 평범한 사람으로 돌아갔다.', fx: { dropFamilia: true, clearFlags: ['adventurer', 'falna'], bond: -3 } } } },
        { label: '모험을 접고 일상으로 돌아간다', text: '힘을 잃은 채 평범한 생활을 택했다.', fx: { dropFamilia: true, clearFlags: ['adventurer', 'falna'], hp: 5 } }] },
    { id: 'purple_moth', w: 15, once: true, cond: { age: [15, 50], job: ['adventurer'] }, text: '상층에서 독가루를 뿌리는 퍼플 모스와 마주쳤다.', choices: [
        { label: '해독약을 쓰고 물러난다', text: '비용은 들었지만 안전하게 빠져나왔다.', fx: { valis: -1000 } },
        { label: '독을 무릅쓰고 맞선다', chance: { p: .55, stat: 'hp', per: .003, ok: { text: '독을 이겨 내며 몸이 독에 익숙해졌다.', fx: { power: 4, flags: ['resist'] } }, fail: { text: '독이 번져 앓아누웠다.', fx: { hp: -30, valis: -500 } } } }] },
    { id: 'theology', w: 8, once: true, cond: { age: [16, 40], noFlags: ['scholar'] }, text: '학구에서 신성문자를 가르치는 종합신학 강의를 들어 볼 기회가 생겼다. 합격하는 사람은 열에 하나도 되지 않는다.', choices: [
        { label: '도전한다', chance: { p: .1, stat: 'bond', per: .002, ok: { text: '높은 벽을 넘어 합격했고 신성문자를 읽을 수 있게 되었다.', fx: { flags: ['scholar'], bond: 3, valis: 2000 } }, fail: { text: '시험의 벽은 높았다.', fx: { valis: -600 } } } },
        { label: '다른 길을 택한다', text: '배움 대신 현장에서 경험을 쌓기로 했다.', fx: { power: 2 } }] },
    { id: 'hieroglyph_unlock', w: 15, once: true, cond: { age: [18, 45], flags: ['falna'] }, text: '어둠의 상인으로부터 신의 피(이코르)로 만든 금지된 해정약을 몰래 사지 않겠냐는 제안을 받았다.', choices: [
        { label: '비싼 돈을 주고 구매해 사용한다', chance: { p: .5, stat: 'valis', per: .0001, ok: { text: '숨겨져 있던 스테이터스가 해제되며 새로운 힘을 깨달았다.', fx: { valis: -1000, power: 8, flags: ['unlocked_stats'] } }, fail: { text: '길드에 발각되어 막대한 벌금을 물었다.', fx: { valis: -1500, bond: -2 } } } },
        { label: '위험한 거래를 거절한다', text: '유혹을 뿌리치고 정공법으로 수련에 매진했다.', fx: { power: 2 } }] },
    { id: 'gods_whim', w: 12, cond: { age: [15, 55], flags: ['falna'] }, text: '천계의 지루함을 참지 못하고 내려온 어느 신의 변덕스러운 유희에 휘말렸다.', choices: [
        { label: '신의 장단에 맞춰 준다', chance: { p: .6, ok: { text: '신을 즐겁게 해준 대가로 후한 보상을 받았다.', fx: { valis: 800, bond: 3 } }, fail: { text: '장난이 너무 지나쳐 크게 다쳤다.', fx: { hp: -25 } } } },
        { label: '재빨리 도망친다', text: '신들의 장난을 피했지만 눈밖에 났다.', fx: { bond: -3 } }] },
    { id: 'high_excelia', w: 20, cond: { age: [18, 50], job: ['adventurer'], flags: ['falna'] }, text: '던전 탐색 중 자신의 한계를 아득히 뛰어넘는 몬스터와 마주쳤다. 랭크 업을 위한 상위 엑세리아(위업)를 쌓을 절호의, 그리고 치명적인 기회다.', choices: [
        { label: '죽음을 각오하고 홀로 맞선다', chance: { p: .15, stat: 'power', per: .005, ok: { text: '불가능을 가능으로 바꾸며 엄청난 위업을 달성했다!', fx: { power: 25, hp: -30, feat: 3 } }, fail: { text: '압도적인 힘에 유린당해 치명상을 입었다.', fx: { hp: -60 } } } },
        { label: '파티원들과 협력해 싸운다', chance: { p: .6, stat: 'bond', per: .01, ok: { text: '모두의 힘을 합쳐 쓰러트리고 경험을 나누었다.', fx: { power: 10, bond: 5 } }, fail: { text: '전멸의 위기를 간신히 넘기고 후퇴했다.', fx: { hp: -35 } } } }] },
    { id: 'curse_awaken', w: 8, once: true, cond: { age: [15, 60], flags: ['falna'], max: { bond: 5 } }, text: '극한의 스트레스와 세상에 대한 원망이 마법 슬롯에 끔찍한 주술적 힘인 커스(저주)로 발현되려 한다.', choices: [
        { label: '저주의 힘을 받아들인다', text: '강력한 힘을 얻었지만, 영혼의 일부가 깎여나갔다.', fx: { power: 15, hp: -10, bond: -5, flags: ['cursed'] } },
        { label: '정신력으로 억누른다', text: '끔찍한 힘을 억제하는 데 성공했지만 깊은 피로가 남았다.', fx: { hp: -5 } }] },
    { id: 'blacksmith_forge', w: 18, cond: { age: [15, 60], job: ['blacksmith'], flags: ['falna'] }, text: '단야 어빌리티를 살려 직접 무기를 벼려냈다.', choices: [
        { label: '명검을 만들기 위해 심혈을 기울인다', chance: { p: 0.35, stat: 'dex', per: 0.005, ok: { text: '최고급 무기를 완성하여 큰돈을 벌었다.', fx: { valis: 3000, power: 5 } }, fail: { text: '강도 조절에 실패해 재료와 시간만 날렸다.', fx: { valis: -500, hp: -5 } } } },
        { label: '일반 무기를 대량 생산한다', text: '안전하고 꾸준하게 수입을 올렸다.', fx: { valis: 800, power: 1 } }] },
    { id: 'have_child', w: 25, once: true, cond: { age: [20, 45], flags: ['partner'] }, text: '사랑하는 연인과 가족을 이루고, 작고 소중한 생명이 태어났다.', choices: [
        { label: '은퇴하고 아이에게 전념한다', text: '위험한 일을 내려놓고 부모로서의 삶을 시작했다.', fx: { dropFamilia: true, clearFlags: ['adventurer'], bond: 15, hp: 5 } },
        { label: '모험을 계속하며 아이를 키운다', text: '육아와 일을 병행하느라 고단하지만 큰 행복을 느낀다.', fx: { hp: -10, bond: 8, power: 2 } }] },
    { id: 'hero_sacrifice', w: 3, once: true, cond: { age: [20, 60], min: { level: 6 } }, text: '오라리오에 흑룡이 습격해왔다. 도시의 존망이 걸린 절망적인 전투가 시작된다.', choices: [
        { label: '선두에 서서 흑룡에게 돌격한다', chance: { p: 0.05, stat: 'power', per: 0.001, ok: { text: '기적적인 일격으로 흑룡을 물리치고 전설이 되었다.', fx: { milestone: 'hero', flags: ['hero'] } }, fail: { text: '흑룡의 브레스에 흔적도 없이 사라졌다.', fx: { die: true } } } },
        { label: '후방 벙커로 피난한다', text: '영웅들의 희생으로 도시는 구원받았으나 평생 죄책감을 안고 살게 되었다.', fx: { bond: -10, hp: -5 } }] },
    { id: 'guild_advisor', w: 20, cond: { age: [14, 20], job: ['adventurer'], max: { level: 1 } }, text: '길드 본부에 방문하여 어드바이저에게 던전 탐색 가이드라인을 제공받았다.', choices: [
        { label: '안전한 상층(1~12계층) 공략법을 따른다', text: '어드바이저의 조언에 따라 무리하지 않고 저급 몬스터를 사냥하여 마석을 모았다.', fx: { valis: 500, hp: 10 } },
        { label: '조언을 무시하고 중층(13~24계층)으로 직행한다', chance: { p: 0.2, stat: 'dex', per: 0.01, ok: { text: '퍼스트 라인이라 불리는 중층에서 간신히 살아남아 큰 경험을 얻었다.', fx: { feat: 1, power: 15 } }, fail: { text: '13계층에서 헬 하운드의 화염에 큰 화상을 입고 도망쳤다.', fx: { hp: -30, valis: -200 } } } } ] },
    
    // --- 아이템 도입: fx.getItem 사용 및 valis 밸런스 조정 ---
    { id: 'buy_pyonkichi', w: 15, once: true, cond: { job: ['adventurer'], min: { valis: 10000 } }, text: '상점을 둘러보던 중 메탈 래빗의 모피로 만들어진 깡총이 Mk-2 경갑을 발견했다.', choices: [
        { label: '9,900발리스를 지불하고 장비한다', text: '자신을 위해 만들어진 것처럼 몸에 딱 맞아 던전에서의 생존력이 크게 상승했다.', fx: { valis: -9900, getItem: 'pyonkichi' } },
        { label: '이름이 우스꽝스러워 구매를 포기한다', text: '성능보다는 겉멋을 중시하여 기존의 낡은 장비를 유지하기로 했다.', fx: { valis: 0 } } ] },
    { id: 'magic_sword_crozzo', w: 10, once: true, cond: { job: ['adventurer'], min: { valis: 15000 } }, text: '무영창으로 마법 발동이 가능한 강력한 소모품, 크로조의 마검을 구매할 기회가 생겼다.', choices: [
        { label: '거금을 들여 마검을 하나 장만한다', text: '비싼 가격을 지불했지만, 심층 원정이나 위기 상황을 타개할 강력한 결전 병기를 얻었다.', fx: { valis: -15000, getItem: 'magic_sword' } },
        { label: '비싼 소모품이라 포기한다', text: '마검에 의존하지 않고 자신의 순수한 전투력만으로 미궁에 도전하기로 했다.', fx: { valis: 0 } } ] },
    { id: 'encounter_goliath', w: 12, once: true, cond: { job: ['adventurer'], min: { level: 2 } }, text: '17계층 통곡의 대벽에서 신장 7m의 계층 터주(몬스터 렉스) 골라이아스와 조우했다.', choices: [
        { label: '파티원들과 연계하여 전면전에 나선다', chance: { p: 0.4, stat: 'power', per: 0.005, ok: { text: '사투 끝에 골라이아스를 토벌하고 18계층 리빌라 마을로 무사히 진입했다.', fx: { valis: 20000, feat: 3 } }, fail: { text: '계층 터주의 압도적인 파괴력에 짓눌려 뼈가 부러지는 중상을 입었다.', fx: { hp: -50 } } } },
        { label: '패스 퍼레이드를 일으켜 다른 파티에 몬스터 떠넘긴다', text: '비겁한 수단으로 목숨은 건졌으나 오라리오 내에서 모험자로서의 평판이 하락했다.', fx: { hp: -10, feat: -2 } } ] },
    { id: 'buy_elemental_cloth', w: 15, cond: { age: [15, 50], job: ['adventurer'], min: { level: 2, valis: 8000 } }, text: '중층과 하층의 가혹한 환경을 버티기 위해 정령의 가호가 깃든 방호포를 구매할 기회가 생겼다.', choices: [
        { label: '살라만다 울 구매 (화염 내성)', text: '헬 하운드의 화염과 중층의 열기를 견딜 수 있는 살라만다 울을 장비했다.', fx: { valis: -8000, getItem: 'salamander_wool' } },
        { label: '운디네 클로스 구매 (수속성 내성)', text: '물의 미로도시(25~27계층) 공략에 필수적인 운디네 클로스를 장비했다.', fx: { valis: -8000, getItem: 'undine_cloth' } },
        { label: '장비를 믿고 구매하지 않는다', chance: { p: 0.7, stat: 'dex', per: 0.005, ok: { text: '뛰어난 회피 능력으로 속성 공격을 피해 냈다.', fx: { power: 3 } }, fail: { text: '화염과 극도의 추위에 노출되어 심각한 피해를 입었다.', fx: { hp: -35 } } } } ] },
    { id: 'craft_drop_weapon', w: 12, cond: { job: ['adventurer'], min: { level: 2, feat: 2 } }, text: '강력한 몬스터를 쓰러뜨리고 얻은 희귀 드롭 아이템을 헤파이스토스 파밀리아의 대장장이에게 가져갔다.', choices: [
        { label: '전용 특수 무장 제작을 의뢰한다', chance: { p: 0.8, stat: 'dex', per: 0.002, ok: { text: '뛰어난 위력을 지닌 자신만의 전용 무기가 완성되었다.', fx: { valis: -5000, getItem: 'custom_weapon' } }, fail: { text: '대장장이의 실수로 재료가 파손되어 평범한 무기만 받았다.', fx: { valis: -2000, power: 5 } } } },
        { label: '비싼 값에 길드나 상인에게 매각한다', text: '무기 대신 막대한 자금을 확보하여 앞으로의 원정 자금을 마련했다.', fx: { valis: 40000 } } ] },
    { id: 'buy_dual_potion', w: 20, cond: { job: ['adventurer'], min: { valis: 2000 } }, text: '미아흐 파밀리아의 『푸른 약포』에서 체력과 마인드를 동시에 회복시키는 신약 듀얼 포션을 판매하고 있다.', choices: [
        { label: '비상용으로 듀얼 포션을 대량 구매한다', text: '위험한 던전 탐색 중 큰 위기를 넘길 수 있는 생명줄을 확보했다.', fx: { valis: -2000, getItem: 'dual_potion' } },
        { label: '일반 포션으로 만족한다', text: '비용을 아꼈으나, 전투 지속력에는 한계가 남았다.', fx: { valis: 0 } } ] },
    { id: 'find_grimoire', w: 3, once: true, cond: { age: [15, 60], job: ['adventurer'], min: { level: 3 } }, text: '던전 탐색 중 혹은 우연한 기회로, 읽는 것만으로 마법을 각성시켜 준다는 초희귀 마도서 『그리므와르』를 손에 넣었다.', choices: [
        { label: '마도서를 직접 읽어 마법을 각성한다', text: '책은 재가 되어 사라졌지만, 강력한 마법을 깨우쳐 압도적인 힘을 얻었다.', fx: { feat: 5, flags: ['magic_user'], getItem: 'grimoire' } },
        { label: '경매에 올려 막대한 부를 얻는다', text: '최상위 파밀리아에게 1억 발리스가 넘는 가격에 매각하여 평생 쓸 돈을 벌었다.', fx: { valis: 1000000 } } ] },
    { id: 'daedalus_orb', w: 5, once: true, cond: { job: ['adventurer'], min: { level: 3 } }, text: '어둠의 파벌(이블스)의 잔당을 토벌하던 중, 붉은 눈알에 D가 새겨진 기괴한 아이템 『다이달로스의 눈』을 주웠다.', choices: [
        { label: '인조 미궁 크노소스 탐색에 뛰어든다', chance: { p: 0.3, stat: 'power', per: 0.005, ok: { text: '미궁의 함정을 돌파하고 엄청난 밀수품과 마석을 탈취했다.', fx: { valis: 50000, feat: 4 } }, fail: { text: '독 포자를 뿜는 몬스터와 폭발 트랩에 휘말려 사경을 헤맸다.', fx: { hp: -60, valis: -10000 } } } },
        { label: '위험한 물건이라 판단해 길드에 넘긴다', text: '길드로부터 포상금을 받고 불필요한 위험을 피했다.', fx: { valis: 15000, feat: 1 } } ] },

    // 직업 선택: 파밀리아와 별개로 생업을 선택한다.
    { id: 'career_choice', w: 90, once: true, cond: { age: [13, 19], job: ['child'] }, text: '어느덧 스스로 생계를 꾸릴 나이가 되었다. 지금까지의 경험과 인연을 바탕으로 앞으로의 길을 정해야 한다.', choices: [
        { label: '길드의 견습 직원이 된다', text: '모험자 등록과 의뢰 접수를 배우며 도시의 행정과 던전 정보를 익혔다.', fx: { job: 'guild_staff', valis: 500, bond: 2 } },
        { label: '상점에서 장사를 배운다', text: '물건의 값과 사람들의 마음을 읽는 법을 익히며 상인의 길에 들어섰다.', fx: { job: 'merchant', valis: 900 } },
        { label: '농장 일을 돕는다', text: '계절에 맞춰 씨를 뿌리고 거두는 삶을 시작했다.', fx: { job: 'farmer', hp: 5, valis: 400 } },
        { label: '치유사의 조수가 된다', text: '약초와 치료 도구를 다루며 다친 이들을 돌보는 일을 배웠다.', fx: { job: 'healer', bond: 3, valis: 300 } },
        { label: '대장간에서 기술을 배운다', text: '쇠를 두드리고 무기를 수리하는 법을 익혀 장인의 길에 들어섰다.', fx: { job: 'blacksmith', valis: 500 } },
        { label: '모험자 파밀리아에 들어간다', text: '팔나를 받고 던전에 도전할 기회를 얻었다.', fx: { familia: 'roll' } },
        { label: '서포터로 일한다', text: '모험자들의 짐을 나르고 전리품을 정리하는 일을 시작했다.', fx: { job: 'supporter', valis: 600 } }
    ] },
    { id: 'guild_counter', w: 22, cool: 4, maxTimes: 3, cond: { age: [18, 70], job: ['guild_staff'] }, text: '길드 창구에는 의뢰를 접수하려는 모험자와 항의하러 온 시민이 뒤섞여 긴 줄을 만들었다.', choices: [
        { label: '초보 모험자의 의뢰서를 꼼꼼히 확인한다', text: '실수를 미리 찾아내 큰 사고를 막았다. 감사 인사가 작은 보람으로 남았다.', fx: { bond: 3, valis: 350 } },
        { label: '마석 감정 업무를 맡는다', text: '시세를 정확히 맞혀 길드의 신뢰를 얻었다.', fx: { valis: 700, power: 1 } }
    ] },
    { id: 'merchant_trade', w: 20, cool: 4, maxTimes: 3, cond: { age: [18, 75], job: ['merchant'] }, text: '거래처에서 희귀한 물자가 들어왔다는 소식이 왔다. 지금 움직이면 이익을 볼 수 있지만 손해를 볼 수도 있다.', choices: [
        { label: '신중하게 시세를 확인하고 거래한다', text: '큰 이익은 아니지만 안정적인 거래를 성사시켰다.', fx: { valis: 900, bond: 1 } },
        { label: '전 재산을 걸고 선점한다', chance: { p: 0.45, stat: 'valis', per: 0.00001, ok: { text: '물건이 불티나게 팔려 큰돈을 벌었다.', fx: { valis: 3500 } }, fail: { text: '수요를 잘못 읽어 재고를 떠안았다.', fx: { valis: -1800 } } } }
    ] },
    { id: 'farm_season', w: 20, cool: 4, maxTimes: 3, cond: { age: [18, 80], job: ['farmer'] }, text: '계절이 바뀌며 밭의 작황이 드러났다. 날씨와 병충해가 수확량을 좌우할 것이다.', choices: [
        { label: '이웃과 품을 나눠 피해를 줄인다', text: '수확은 평범했지만 이웃과의 유대가 깊어졌다.', fx: { bond: 3, valis: 500 } },
        { label: '새 농법을 시험한다', chance: { p: 0.55, stat: 'dex', per: 0.001, ok: { text: '시험한 농법이 효과를 거둬 풍작을 맞았다.', fx: { valis: 1400 } }, fail: { text: '작물이 상해 손실을 보았다.', fx: { valis: -500, hp: -5 } } } }
    ] },
    { id: 'healer_shift', w: 20, cool: 4, maxTimes: 3, cond: { age: [18, 80], job: ['healer'] }, text: '던전에서 돌아온 부상자들이 치료소에 몰려들었다. 제한된 약재로 누구부터 돌볼지 판단해야 한다.', choices: [
        { label: '중상자를 먼저 치료한다', text: '고된 하루였지만 한 사람의 생명을 지켜냈다.', fx: { hp: -3, bond: 5 } },
        { label: '약재를 아껴 여러 환자를 돌본다', text: '치료소 운영을 안정시키고 환자들의 신뢰를 얻었다.', fx: { bond: 3, valis: 300 } }
    ] },
    { id: 'retired_days', w: 18, cool: 5, maxTimes: 3, cond: { age: [45, 90], job: ['retired'] }, text: '위험한 현장을 떠난 뒤의 하루는 길고 조용하다. 이제 무엇에 시간을 쓸지 스스로 정할 수 있다.', choices: [
        { label: '후배와 가족을 돌본다', text: '쌓아 온 경험을 나누며 주변 사람들과 평온한 시간을 보냈다.', fx: { bond: 5, hp: 2 } },
        { label: '작은 일을 찾아 다시 사회에 보탠다', text: '무리하지 않는 일거리를 얻어 생활에 활기가 돌아왔다.', fx: { valis: 500, bond: 2 } }
    ] },
    { id: 'career_pivot', w: 12, once: true, cond: { age: [25, 65], noFlags: ['career_pivot_done'] }, text: '지금까지 해 온 일을 계속할지, 새로운 길을 찾아볼지 고민하게 되었다. 익숙한 삶을 바꾸는 데에는 용기가 필요하다.', choices: [
        { label: '현재 직업을 유지한다', text: '지금까지 쌓아 온 경험을 더 깊게 다지기로 했다.', fx: { flags: ['career_pivot_done'], bond: 2 } },
        { label: '안전한 생업으로 전환한다', text: '위험을 줄이고 꾸준히 살아갈 수 있는 일을 택했다.', fx: { job: 'merchant', flags: ['career_pivot_done'], valis: 500 } },
        { label: '은퇴하고 후배를 돕는다', text: '현역에서 물러나 경험을 전하는 삶을 시작했다.', fx: { job: 'retired', flags: ['career_pivot_done'], bond: 5 } }
    ] },
    { id: 'family_gathering', w: 18, cool: 3, maxTimes: 2, cond: { age: [18, 85] }, text: '오랜만에 가까운 이들이 한자리에 모였다. 각자 바쁜 삶을 살았지만 함께한 시간만큼은 변하지 않았다.', choices: [
        { label: '모임을 주최하고 비용을 부담한다', text: '사람들의 웃음소리가 집 안에 오래 머물렀다.', fx: { valis: -300, bond: 5 } },
        { label: '소박한 선물을 건넨다', text: '작은 정성이 관계를 다시 단단하게 만들었다.', fx: { valis: -100, bond: 3 } }
    ] },
    { id: 'city_disaster', w: 10, once: true, cond: { age: [10, 80] }, text: '도시 외곽에서 화재가 번져 주민들이 대피하기 시작했다. 불길은 바람을 타고 주거 구역으로 향하고 있었다.', choices: [
        { label: '이웃을 대피시키는 일을 돕는다', text: '연기 속에서 사람들을 이끌어냈고 감사 인사를 받았다.', fx: { hp: -8, bond: 5, feat: 1 } },
        { label: '안전한 곳으로 피신한다', text: '다치지는 않았지만 며칠 동안 도시의 피해 소식을 들어야 했다.', fx: { bond: -1 } }
    ] },
    { id: 'old_friend', w: 16, cool: 4, maxTimes: 2, cond: { age: [16, 85] }, text: '어린 시절 알고 지내던 친구와 우연히 재회했다. 서로 다른 길을 걸어온 시간이 대화 사이에 놓여 있었다.', choices: [
        { label: '지난 세월을 나누며 밤늦게까지 이야기한다', text: '잊고 있던 추억이 되살아나 마음이 한결 가벼워졌다.', fx: { bond: 5 } },
        { label: '함께 작은 일을 시작한다', text: '서로의 장점을 살려 소소한 수익을 얻었다.', fx: { bond: 2, valis: 600 } }
    ] },
    { id: 'mentor', w: 14, once: true, cond: { age: [25, 65], min: { bond: 5 } }, text: '당신의 성실함을 눈여겨본 연장자가 자신의 경험을 전해 주겠다고 제안했다.', choices: [
        { label: '제자로 들어가 배운다', text: '오랜 경험에서 나온 조언은 이후의 선택에 큰 도움이 되었다.', fx: { power: 5, bond: 4, feat: 1 } },
        { label: '독립적으로 해 보겠다고 답한다', text: '스스로 판단하고 책임지는 법을 배웠다.', fx: { bond: 2, valis: 300 } }
    ] },
    { id: 'supporter_route', w: 18, cool: 3, maxTimes: 2, cond: { age: [16, 60], job: ['supporter'] }, text: '이번 원정대는 짐이 많고 귀환 경로도 험하다. 서포터로서 준비와 판단이 중요해졌다.', choices: [
        { label: '운반량을 줄이고 귀환 경로를 확보한다', text: '원정대가 무사히 귀환해 당신의 판단을 인정했다.', fx: { bond: 3, valis: 700 } },
        { label: '추가 물자를 더 챙긴다', chance: { p: 0.55, stat: 'agi', per: 0.001, ok: { text: '예상치 못한 상황에 대비할 수 있었다.', fx: { valis: 900, bond: 1 } }, fail: { text: '무거운 짐 때문에 부상을 입었다.', fx: { hp: -12 } } } }
    ] },
    { id: 'blacksmith_order', w: 18, cool: 3, maxTimes: 2, cond: { age: [18, 75], job: ['blacksmith'] }, text: '단골 모험자가 중요한 원정을 앞두고 무기 점검을 맡겼다. 작은 결함도 목숨을 위협할 수 있다.', choices: [
        { label: '시간을 들여 정밀하게 수리한다', text: '무기의 균형을 바로잡아 단골의 신뢰를 얻었다.', fx: { valis: 800, bond: 3 } },
        { label: '빠르게 수리하고 다음 주문을 받는다', text: '많은 주문을 처리했지만 마감 품질은 아쉬웠다.', fx: { valis: 1100, bond: -1 } }
    ] },
    { id: 'waitstaff_shift', w: 18, cool: 3, maxTimes: 2, cond: { age: [18, 75], job: ['waitstaff'] }, text: '풍요의 여주인에 단체 손님이 몰려들었다. 바쁜 홀에서 손님들의 요구를 놓치지 않아야 한다.', choices: [
        { label: '동료와 호흡을 맞춰 주문을 처리한다', text: '손님들이 만족스럽게 식사를 마쳤고 팁도 넉넉했다.', fx: { valis: 700, bond: 3 } },
        { label: '문제가 생긴 테이블을 직접 맡는다', text: '언쟁을 가라앉히고 단골손님을 얻었다.', fx: { bond: 4 } }
    ] },
    { id: 'soldier_patrol', w: 18, cool: 3, maxTimes: 2, cond: { age: [18, 60], job: ['soldier'] }, text: '국경 경비 중 정체를 알 수 없는 무리가 접근했다. 먼저 움직이면 충돌을 막을 수도 있지만 위험을 감수해야 한다.', choices: [
        { label: '정찰을 보내 상황을 확인한다', text: '상대가 물러나 불필요한 충돌을 피했다.', fx: { bond: 2, power: 2 } },
        { label: '부대를 이끌고 길목을 지킨다', chance: { p: 0.6, stat: 'power', per: 0.002, ok: { text: '침착한 지휘로 경계를 마쳤다.', fx: { power: 4, feat: 1 } }, fail: { text: '작은 교전에서 부상을 입었다.', fx: { hp: -18 } } } }
    ] },
    { id: 'neighborhood_help', w: 18, cool: 3, maxTimes: 2, cond: { age: [7, 85] }, text: '이웃이 이사 준비로 곤란을 겪고 있었다. 하루 정도 시간을 내면 큰 도움이 될 것 같다.', choices: [
        { label: '짐을 나르는 일을 돕는다', text: '이웃과 가까워졌고 작은 답례도 받았다.', fx: { bond: 3, valis: 150 } },
        { label: '필요한 도구를 빌려준다', text: '도구를 빌려준 덕에 이사는 무사히 끝났다.', fx: { bond: 2 } }
    ] },
    { id: 'street_performance', w: 15, cool: 3, maxTimes: 2, cond: { age: [8, 75] }, text: '광장에서 악사와 이야기꾼들이 사람들을 모으고 있었다. 잠시 발걸음을 멈추자 하루의 피로가 가시는 듯했다.', choices: [
        { label: '공연을 감상하고 동전을 보탠다', text: '흥겨운 음악과 이야기에 마음이 한결 가벼워졌다.', fx: { valis: -100, bond: 2, hp: 2 } },
        { label: '공연 준비를 거들고 품삯을 받는다', text: '무대를 정리하고 소소한 보수를 받았다.', fx: { valis: 250 } }
    ] },
    { id: 'seasonal_fair', w: 16, cool: 4, maxTimes: 2, cond: { age: [6, 80] }, text: '계절 축제가 열려 거리마다 노점과 놀이판이 들어섰다. 사람들 사이에서 오랜만에 여유를 느낄 수 있었다.', choices: [
        { label: '친구들과 축제를 즐긴다', text: '웃고 떠드는 사이 잊지 못할 추억이 생겼다.', fx: { valis: -200, bond: 4 } },
        { label: '노점에서 하루 일한다', text: '손님이 많아 예상보다 많은 돈을 벌었다.', fx: { valis: 500 } }
    ] },
    { id: 'unexpected_rain', w: 14, cool: 3, maxTimes: 2, cond: { age: [5, 85] }, text: '갑작스러운 폭우가 도시를 덮쳤다. 배수로가 넘치기 전에 주변을 정리해야 했다.', choices: [
        { label: '배수로의 낙엽과 쓰레기를 치운다', text: '침수 피해를 줄이는 데 보탬이 되었다.', fx: { hp: -2, bond: 3 } },
        { label: '비가 그칠 때까지 안전한 곳에서 기다린다', text: '큰 피해 없이 비가 지나갔다.', fx: { hp: 1 } }
    ] },
    { id: 'lost_child', w: 12, once: true, cond: { age: [16, 80] }, text: '시장 한복판에서 길을 잃고 울고 있는 아이를 발견했다. 아이는 보호자의 이름조차 제대로 말하지 못했다.', choices: [
        { label: '길드에 도움을 요청해 보호자를 찾는다', text: '아이를 가족에게 돌려보냈고 길드 직원의 칭찬을 들었다.', fx: { bond: 5, feat: 1 } },
        { label: '주변 상인들과 함께 아이를 찾는다', text: '상인들의 협력으로 아이의 가족을 찾아냈다.', fx: { bond: 4 } }
    ] },
    { id: 'small_injury', w: 16, cool: 4, maxTimes: 2, cond: { age: [10, 80] }, text: '일을 하던 중 발을 헛디뎌 가벼운 부상을 입었다. 며칠은 무리하지 않는 편이 좋겠다.', choices: [
        { label: '치료를 받고 충분히 쉰다', text: '일정은 미뤄졌지만 상처가 깨끗하게 나았다.', fx: { valis: -150, hp: 5 } },
        { label: '붕대만 감고 일을 계속한다', text: '예정보다 빨리 복귀했지만 피로가 쌓였다.', fx: { hp: -4, valis: 200 } }
    ] },
    { id: 'book_discovery', w: 12, once: true, cond: { age: [12, 70] }, text: '오래된 서고에서 낡은 기록물을 발견했다. 해독할 수 있다면 과거의 생활상을 알 수 있을 것이다.', choices: [
        { label: '시간을 들여 읽고 정리한다', text: '오래된 기록에서 유용한 지식을 얻었다.', fx: { flags: ['scholar'], bond: 2, power: 2 } },
        { label: '필요한 부분만 필사해 판다', text: '기록의 일부를 정리해 학자에게 넘기고 보수를 받았다.', fx: { valis: 700 } }
    ] },
    { id: 'charity_work', w: 14, cool: 4, maxTimes: 2, cond: { age: [18, 85] }, text: '도시 빈민가에서 식량과 의약품을 나누는 자원봉사자를 모집하고 있었다.', choices: [
        { label: '하루 품을 내어 배급을 돕는다', text: '도움을 받은 이들의 감사가 오래 기억에 남았다.', fx: { bond: 4, hp: -2 } },
        { label: '물자 구입에 돈을 보탠다', text: '작은 기부가 여러 사람의 끼니가 되었다.', fx: { valis: -300, bond: 3 } }
    ] },
    { id: 'travel_offer', w: 12, once: true, cond: { age: [20, 65] }, text: '먼 도시를 오가는 상단이 동행자를 구하고 있었다. 낯선 곳을 경험할 기회지만 집을 오래 비워야 한다.', choices: [
        { label: '상단에 합류해 여행한다', text: '여행길에서 새로운 사람과 문화를 접하고 견문을 넓혔다.', fx: { bond: 3, valis: 800, power: 3 } },
        { label: '지금의 생활을 지킨다', text: '익숙한 일상에 남아 주변 사람들과 시간을 보냈다.', fx: { bond: 2 } }
    ] },
    { id: 'community_role', w: 12, once: true, cond: { age: [30, 75], min: { bond: 8 } }, text: '주민들이 마을의 일을 맡아 줄 사람을 찾고 있다. 사람들의 신뢰를 얻은 당신에게도 제안이 왔다.', choices: [
        { label: '공동체 일을 맡는다', text: '사람들의 의견을 조율하며 책임감과 보람을 느꼈다.', fx: { bond: 5, valis: 500, feat: 1 } },
        { label: '다른 이에게 자리를 양보한다', text: '자신보다 더 적합한 사람을 추천하고 뒤에서 도왔다.', fx: { bond: 3 } }
    ] }
];
