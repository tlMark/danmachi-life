'use strict';
// E-fix(사용자 승인 2026-11-28): Windows 워크플로 E 단계의 CR 계수 · 추적 파일 SHA 묶음 계산 도구(게임·시험 코드 아님).
// 셸 grep · sha256sum 에 의존하지 않는다(3회차에서 Windows Git Bash 의 grep $'\r' 가 빈 패턴처럼 동작, sha256sum 은 '*' 표시 출력).
//
// 사용
//   node e_check.js <저장소 폴더> [manifest 출력 경로]   — 실제 검사. 텍스트 파일 중 CR 포함 파일이 1개 이상이면 종료 코드 1.
//   node e_check.js --selftest <빈 작업 폴더>           — 양성 자기 확인. 기대와 다르면 종료 코드 1.
//
// 계산 규칙(고정)
//   입력 집합: `git ls-files -z --eol` 의 경로 전체(NUL 구분 — 공백·특수문자 경로 안전). 작업 트리 파일을 바이트 그대로 읽는다.
//   텍스트/바이너리: git 판정을 따른다. 색인 정보가 i/-text 이거나 속성이 -text(예: binary)이면 바이너리.
//   CR 판정: 텍스트 파일에서 0x0D 바이트가 1개 이상이면 'CR 포함'. 바이너리는 0x0D 수만 따로 센다(판정 제외).
//   정렬: 경로 문자열의 UTF-8 바이트 순서(Buffer.compare). 로캘·운영체제와 무관.
//   SHA 묶음: 정렬 순서대로 "<sha256 hex>\t<경로>\n" 줄을 이은 UTF-8 텍스트의 SHA-256(hex). manifest 는 이 텍스트 그대로다.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawnSync } = require('child_process');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

function listTracked(repo) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', 'ls-files', '-z', '--eol'], { cwd: repo, encoding: 'buffer', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error('git ls-files 실패: ' + (r.stderr || '').toString());
  const out = [];
  for (const rec of r.stdout.toString('utf8').split('\0')) {
    if (!rec) continue;
    const tab = rec.indexOf('\t'); if (tab < 0) throw new Error('ls-files --eol 형식 예외: ' + JSON.stringify(rec));
    const info = rec.slice(0, tab), file = rec.slice(tab + 1);
    const tok = info.split(/\s+/);   // 예: ['i/lf', 'w/lf', 'attr/text=auto', 'eol=lf'] · 바이너리: 'i/-text' 또는 'attr/-text'
    const binary = tok.includes('i/-text') || tok.includes('attr/-text') || tok.includes('-text');
    out.push({ file, info: info.replace(/\s+/g, ' ').trim(), binary });
  }
  return out;
}

// 순수 계산: [{file, bytes, binary}] → 결과(입력 순서와 무관)
function compute(entries) {
  const rows = entries.map(e => { let cr = 0; for (const b of e.bytes) if (b === 0x0d) cr++; return { file: e.file, binary: e.binary, cr, hash: sha(e.bytes) }; });
  rows.sort((a, b) => Buffer.compare(Buffer.from(a.file, 'utf8'), Buffer.from(b.file, 'utf8')));
  const manifest = rows.map(r => r.hash + '\t' + r.file + '\n').join('');
  const crText = rows.filter(r => !r.binary && r.cr > 0).map(r => r.file);
  return { files: rows.length, textFiles: rows.filter(r => !r.binary).length, binaryFiles: rows.filter(r => r.binary).length,
    crTextFiles: crText.length, crTextList: crText.slice(0, 20), binaryCrBytes: rows.filter(r => r.binary).reduce((s, r) => s + r.cr, 0),
    bundle: sha(Buffer.from(manifest, 'utf8')), manifest };
}

function checkRepo(repo) {
  return compute(listTracked(repo).map(t => ({ file: t.file, binary: t.binary, bytes: fs.readFileSync(path.join(repo, t.file)) })));
}

