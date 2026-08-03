/**
 * 저장소 정책 검사.
 *
 * 이 프로젝트는 소스 코드가 무엇을 담을 수 있는지에 대해 확고한 약속을 몇 가지
 * 한다. 영속 저장 없음, 임의 네트워크 없음, 쿼리 문자열 상태 없음,
 * 원시 HTML 주입 없음, 그리고 전반에 걸쳐 중립적이고 진료와 무관한 어휘. 이
 * 약속들은 자동 검사가 뒷받침하는 만큼만 가치가 있으므로, `src/` 아래의 모든
 * 파일(이 테스트 스위트는 제외)을 디스크에서 읽어 여기서 검사한다.
 *
 * 런타임 API 검사에 앞서 주석을 비우기 때문에 "이 모듈은 localStorage를 절대
 * 건드리지 않는다" 같은 산문이 위반으로 오인되지 않는다. 어휘 검사는 의도적으로
 * 원본 텍스트를 대상으로 돈다. 주석과 문서도 사용자에게 보이는 대상이기 때문이다.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_DIR = join(REPO_ROOT, 'src');
const TESTS_DIR = join(SRC_DIR, 'tests');

const SCANNED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.next', '.git', 'dist', 'build']);

interface SourceFile {
  /** 저장소 기준 상대 경로. 실패 메시지에 쓴다. */
  readonly path: string;
  readonly raw: string;
  /** 같은 텍스트에서 주석만 비운 것. 줄 번호는 그대로 유지된다. */
  readonly code: string;
}

function collectFiles(directory: string, out: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      if (fullPath === TESTS_DIR) continue;
      collectFiles(fullPath, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      continue;
    }
    out.push(fullPath);
  }
}

/**
 * `//` 주석과 블록 주석을 비우되 개행은 모두 보존하므로, 보고된 줄 번호가
 * 디스크의 파일과 계속 일치한다.
 *
 * 문자열 리터럴은 그 안의 `//`가 주석으로 오인되지 않도록 추적만 하고 내용은
 * 그대로 남긴다. 덕분에 원격 자산 검사가 문자열로 적힌 URL을 여전히 볼 수 있다.
 * 작은따옴표와 큰따옴표 문자열은 개행에서 종료되므로, 따옴표 추적이 어긋나도
 * 피해가 한 줄로 제한된다.
 */
