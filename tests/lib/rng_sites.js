// F1D4A P1 — RNG 지점 기록 공통 라이브러리 (시험 하네스 전용. 게임 코드에서 쓰지 않는다)
// 설계: F1D4A r3.20 00_INDEX §4.1.1(위치 표) · §4.1.3(B 규칙) · §4.1.5(조립 문자열 위치 → 원본 위치 역변환)
// Node(require)와 브라우저(스크립트 주입) 양쪽에서 같은 소스로 쓴다. 외부 패키지 없음.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module && module.exports) module.exports = api;
    if (root) root.RngSites = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // ── 줄·열 계산 (V8 줄 종결자: LF, CR, CRLF(1개로 셈), U+2028, U+2029. 열은 UTF-16 코드 단위) ──
    function lineStarts(text) {
        const starts = [0];
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            if (c === 10 || c === 0x2028 || c === 0x2029) starts.push(i + 1);
            else if (c === 13) { if (text.charCodeAt(i + 1) === 10) i++; starts.push(i + 1); }
        }
        return starts;
    }
    function countSpecialChars(text) {   // 빌드마다 다시 세어 기록하는 값(§4.1.5 줄바꿈 계산)
        const out = { cr: 0, u2028: 0, u2029: 0, bom: 0, astral: 0, endsWithLf: text.length > 0 && text.charCodeAt(text.length - 1) === 10 };
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            if (c === 13) out.cr++; else if (c === 0x2028) out.u2028++; else if (c === 0x2029) out.u2029++; else if (c === 0xFEFF) out.bom++;
            else if (c >= 0xD800 && c <= 0xDBFF) out.astral++;
        }
        return out;
    }
    // 오프셋(0부터) → { line, col }(둘 다 1부터)
    function posOfOffset(starts, offset) {
        let lo = 0, hi = starts.length - 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
        return { line: lo + 1, col: offset - starts[lo] + 1 };
    }
    const isPosInt = n => typeof n === 'number' && Number.isInteger(n) && n >= 1;

    // ── 조립 문자열과 조각 표 ─────────────────────────────────────────────────────────────
    // parts: [{ kind: 'source' | 'separator' | 'harness-boundary' | 'harness' | 'other', file, text }]
    // 반환: { text, starts, rows } — rows 는 반열린 구간 [startOffset, endOffsetExclusive) 로 조립 문자열 전체를 빈틈·겹침 없이 덮는다.
    function buildAssembly(parts) {
        let text = '';
        const spans = [];
        for (const p of parts) { const start = text.length; text += p.text; spans.push({ kind: p.kind, file: p.file || null, startOffset: start, endOffsetExclusive: text.length, partText: p.text }); }
        const starts = lineStarts(text);
        const rows = spans.map(s => {
            const a = posOfOffset(starts, s.startOffset), b = posOfOffset(starts, s.endOffsetExclusive);
            return { kind: s.kind, file: s.file, startOffset: s.startOffset, endOffsetExclusive: s.endOffsetExclusive,
                vmStartLine: a.line, vmStartCol: a.col, vmEndLine: b.line, vmEndColExclusive: b.col,
                partStarts: (s.kind === 'source' || s.kind === 'harness') ? lineStarts(s.partText) : null };
        });
        return { text, length: text.length, starts, rows };
    }
    // 연속 규칙 검사. 위반 내용을 문자열 배열로 돌려준다(빈 배열 = 정상).
    function checkRows(rows, totalLength) {
        const bad = [];
        if (!rows.length) { bad.push('no rows'); return bad; }
        if (rows[0].startOffset !== 0) bad.push('first row does not start at 0');
        for (let i = 0; i < rows.length; i++) {
            if (!(rows[i].endOffsetExclusive >= rows[i].startOffset)) bad.push('negative length at row ' + i);
            if (i + 1 < rows.length && rows[i].endOffsetExclusive !== rows[i + 1].startOffset) bad.push('gap or overlap between row ' + i + ' and ' + (i + 1));
        }
        if (rows[rows.length - 1].endOffsetExclusive !== totalLength) bad.push('last row does not end at total length');
        return bad;
    }
    // Node 러너(test_runner.js)의 조립식 그대로: files.join(separator) + boundary + harnessText
    function buildNodeVmParts(sourceFiles, texts, separator, boundary, harnessText, harnessName) {
        const parts = [];
        sourceFiles.forEach((file, i) => {
            if (i > 0) parts.push({ kind: 'separator', file: null, text: separator });
            parts.push({ kind: 'source', file, text: texts[i] });
        });
        parts.push({ kind: 'harness-boundary', file: null, text: boundary });
        parts.push({ kind: 'harness', file: harnessName || 'harness', text: harnessText });
        return parts;
    }
    // 조립 문자열 기준 (line, col)(1부터) → { area, file, line, col } 또는 { area: 'unknown', reason }
    // 임의 보정을 하지 않는다: 표에 정확히 들어맞지 않으면 unknown.
    function mapPosition(asm, line, col) {
        if (!isPosInt(line) || !isPosInt(col)) return { area: 'unknown', reason: 'bad-line-or-col' };
        if (line > asm.starts.length) return { area: 'unknown', reason: 'line-out-of-range' };
        const lineStart = asm.starts[line - 1];
        const lineEnd = line < asm.starts.length ? asm.starts[line] : asm.length;   // 다음 줄 시작(끝 제외)
        const abs = lineStart + (col - 1);
        if (abs >= lineEnd) return { area: 'unknown', reason: 'col-out-of-range' };
        let row = null;
        for (const r of asm.rows) { if (r.startOffset <= abs && abs < r.endOffsetExclusive) { row = r; break; } }
        if (!row) return { area: 'unknown', reason: 'no-row' };
        if (row.kind !== 'source' && row.kind !== 'harness') return { area: 'unknown', reason: row.kind };
        const p = posOfOffset(row.partStarts, abs - row.startOffset);
        return { area: row.kind, file: row.file, line: p.line, col: p.col };
    }

    // ── 정적 검색: 주석·문자열을 건너뛰며 식별자 출현 위치를 찾는다 ─────────────────────────
    // 반환: 코드 영역(주석·문자열·템플릿 본문 밖)이면 1, 아니면 0 인 Uint8Array
    function codeMask(text) {
        const mask = new Uint8Array(text.length);
        let i = 0;
        const n = text.length;
        const stack = [];   // 템플릿 ${ } 중첩: 각 항목은 그 식 안의 중괄호 깊이
        let lastSig = '';   // 직전 유효 문자(정규식 리터럴 판정용)
        while (i < n) {
            const c = text[i], d = text[i + 1];
            if (c === '/' && d === '/') { while (i < n && text[i] !== '\n') i++; continue; }
            if (c === '/' && d === '*') { i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
            if (c === '\'' || c === '"') { const q = c; i++; while (i < n && text[i] !== q) { if (text[i] === '\\') i++; if (text[i] === '\n') break; i++; } i++; lastSig = 'x'; continue; }
            if (c === '`') { i = skipTemplate(text, i, mask); lastSig = 'x'; continue; }
            if (c === '/' && (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.indexOf(lastSig) >= 0 || /\b(return|typeof|case|in|of|delete|void|throw)$/.test(text.slice(Math.max(0, i - 8), i).trimEnd()))) {
                // 정규식 리터럴: 닫는 / 까지(문자 클래스 안의 / 는 닫지 않음)
                let j = i + 1, inClass = false, ok = false;
                while (j < n && text[j] !== '\n') { if (text[j] === '\\') { j += 2; continue; } if (text[j] === '[') inClass = true; else if (text[j] === ']') inClass = false; else if (text[j] === '/' && !inClass) { ok = true; break; } j++; }
                if (ok) { i = j + 1; while (i < n && /[a-z]/i.test(text[i])) i++; lastSig = 'x'; continue; }
            }
            mask[i] = 1;
            if (!/\s/.test(c)) lastSig = c;
            i++;
        }
        return mask;
        function skipTemplate(t, start, m) {   // start 는 여는 ` 위치. 본문은 코드가 아니고, ${ } 안은 코드로 표시한다.
            let k = start + 1;
            while (k < t.length && t[k] !== '`') {
                if (t[k] === '\\') { k += 2; continue; }
                if (t[k] === '$' && t[k + 1] === '{') {
                    k += 2; let depth = 1;
                    while (k < t.length && depth > 0) {
                        const ch = t[k];
                        if (ch === '`') { k = skipTemplate(t, k, m); continue; }
                        if (ch === '\'' || ch === '"') { const q = ch; k++; while (k < t.length && t[k] !== q) { if (t[k] === '\\') k++; k++; } k++; continue; }
                        if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { k++; break; } }
                        m[k] = 1; k++;
                    }
                    continue;
                }
                k++;
            }
            return k + 1;
        }
    }
    function findAllCode(text, mask, needle, boundaryCheck) {
        const out = [];
        let from = 0;
        for (;;) {
            const at = text.indexOf(needle, from);
            if (at < 0) break;
            from = at + 1;
            if (!mask[at]) continue;
            if (boundaryCheck && !boundaryCheck(text, at)) continue;
            out.push(at);
        }
        return out;
    }
    const identChar = ch => !!ch && /[A-Za-z0-9_$]/.test(ch);

    // 둘러싼 함수 이름(정적 휴리스틱): 같은 줄의 `const NAME = (...) =>` 또는, 앞쪽에서 들여쓰기가 더 얕은 가장 가까운 `function NAME(`.
    // 판정할 수 없으면 null. 호출자는 null 을 UNKNOWN 분류로 다룬다(추정으로 채우지 않음).
    function enclosingFunction(text, starts, offset) {
        const p = posOfOffset(starts, offset);
        const lineText = l => text.slice(starts[l - 1], l < starts.length ? starts[l] : text.length);
        const indentOf = s => (s.match(/^[ \t]*/) || [''])[0].length;
        const here = lineText(p.line);
        const sameLine = here.match(/^[ \t]*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/);
        if (sameLine && here.indexOf('=>') < (offset - starts[p.line - 1])) return sameLine[1];
        const myIndent = indentOf(here);
        for (let l = p.line - 1; l >= 1; l--) {
            const t = lineText(l);
            const m = t.match(/^[ \t]*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
            if (m && indentOf(t) < myIndent) return m[1];
        }
        return null;
    }

    // ── 위치 표(지점 표) ──────────────────────────────────────────────────────────────────
    // 규칙(F1 정적 확인, 00_INDEX §4.1.1). **명시적 허용 목록**이다: (파일, 둘러싼 함수, 종류)마다 분류와 "그 묶음의 지점 수"를 적는다.
    //   - 목록에 없는 묶음은 UNKNOWN.
    //   - 묶음의 실제 지점 수가 적힌 수와 다르면(같은 함수에 호출이 늘거나 줄면) 그 묶음 전체가 UNKNOWN. 자동으로 기존 분류를 물려받지 않는다.
    //   - 와일드카드는 쓰지 않는다.
    // 키: 'random' = Math.random() 직접 호출, 'call-<함수>' = 공유·래퍼 함수 호출.
    const G = (cls, count) => ({ cls, count });
    const RULES = {
        shared: { 'script.js': ['getRandomItemByWeight'], 'core/relations.js': ['weightedPick'] },   // Math.random 을 직접 부르고 둘 이상 지점에서 불리는 함수
        wrapper: { 'script.js': ['rnd'] },                                                            // 호출자 1곳인 래퍼
        groups: {
            'script.js': {
                rnd: { random: G('(wrapper)', 1) },
                getRandomItemByWeight: { random: G('(shared)', 1) },
                pickFamiliaCandidate: { 'call-getRandomItemByWeight': G('R4', 1) },
                rollFamiliaBody: { random: G('R4', 1), 'call-rnd': G('R4', 1) },
                startLife: { random: G('R4', 1), 'call-getRandomItemByWeight': G('R4', 4) },
                nextYear: { random: G('R5', 1), 'call-getRandomItemByWeight': G('R1', 1) },
                showEvent: { random: G('R2', 1) },
                chooseBody: { random: G('R3', 1) },
                renderFollowup: { random: G('R2-relocate', 1) }   // F1D4A P4(의도적 시험 변경, D-REGION §8.5.4): relocate 후속 선택 자동 진행 콜백 1곳
            },
            'core/growth.js': { rollAnnualExcelia: { random: G('R4', 1) } },
            'core/relations.js': {
                weightedPick: { random: G('(shared)', 1) },
                pickPartnerRace: { random: G('R4', 1), 'call-weightedPick': G('R4', 1) },
                createRomanticPartner: { random: G('R4', 2), 'call-weightedPick': G('R4', 1) },
                parentRaces: { random: G('R4', 1) },
                generateFamily: { random: G('R4', 3), 'call-weightedPick': G('R4', 1) },
                createChild: { random: G('R4', 1) },
                advanceYear: { random: G('R4', 3) }
            }
        },
        harness: { driverChoose: { random: G('HARNESS', 1) }, driverChooseRelocate: { random: G('HARNESS-relocate', 1) } }   // 하네스 영역: 공통 드라이버의 버튼 선택 한 곳 + P4 이주 분기 한 곳(의도적 시험 변경)
    };
    const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

    // files: [{ area: 'source' | 'harness', file, text }] → sites 배열
    // site: { id, area, file, line, col, stackCol, kind: 'direct' | 'call', callee, fn, role: 'plain' | 'shared' | 'wrapper', cls }
    //   col      = 표현식의 첫 글자 열(Math 의 M, 호출 함수 이름의 첫 글자). 1부터, UTF-16.
    //   stackCol = V8 스택이 그 호출에 대해 보고하는 열. 결정 규칙(보정이 아님):
    //                멤버 호출 `Math.random()` → 속성 이름 `random` 의 시작 열 = col + 5 ('Math.' 다섯 글자)
    //                일반 호출 `f()`            → 함수 이름의 시작 열 = col
    //              분류는 stackCol 과 **정확히 같은** 열만 그 지점으로 본다. 다른 열은 모두 UNKNOWN.
    // 호출식만 지점이다: 이름 뒤(공백 허용)에 '(' 가 와야 한다. `Math.random = f` · `x === Math.random` 같은 대입·참조와 주석·문자열 속 글자는 지점이 아니다.
    const MEMBER_CALL_OFFSET = 5;   // 'Math.'.length
    function buildSiteTable(files, rules) {
        const R = rules || RULES;
        const sites = [];
        for (const f of files) {
            const text = f.text, mask = codeMask(text), starts = lineStarts(text);
            const isCall = (at, len) => /^\s*\(/.test(text.slice(at + len, at + len + 64));
            const found = [];
            for (const at of findAllCode(text, mask, 'Math.random', (t, a) => !identChar(t[a - 1]) && t[a - 1] !== '.' && !identChar(t[a + 11]))) {
                if (isCall(at, 11)) found.push({ at, kind: 'direct', callee: null, len: 11 });
            }
            if (f.area === 'source') {
                const names = [];
                for (const k of Object.keys(R.shared)) for (const nm of R.shared[k]) if (names.indexOf(nm) < 0) names.push(nm);
                for (const k of Object.keys(R.wrapper)) for (const nm of R.wrapper[k]) if (names.indexOf(nm) < 0) names.push(nm);
                for (const name of names) {
                    for (const at of findAllCode(text, mask, name, (t, a) => !identChar(t[a - 1]) && t[a - 1] !== '.' && !identChar(t[a + name.length]))) {
                        const before = text.slice(Math.max(0, at - 12), at);   // 선언(`function NAME(` · `const NAME =`)은 호출이 아니다
                        if (!isCall(at, name.length) || /function\s+$/.test(before) || /(?:const|let|var)\s+$/.test(before)) continue;
                        found.push({ at, kind: 'call', callee: name, len: name.length });
                    }
                }
            }
            found.sort((a, b) => a.at - b.at);
            const fileKey = f.area === 'harness' ? 'harness' : f.file;
            const groups = {};   // 묶음 키 → 지점 목록
            for (const x of found) {
                const p = posOfOffset(starts, x.at);
                const fn = enclosingFunction(text, starts, x.at);   // 판정할 수 없으면 null → UNKNOWN
                const kindKey = x.kind === 'direct' ? 'random' : 'call-' + x.callee;
                const base = fileKey + ':' + (fn || '?') + ':' + kindKey;
                (groups[base] = groups[base] || []).push({ x, p, fn, kindKey });
            }
            for (const base of Object.keys(groups)) {
                const list = groups[base];
                const fn = list[0].fn, kindKey = list[0].kindKey;
                const table = f.area === 'harness' ? R.harness : (R.groups || {})[f.file];
                const rule = fn !== null && own(table, fn) && own(table[fn], kindKey) ? table[fn][kindKey] : null;
                const cls = rule && rule.count === list.length ? rule.cls : 'UNKNOWN';   // 목록에 없거나 지점 수가 다르면 UNKNOWN
                list.forEach((it, i) => {
                    const role = cls === '(shared)' ? 'shared' : cls === '(wrapper)' ? 'wrapper' : 'plain';
                    sites.push({ id: base + '#' + (i + 1), area: f.area, file: fileKey, line: it.p.line, col: it.p.col, stackCol: it.p.col + (it.x.kind === 'direct' ? MEMBER_CALL_OFFSET : 0),
                        kind: it.x.kind, callee: it.x.callee, fn: it.fn, role, cls, unknownReason: cls === 'UNKNOWN' ? (fn === null ? 'no-enclosing-function' : !rule ? 'not-in-allowlist' : 'count-mismatch') : null, _at: it.x.at });
                });
            }
        }
        // 파일 순서 → 파일 안 위치 순서로 정렬(표의 순서를 결정적으로)
        const order = files.map(f => f.area === 'harness' ? 'harness' : f.file);
        sites.sort((a, b) => (order.indexOf(a.file) - order.indexOf(b.file)) || (a._at - b._at));
        for (const s of sites) delete s._at;
        return sites;
    }
    // 변환된 위치 → 지점. (영역, 파일, 줄, stackCol)이 정확히 같을 때만 그 지점이다. 범위·근접 일치는 없다.
    function makeSiteIndex(sites) {
        const byPos = new Map();
        for (const s of sites) {
            const key = s.area + '|' + s.file + '|' + s.line + '|' + s.stackCol;
            if (byPos.has(key)) throw new Error('two sites at the same stack position: ' + s.id + ' / ' + byPos.get(key).id);
            byPos.set(key, s);
        }
        return function siteAt(pos) {
            if (!pos || pos.area === 'unknown') return null;
            return byPos.get(pos.area + '|' + pos.file + '|' + pos.line + '|' + pos.col) || null;
        };
    }

    // ── 스택 파싱 (V8 형식. 환경별 차이는 파일 식별자 해석(resolveFile)에서 처리) ────────────────
    // 한 줄: "    at name (file:line:col)" 또는 "    at file:line:col". 형식이 다르면 null(→ UNKNOWN).
    function parseFrameLine(lineText) {
        const m = /^\s*at (?:(.*?) \()?(.*):(\d+):(\d+)\)?\s*$/.exec(lineText);
        if (!m) return null;
        return { fn: m[1] || null, file: m[2], line: Number(m[3]), col: Number(m[4]) };
    }
    function parseStack(stack, maxFrames) {
        const lines = String(stack).split('\n');
        const frames = [];
        for (let i = 0; i < lines.length && frames.length < maxFrames; i++) {
            if (!/^\s*at /.test(lines[i])) continue;   // 첫 줄 "Error" 등
            frames.push(parseFrameLine(lines[i]));      // null 이면 파싱 실패 프레임
        }
        return frames;
    }

    // ── B 규칙 분류기 ─────────────────────────────────────────────────────────────────────
    // opts: { sites, locate(frame) → { area, file, line, col } | { area:'unknown' }, dropFrames }
    //   dropFrames: 기록기 자신의 프레임 수(스택 맨 위에서 버림)
    // classify(stack) → { cls, id, raw, mapped } — id 는 "실제 지점" 또는 "실제 지점<-호출 지점"
    function makeClassifier(opts) {
        const siteAt = makeSiteIndex(opts.sites);
        const cache = new Map();
        const MAX_HOPS = 4;   // 공유·래퍼 함수를 건너뛰는 최대 횟수(F1: 1). 넘으면 UNKNOWN
        function classifyFrames(frames) {
            const chain = [];
            let idx = opts.dropFrames;
            for (let hop = 0; hop <= MAX_HOPS; hop++, idx++) {
                const fr = frames[idx];
                if (!fr) return { cls: 'UNKNOWN', id: 'UNKNOWN:no-frame', chain };
                const pos = opts.locate(fr);
                const site = siteAt(pos);
                chain.push({ raw: { file: fr.file, line: fr.line, col: fr.col }, mapped: pos, site: site ? site.id : null });
                if (!site) return { cls: 'UNKNOWN', id: 'UNKNOWN:' + (pos && pos.area !== 'unknown' ? 'no-site' : 'unmapped'), chain };
                if (hop === 0 && site.kind !== 'direct') return { cls: 'UNKNOWN', id: 'UNKNOWN:top-not-random', chain };
                if (hop > 0 && site.kind !== 'call') return { cls: 'UNKNOWN', id: 'UNKNOWN:caller-not-call', chain };
                if (site.role === 'shared' || site.role === 'wrapper') continue;   // 호출자 프레임으로 내려간다
                if (site.cls === 'UNKNOWN') return { cls: 'UNKNOWN', id: 'UNKNOWN:unclassified-site', chain };
                return { cls: site.cls, id: chain.map(c => c.site).join('<-'), chain };
            }
            return { cls: 'UNKNOWN', id: 'UNKNOWN:too-deep', chain };
        }
        return function classify(stack) {
            // 캐시 키: 기록기 프레임 뒤의 앞쪽 프레임 문자열(분류에 쓰는 범위)
            const lines = String(stack).split('\n').filter(l => /^\s*at /.test(l));
            const key = lines.slice(opts.dropFrames, opts.dropFrames + MAX_HOPS + 1).join('\n');
            let hit = cache.get(key);
            if (!hit) { hit = classifyFrames(lines.slice(0, opts.dropFrames + MAX_HOPS + 1).map(parseFrameLine).map(f => f || { fn: null, file: null, line: NaN, col: NaN })); cache.set(key, hit); }
            return hit;
        };
    }

    // ── 집계기: 생애별 지점 순서열 해시와 지점별 호출 수 ────────────────────────────────────
    const fnv = (h, str) => { for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
    function makeTally() {
        const t = { phase: 'unit', unit: { calls: 0, byId: {}, byCls: {} }, lives: { calls: 0, byId: {}, byCls: {}, count: 0, seqDigest: 2166136261, perLifeCallDigest: 2166136261 },
            cur: null, unknownSamples: [] };
        t.keepIds = false;   // true 면 생애별 지점 id 순서열 자체도 보관한다(타이머 차이 시험처럼 생애 수가 적을 때만)
        t.lifeStart = () => { t.phase = 'life'; t.cur = { calls: 0, seq: 2166136261, ids: t.keepIds ? [] : null }; };
        t.lifeEnd = () => {
            if (!t.cur) return null;
            const done = t.cur; t.cur = null; t.phase = 'between';
            t.lives.count += 1;
            t.lives.seqDigest = fnv(t.lives.seqDigest, String(done.seq));
            t.lives.perLifeCallDigest = fnv(t.lives.perLifeCallDigest, String(done.calls));
            return done;
        };
        t.note = (res, stackForSample) => {
            const bucket = t.cur ? t.lives : t.unit;
            bucket.calls += 1;
            bucket.byId[res.id] = (bucket.byId[res.id] || 0) + 1;
            bucket.byCls[res.cls] = (bucket.byCls[res.cls] || 0) + 1;
            if (t.cur) { t.cur.calls += 1; t.cur.seq = fnv(t.cur.seq, res.id); if (t.cur.ids) t.cur.ids.push(res.id); }
            if (res.cls === 'UNKNOWN' && t.unknownSamples.length < 10) t.unknownSamples.push({ phase: t.cur ? 'life' : t.phase, id: res.id, chain: res.chain, stack: String(stackForSample).split('\n').slice(0, 8) });
        };
        t.report = () => ({ unit: t.unit, lives: t.lives, unknownSamples: t.unknownSamples });
        return t;
    }

    return { lineStarts, countSpecialChars, posOfOffset, buildAssembly, checkRows, buildNodeVmParts, mapPosition,
        codeMask, findAllCode, enclosingFunction, RULES, MEMBER_CALL_OFFSET, buildSiteTable, makeSiteIndex, parseFrameLine, parseStack, makeClassifier, makeTally, fnv };
});