function selftest(work) {
  const fails = []; const ok = (name, cond, d) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); if (!cond) fails.push(name); };
  fs.mkdirSync(work, { recursive: true });
  const repo = fs.mkdtempSync(path.join(work, 'e_selftest_'));
  const git = (...a) => { const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=e_check', '-c', 'user.email=e_check@invalid', ...a], { cwd: repo, encoding: 'utf8' }); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ': ' + r.stderr); return r.stdout; };
  git('init', '-q');
  const W = (f, b) => { fs.mkdirSync(path.dirname(path.join(repo, f)), { recursive: true }); fs.writeFileSync(path.join(repo, f), b); };
  // .gitattributes 없음 · autocrlf=false: CRLF 텍스트가 색인·작업 트리에 그대로 남는다
  W('lf.txt', 'a\nb\n');
  W('crlf.txt', 'a\r\nb\r\n');
  W('dir with space/한글 파일 #1 & it\'s.txt', 'x\ny\n');
  W('img.bin', Buffer.from([0x00, 0x0d, 0x0a, 0xff, 0x0d, 0x00]));   // NUL 포함 → git 이 바이너리로 판정
  git('add', '-A'); git('commit', '-q', '-m', 'selftest');
  const r = checkRepo(repo);
  ok('ST-1 양성: CRLF 텍스트 1개를 검출', r.crTextFiles === 1 && r.crTextList[0] === 'crlf.txt', { crTextFiles: r.crTextFiles, list: r.crTextList });
  ok('ST-2 바이너리 판정 제외: 0x0D 바이트는 따로 셈', r.binaryFiles === 1 && r.binaryCrBytes === 2, { binaryFiles: r.binaryFiles, binaryCrBytes: r.binaryCrBytes });
  ok('ST-3 공백·한글·특수문자 경로가 입력 집합에 그대로 포함', r.files === 4 && r.manifest.includes('\tdir with space/한글 파일 #1 & it\'s.txt\n'), { files: r.files });
  const entries = listTracked(repo).map(t => ({ file: t.file, binary: t.binary, bytes: fs.readFileSync(path.join(repo, t.file)) }));
  const rev = compute(entries.slice().reverse());
  ok('ST-4 입력 순서와 무관한 묶음(역순 입력 → 같은 값)', rev.bundle === r.bundle && rev.manifest === r.manifest, { a: r.bundle.slice(0, 16), b: rev.bundle.slice(0, 16) });
  ok('ST-5 정렬 = UTF-8 바이트 순서', r.manifest.split('\n').filter(Boolean).map(l => l.split('\t')[1]).join('|') === 'crlf.txt|dir with space/한글 파일 #1 & it\'s.txt|img.bin|lf.txt');
  const expectBundle = sha(Buffer.from(['crlf.txt', 'dir with space/한글 파일 #1 & it\'s.txt', 'img.bin', 'lf.txt'].map(f => sha(fs.readFileSync(path.join(repo, f))) + '\t' + f + '\n').join(''), 'utf8'));
  ok('ST-6 묶음 = 규칙대로 독립 계산한 값', r.bundle === expectBundle);
  // CRLF 파일을 LF 로 고쳐 커밋하면 0
  W('crlf.txt', 'a\nb\n'); git('add', '-A'); git('commit', '-q', '-m', 'fix');
  const r2 = checkRepo(repo);
  ok('ST-7 음성: CR 없는 저장소 → 0', r2.crTextFiles === 0, { crTextFiles: r2.crTextFiles });
  ok('ST-8 내용 변경 → 묶음 변경', r2.bundle !== r.bundle);
  console.log('SELFTEST: ' + (fails.length ? 'FAIL ' + fails.join(',') : 'PASS 8/8') + ' · work=' + repo);
  return fails.length ? 1 : 0;
}

if (require.main === module) {
  const a = process.argv.slice(2);
  if (a[0] === '--selftest') process.exit(selftest(path.resolve(a[1] || fs.mkdtempSync(path.join(require('os').tmpdir(), 'e_check_')))));
  const repo = path.resolve(a[0] || '.');
  const r = checkRepo(repo);
  if (a[1]) fs.writeFileSync(a[1], r.manifest);
  const { manifest, ...summary } = r;
  console.log('E_CHECK ' + JSON.stringify(summary));
  console.log('E 텍스트 파일 중 CR 포함=' + r.crTextFiles + ' · 추적 파일=' + r.files + '(텍스트 ' + r.textFiles + ' · 바이너리 ' + r.binaryFiles + ') · SHA 묶음=' + r.bundle);
  process.exit(r.crTextFiles === 0 ? 0 : 1);
}
module.exports = { compute, checkRepo, listTracked };