function stripComments(source: string): string {
  type Mode = 'code' | 'line' | 'block' | 'single' | 'double' | 'template';
  let mode: Mode = 'code';
  let out = '';
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (mode === 'code') {
      if (char === '/' && next === '/') {
        mode = 'line';
        out += '  ';
        index += 2;
        continue;
      }
      if (char === '/' && next === '*') {
        mode = 'block';
        out += '  ';
        index += 2;
        continue;
      }
      if (char === "'") mode = 'single';
      else if (char === '"') mode = 'double';
      else if (char === '`') mode = 'template';
      out += char;
      index += 1;
      continue;
    }

    if (mode === 'line') {
      if (char === '\n') {
        mode = 'code';
        out += char;
      } else {
        out += ' ';
      }
      index += 1;
      continue;
    }

    if (mode === 'block') {
      if (char === '*' && next === '/') {
        mode = 'code';
        out += '  ';
        index += 2;
        continue;
      }
      out += char === '\n' ? '\n' : ' ';
      index += 1;
      continue;
    }

    // 문자열 리터럴 내부.
    if (char === '\\') {
      out += char;
      if (index + 1 < source.length) {
        out += source[index + 1];
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (char === '\n' && mode !== 'template') {
      mode = 'code';
    } else if (
      (mode === 'single' && char === "'") ||
      (mode === 'double' && char === '"') ||
      (mode === 'template' && char === '`')
    ) {
      mode = 'code';
    }
    out += char;
    index += 1;
  }

  return out;
}

const FILE_PATHS: string[] = [];
collectFiles(SRC_DIR, FILE_PATHS);
FILE_PATHS.sort();

const FILES: readonly SourceFile[] = FILE_PATHS.map((fullPath) => {
  const raw = readFileSync(fullPath, 'utf8');
  return {
    path: relative(REPO_ROOT, fullPath).split(sep).join('/'),
    raw,
    code: stripComments(raw),
  };
});

interface Rule {
  readonly label: string;
  readonly pattern: RegExp;
}

/** 이 프로젝트가 절대 손대서는 안 되는 영속 저장 및 네트워크 API. */
const RUNTIME_RULES: readonly Rule[] = [
  { label: 'localStorage', pattern: /\blocalStorage\b/ },
  { label: 'sessionStorage', pattern: /\bsessionStorage\b/ },
  { label: 'document.cookie', pattern: /\bdocument\s*\.\s*cookie\b/ },
  { label: 'cookieStore', pattern: /\bcookieStore\b/ },
  { label: 'indexedDB', pattern: /\bindexedDB\b/i },
  { label: 'XMLHttpRequest', pattern: /\bXMLHttpRequest\b/ },
  { label: 'sendBeacon', pattern: /\bsendBeacon\b/ },
  { label: 'new WebSocket', pattern: /\bnew\s+WebSocket\b/ },
  { label: 'EventSource', pattern: /\bEventSource\b/ },
  { label: 'fetch(', pattern: /(?<![\w.$])fetch\s*\(/ },
  {
    label: 'global fetch(',
    pattern: /\b(?:window|globalThis|self)\s*\.\s*fetch\s*\(/,
  },
];

/** 쿼리 문자열 상태는 금지다. 실행은 메모리 안에만 존재한다. */
const QUERY_STRING_RULES: readonly Rule[] = [
  { label: 'useSearchParams', pattern: /\buseSearchParams\b/ },
  { label: 'URLSearchParams', pattern: /\bURLSearchParams\b/ },
  { label: 'location.search', pattern: /\blocation\s*\.\s*search\b/ },
];

/**
 * 소스 어디에도 나타나서는 안 되는 어휘.
 *
 * 단어 경계 패턴이며 단순 복수형까지 허용한다. 프로젝트 개요에 어간으로 적힌 두
 * 항목("diagnos", "anticoagul")은 접두사로 일치하고, 두 단위 약어는 독립된 단어로만
 * 일치한다.
 */
const BANNED_VOCABULARY: readonly Rule[] = [
  { label: 'success', pattern: /\bsuccess(?:es|ful|fully)?\b/gi },
  { label: 'failure', pattern: /\bfailures?\b/gi },
  { label: 'safe', pattern: /\bsafe(?:ly|ty|r|st)?\b/gi },
  { label: 'unsafe', pattern: /\bunsafe(?:ly)?\b/gi },
  { label: 'risk', pattern: /\brisk(?:s|y|ier|iest)?\b/gi },
  { label: 'therapeutic', pattern: /\btherapeutics?\b/gi },
  { label: 'dose', pattern: /\bdos(?:e|es|ed|ing)\b/gi },
  { label: 'dosage', pattern: /\bdosages?\b/gi },
  { label: 'patient', pattern: /\bpatients?\b/gi },
  { label: 'clinical', pattern: /\bclinical(?:ly)?\b/gi },
  { label: 'diagnos', pattern: /\bdiagnos\w*/gi },
  // 접두사로 일치시켜서 "treat"뿐 아니라 "treated"/"treatment"까지 함께 잡는다.
  { label: 'treat', pattern: /\btreat\w*/gi },
  { label: 'therapy', pattern: /\btherap(?:y|ies)\b/gi },
  { label: 'disease', pattern: /\bdiseases?\b/gi },
  { label: 'bleeding', pattern: /\bbleeding\b/gi },
  { label: 'thrombosis', pattern: /\bthrombos(?:is|es)\b/gi },
  { label: 'hemophilia', pattern: /\bhemophilia\w*/gi },
  { label: 'anticoagul', pattern: /\banticoagul\w*/gi },
  { label: 'mg', pattern: /\bmg\b/gi },
  { label: 'IU', pattern: /\bIU\b/gi },
];

/**
 * 유일하게 허용된 예외이며, 의도적으로 아주 좁다.
 *
 * 프로젝트 개요는 이 작업을 "non-clinical" 시각화로 설명하도록 요구하므로, 정확히
 * 그 하이픈 복합어만 허용한다. 그 밖에는 아무것도 허용하지 않는다. "부정어가
 * 앞에 오면 통과" 같은 일반적인 예외 통로를 두면 "no risk"나 "not unsafe" 같은
 * 표현까지 함께 봐주게 되는데, 그런 표현이야말로 이 검사가 막으려는 대상이다.
 */
const ALLOWED_COMPOUND = /non-$/i;

function isAllowedUse(
  line: string,
  matchIndex: number,
  label: string,
): boolean {
  return label === 'clinical' && ALLOWED_COMPOUND.test(line.slice(0, matchIndex));
}

function scan(
  files: readonly SourceFile[],
  rules: readonly Rule[],
  which: 'raw' | 'code',
  allowExceptions = false,
): string[] {
  // 한 번만 컴파일한다. 이 검사는 모든 파일의 모든 줄을 훑는다.
  const compiled = rules.map((rule) => ({
    label: rule.label,
    pattern: new RegExp(
      rule.pattern.source,
      `${rule.pattern.flags.replace(/g/g, '')}g`,
    ),
  }));

  const violations: string[] = [];
  for (const file of files) {
    const lines = (which === 'raw' ? file.raw : file.code).split('\n');
    lines.forEach((line, lineIndex) => {
      for (const { label, pattern } of compiled) {
        pattern.lastIndex = 0;
        let match = pattern.exec(line);
        while (match !== null) {
          if (!allowExceptions || !isAllowedUse(line, match.index, label)) {
            violations.push(
              `${file.path}:${lineIndex + 1}: "${match[0]}" (${label})`,
            );
          }
          match = pattern.exec(line);
        }
      }
    });
  }
  return violations;
}

function report(title: string, violations: readonly string[]): string {
  return `${title}\n${violations.slice(0, 40).join('\n')}${
    violations.length > 40 ? `\n…그리고 ${violations.length - 40}건 더` : ''
  }`;
}

describe('저장소 정책 검사 범위', () => {
  it('납득할 만한 수의 소스 파일을 훑는다', () => {
    expect(
      FILES.length,
      `${SRC_DIR}에서 ${FILES.length}개 파일만 검사했다. 순회가 망가졌을 가능성이 크다.`,
    ).toBeGreaterThan(20);
  });

  it('실제 내용을 읽고 테스트 스위트 자체는 건너뛴다', () => {
    expect(FILES.map((file) => file.path)).toContain('src/simulation/engine.ts');
    expect(FILES.map((file) => file.path)).toContain('src/store/simulationStore.ts');
    for (const file of FILES) {
      expect(file.path.startsWith('src/tests/')).toBe(false);
      expect(file.raw.length, `${file.path}이(가) 비어 있다`).toBeGreaterThan(0);
    }
  });

  it('줄 번호나 문자열 리터럴을 잃지 않고 주석을 비운다', () => {
    const sample = [
      'const a = 1; // localStorage',
      '/* localStorage',
      '   still a comment */',
      "const b = 'https://example.invalid';",
    ].join('\n');
    const stripped = stripComments(sample);

    expect(stripped.split('\n')).toHaveLength(4);
    expect(stripped).not.toMatch(/localStorage/);
    expect(stripped).toMatch(/https:\/\/example\.invalid/);
  });
});

describe('브라우저 저장소나 네트워크 API 없음', () => {
  it('실행 코드에서 영속 저장이나 임의 네트워크 API를 참조하지 않는다', () => {
    // Mol* adapter의 fetch는 타입이 제한된 same-origin /structures fixture 한 곳만 읽는다.
    const files = FILES.filter(
      (file) => file.path !== 'src/rendering/molstar/MolStarSimulationAdapter.ts',
    );
    const violations = scan(files, RUNTIME_RULES, 'code');
    expect(violations, report('금지된 런타임 API 사용:', violations)).toEqual(
      [],
    );
  });
});

describe('쿼리 문자열 상태 없음', () => {
  it('URL 쿼리 문자열을 읽지도 쓰지도 않는다', () => {
    const violations = scan(FILES, QUERY_STRING_RULES, 'code');
    expect(violations, report('쿼리 문자열 상태 발견:', violations)).toEqual([]);
  });
});

describe('원시 HTML 주입 없음', () => {
  it('dangerouslySetInnerHTML을 절대 쓰지 않는다', () => {
    const violations = scan(
      FILES,
      [{ label: 'dangerouslySetInnerHTML', pattern: /dangerouslySetInnerHTML/ }],
      'raw',
    );
    expect(violations, report('원시 HTML 주입 발견:', violations)).toEqual([]);
  });
});

describe('원격 자산 정책', () => {
  it('실행 자산 URL은 로컬이며 절대 URL은 중앙 provenance registry에만 있다', () => {
    const files = FILES.filter(
      (file) => file.path !== 'src/molecules/StructureRegistry.ts' && file.path !== 'src/molecules/types.ts',
    );
    const violations = scan(
      files,
      [{ label: 'absolute URL', pattern: /https?:\/\/\S*/ }],
      'raw',
    );
    expect(
      violations,
      report(
        '중앙 structure provenance registry 밖에서 절대 URL 발견:',
        violations,
      ),
    ).toEqual([]);
  });
});

describe('금칙 어휘 없음', () => {
  it('모든 소스 파일에 진료 관련 어휘나 결과 판정 어휘가 없도록 유지한다', () => {
    const violations = scan(FILES, BANNED_VOCABULARY, 'raw', true);
    expect(
      violations,
      report(
        '금칙 어휘 발견. 프로젝트 개요의 중립적 표현으로 바꿀 것\n(예: "network activity", "activation intensity", "abstract role", "handled"):',
        violations,
      ),
    ).toEqual([]);
  });

  it('위반이 있으면 실제로 잡아내므로 검사가 헛돌지 않는다', () => {
    const probe: SourceFile = {
      path: 'probe.ts',
      raw: 'const label = "a clinical outcome for a patient";',
      code: '',
    };
    const violations = scan([probe], BANNED_VOCABULARY, 'raw', true);
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });

  it('요구된 "non-clinical" 복합어만 허용한다', () => {
    const probe: SourceFile = {
      path: 'probe.ts',
      raw: 'A fictionalized, non-clinical visualization.',
      code: '',
    };
    expect(scan([probe], BANNED_VOCABULARY, 'raw', true)).toEqual([]);
  });

  it('앞에 붙은 부정어가 다른 금칙어를 봐주게 두지 않는다', () => {
    // "부정어가 앞에 오면 면제" 같은 일반 규칙이었다면 아래 줄들이 그대로
    // 통과했을 것이다. 허용 범위를 의도적으로 좁게 뒀으므로 각 줄이 여전히
    // 위반으로 잡힌다.
    const probes: readonly SourceFile[] = [
      { path: 'a.ts', raw: 'There is no risk here.', code: '' },
      { path: 'b.ts', raw: 'This is not unsafe.', code: '' },
      { path: 'c.ts', raw: 'Never a patient.', code: '' },
      { path: 'd.ts', raw: 'Not a clinical claim.', code: '' },
    ];
    const violations = scan(probes, BANNED_VOCABULARY, 'raw', true);
    expect(
      violations.map((entry) => entry.split(':')[0]),
      report('모든 프로브 줄이 여전히 위반으로 잡혀야 한다:', violations),
    ).toEqual(expect.arrayContaining(['a.ts', 'b.ts', 'c.ts', 'd.ts']));
  });
});
