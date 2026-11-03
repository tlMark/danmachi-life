// 1. 대폭 확장된 던만추 세계관 JSON 데이터 (오리지널 텍스트 작성)
const gachaData = {
    origins: [
        { id: "orario", label: "미궁도시 오라리오", weight: 350, desc: "세계의 중심이자 유일하게 던전이 존재하는 거대한 다민족 도시." },
        { id: "rakia", label: "군사국가 라키아", weight: 200, desc: "아레스 파밀리아가 국가 그 자체인, 잦은 전쟁을 일으키는 호전적인 제국." },
        { id: "melen", label: "항구도시 메렌", weight: 150, desc: "오라리오 근처에 위치해 풍부한 해산물과 물류가 오가는 활기찬 항구." },
        { id: "far_east", label: "극동", weight: 120, desc: "오라리오에서 아득히 먼 동쪽, 독자적인 문화와 기술이 발달한 미지의 땅." },
        { id: "telskyura", label: "투국 텔스큐라", weight: 80, desc: "여성 전사들이 서로 죽고 죽이는 의식을 통해 강해지는 가혹한 아마조네스의 나라." },
        { id: "elven_forest", label: "엘프의 숲", weight: 99, desc: "외부인의 출입을 극도로 꺼리며 자연과 마법을 숭상하는 엘프들의 은신처." },
        { id: "unknown", label: "비경", weight: 1, desc: "용이나 정령들이 숨어 산다고 전해지는, 세계 지도의 공백 지대." }
    ],
    races: [
        { id: "human", label: "휴먼", weight: 400, desc: "가장 수명이 짧고 약하지만, 무한한 가능성과 개체수를 자랑하는 종족." },
        { id: "beastman", label: "수인", weight: 200, desc: "늑대, 고양이, 멧돼지 등 동물의 특성과 뛰어난 오감을 지닌 종족." },
        { id: "pallum", label: "파룸(소인족)", weight: 120, desc: "성인의 체구도 아이처럼 작으나, 날렵함과 명석한 두뇌를 가진 종족." },
        { id: "dwarf", label: "드워프", weight: 120, desc: "단단한 근육질의 몸과 광석을 다루는 천부적인 재능을 지닌 종족." },
        { id: "elf", label: "엘프", weight: 70, desc: "아름다운 외모와 뛰어난 마법적 재능, 그리고 높은 긍지를 지닌 종족." },
        { id: "half_elf", label: "하프 엘프", weight: 50, desc: "인간과 엘프의 혼혈로, 두 종족의 특징을 모두 물려받은 존재." },
        { id: "amazon", label: "아마조네스", weight: 35, desc: "여성체만 존재하며, 강한 남성의 씨앗을 갈구하는 호전적인 전투 민족." },
        { id: "renard", label: "르나르", weight: 4, desc: "극동 출신이 많으며 요술을 다룬다고 알려진 희귀한 여우 수인." },
        { id: "xenos", label: "이단아(제노스)", weight: 1, desc: "몬스터임에도 이성과 감정을 가지고 태어난 던전의 돌연변이." }
    ],
    familias: [
        { id: "civilian", label: "무소속 (일반 시민)", weight: 300, desc: "등에 은총을 새기지 않고 평범한 생업에 종사하는 주민." },
        { id: "ares", label: "아레스 파밀리아", weight: 150, desc: "라키아의 정규군 그 자체로, 머릿수만큼은 세계 최대를 자랑하는 군단." },
        { id: "ganesha", label: "가네샤 파밀리아", weight: 120, desc: "오라리오의 경찰 역할을 수행하며 군중을 통제하는 최대 규모의 파밀리아." },
        { id: "hephaestus", label: "헤파이스토스 파밀리아", weight: 90, desc: "오라리오의 무장 수준을 책임지는 최고의 단야(대장장이) 파벌." },
        { id: "loki", label: "로키 파밀리아", weight: 60, desc: "강력한 제일급 모험자들을 다수 보유한 오라리오 최강의 탐색 파벌." },
        { id: "freya", label: "프레야 파밀리아", weight: 60, desc: "여신에 대한 맹목적 사랑으로 똘똘 뭉친 오라리오 최강의 무투 파벌." },
        { id: "kali", label: "칼리 파밀리아", weight: 50, desc: "투국 텔스큐라를 지배하며, 살육을 통해 강해지는 것을 의무로 삼는 집단." },
        { id: "hermes", label: "헤르메스 파밀리아", weight: 40, desc: "전 세계를 누비며 물건을 나르고 정보를 수집하는 다재다능한 파밀리아." },
        { id: "hostess", label: "풍요의 여주인", weight: 40, desc: "전직 모험자 출신의 강자들이 웨이트리스로 일하고 있는 위험하고 활기찬 주점." },
        { id: "guild", label: "길드", weight: 30, desc: "우라노스의 뜻에 따라 마석을 매입하고 던전과 오라리오를 통제하는 행정 기관." },
        { id: "demeter", label: "데메테르 파밀리아", weight: 50, desc: "대지의 여신 아래에서 대형 농장을 꾸려 가는 농업 파밀리아." },
        { id: "miach", label: "미아흐 파밀리아", weight: 25, desc: "의술과 약 제조를 업으로 삼는 작은 파밀리아." },
        { id: "takemikazuchi", label: "타케미카즈치 파밀리아", weight: 20, desc: "신에게 직접 무예를 전수받는 파밀리아." },
        { id: "soma", label: "소마 파밀리아", weight: 20, desc: "신이 단원들을 방임하는 탓에 기강이 느슨한 파밀리아." },
        { id: "astraea", label: "아스트레아 파밀리아", weight: 10, desc: "과거 오라리오의 어둠에 맞서 질서를 수호하려 했던 정의의 파벌." },
        { id: "hestia", label: "헤스티아 파밀리아", weight: 1, desc: "변변한 홈조차 없었으나, 놀라운 성장을 기록하며 기적을 써내려가는 파밀리아." }
    ],
    talents: [
        { id: "none", label: "무재능", weight: 400, desc: "신탁(팔나)을 받아도 어떤 마법이나 스킬도 발현되지 않는 지극히 평범한 그릇." },
        { id: "dev_ability_hunter", label: "발전 어빌리티: 사냥꾼/내성", weight: 180, desc: "오랜 전투 경험을 통해 독에 저항하거나 몬스터의 약점을 찌르는 기술을 터득했습니다." },
        { id: "dev_ability_craft", label: "발전 어빌리티: 단야/조합", weight: 120, desc: "전투보다는 무기를 벼려내거나 포션을 제조하는 생산직의 재능을 개화했습니다." },
        { id: "basic_magic", label: "일반 마법", weight: 100, desc: "긴 영창을 외워야 하지만, 확실한 위력을 보장하는 정통파 마법을 습득했습니다." },
        { id: "curse", label: "저주 (Curse)", weight: 30, desc: "일반적인 회복 마법으로는 치유되지 않거나 대상을 파멸시키는 끔찍한 주술적 힘을 발현했습니다." },
        { id: "chantless", label: "무영창/병행영창", weight: 20, desc: "주문 없이 마법을 난사하거나, 무기를 휘두르면서 동시에 마법을 준비하는 고도의 기술을 지녔습니다." },
        { id: "rare_skill", label: "초희귀 스킬", weight: 9, desc: "전황을 뒤집거나 특정 대상에게 절대적인 위력을 발휘하는 일기당천의 스킬을 가졌습니다." },
        { id: "liaris", label: "동경일도 (리아리스 프레제)", weight: 1, desc: "마음에 품은 뜻이 꺾이지 않는 한, 경험치가 폭발적으로 증가하는 기적의 스킬입니다." }
    ],
    aliases: [
        { id: "none", label: "미부여 (Lv.1)", weight: 500, desc: "아직 신회(데나투스)에서 이명을 받을 만큼의 업적을 쌓지 못했습니다." },
        { id: "rookie", label: "미완의 일격 (루키)", weight: 250, desc: "신회에서 신들의 장난스러운 작명 센스로 붙여진 흔한 초심자용 이명입니다." },
        { id: "chuuni", label: "절대악 (이그니스/저거노트)", weight: 150, desc: "신들의 중2병 감성이 폭발하여 붙여진, 부를 때마다 얼굴이 붉어지는 부끄러운 이명입니다." },
        { id: "braver", label: "검희 / 용자", weight: 30, desc: "오라리오의 모든 이가 존경과 경외를 담아 부르는 제 1급 모험자의 이명입니다." },
        { id: "king", label: "맹자 / 패왕", weight: 5, desc: "단혈전에서 최강을 증명한 자에게만 허락되는, 정점에 선 자의 이명입니다." }
    ],
    items: [
        { id: "pyonkichi", label: "깡총이 Mk-2", type: "armor", desc: "메탈 래빗 모피로 만든 경갑. 던전에서의 생존력을 크게 높여준다.", fx: { hpMax: 15 } },
        { id: "magic_sword", label: "크로조의 마검", type: "consumable", desc: "무영창 마법 발동이 가능한 강력한 결전 병기.", fx: { power: 30 }, maxUses: 3 },
        { id: "salamander_wool", label: "살라만다 울", type: "armor", desc: "헬 하운드의 화염과 중층의 열기를 막아주는 정령의 방호포.", fx: { hpMax: 10, power: 5 } },
        { id: "undine_cloth", label: "운디네 클로스", type: "armor", desc: "수속성 내성과 극도의 추위를 막아주는 정령의 방호포.", fx: { hpMax: 10, power: 5 } },
        { id: "dual_potion", label: "듀얼 포션", type: "consumable", desc: "체력과 마인드를 동시에 회복시키는 미아흐 파밀리아의 신약.", fx: { hp: 40 }, maxUses: 1 },
        { id: "custom_weapon", label: "전용 특수 무장", type: "weapon", desc: "희귀 드롭 아이템으로 벼려낸 뛰어난 위력을 지닌 자신만의 무기.", fx: { power: 40 } },
        { id: "grimoire", label: "그리므와르", type: "consumable", desc: "읽는 것만으로 마법을 각성시켜 주는 초희귀 마도서.", fx: { feat: 5, flags: ['magic_user'] }, maxUses: 1 }
    ],
    endings: [
        { id: "minotaur", label: "상층에서 미노타우로스 무리와 조우해 공포에 질린 채 뼈아픈 패배를 겪고 모험자를 은퇴합니다.", weight: 250 },
        { id: "rakia_army", label: "오라리오가 아닌 라키아의 징집군으로 끌려가, 끝없는 영토 확장 전쟁의 최전선에 섭니다.", weight: 200 },
        { id: "goliath", label: "17계층의 계층 터주(골리앗)에게 도전했다가 파티가 반파당하며 겨우 지상으로 도망칩니다.", weight: 150 },
        { id: "melen_fisher", label: "모험자의 험난한 삶을 포기하고 메렌으로 이주하여 낚시와 그물질로 평온한 생을 마감합니다.", weight: 100 },
        { id: "deep_floor", label: "미궁의 심연(심층)에서 이레귤러(저거노트 등)를 마주치는 끔찍한 경험을 하고도 기적적으로 살아남았습니다.", weight: 80 },
        { id: "telskyura_ritual", label: "텔스큐라의 잔혹한 의식에 휘말렸으나, 뛰어난 기지로 살아남아 그들의 일원으로 인정받습니다.", weight: 40 },
        { id: "xenos_friend", label: "인조미궁 크노소스 부근에서 우연히 제노스와 조우하여, 인간과 몬스터 사이의 비밀스러운 유대를 맺습니다.", weight: 10 },
        { id: "hero", label: "신대가 끝나고 새로운 시대의 시작을 알리는 대종루를 울리며, 세계를 구한 '최후의 영웅'이 됩니다.", weight: 1 }
    ]
};
