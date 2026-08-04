# Project Tenase

응고 캐스케이드의 모양만 빌려온 가상의 반응 네트워크를 Mol* 위에서 굴려 보는 개인
프로젝트다. Factor IX, Thrombin 같은 이름은 방향 그래프의 노드에 붙인 라벨일 뿐이고,
모든 값은 0~1 무차원이며 반응 속도 상수는 화면에서 애니메이션이 잘 읽히도록 손으로
고른 숫자다.

Mol* 마이그레이션은 Phase 1–2까지 왔다. Simulation 워크스페이스의 기본 렌더러가
Mol*이고, 예전 React Three Fiber 장면은 `NEXT_PUBLIC_SIMULATION_RENDERER=legacy-r3f`로
켤 수 있게 남겨 뒀다. 반응 event animation, 전체 replay, Molecule Explorer의 표현
컨트롤은 아직 안 붙었다.

설계 배경과 계층별 상세는 [docs/](docs/)에 영문으로 정리해 뒀다.

## 반응 그래프

13개 노드에 7개 반응이 걸린 작은 그래프를 고정 스텝으로 적분한다.

```
  Factor IX                     ->  Factor IXa      (손상 신호가 열어 준다)
  Factor IXa     + Factor VIIIa ->  Tenase Complex
  Tenase Complex + Factor X     ->  Factor Xa
  Factor Xa      + Prothrombin  ->  Thrombin
  Thrombin       + Fibrinogen   ->  Fibrin

  TFPI                          -|  Factor Xa 경로
  Antithrombin                  -|  활성 Thrombin
```

출력은 네트워크 활동도, 활성화 강도, 억제 강도, Thrombin 모델 신호, Fibrin 모델 신호,
반응 이벤트 수다. 사용자가 직접 만지는 값은 노드별 공급량, 전역 개시 신호, 속도 배수,
입자 밀도 네 가지고 나머지는 전부 여기서 파생된다.

## 작업공간

상단 바에 워크스페이스 전환, 재생/일시정지, 모델 시간, 선택 엔티티가 모여 있다.
`⌘K`(윈도우는 `Ctrl+K`)로 명령 팔레트를 열면 워크스페이스·분자·반응을 한 번에 검색해
바로 이동할 수 있다. Simulation 외 세 워크스페이스는 `next/dynamic`으로 나눠 받는다.

**시뮬레이션** — KPI 다섯 장 아래에 Mol* Canvas3D viewport가 크게 놓이고, 데스크톱에서는
오른쪽에 선택 level과 구조 provenance 패널이 붙는다. 모델 파라미터 슬라이더는 상시
노출 대신 `모델 설정` drawer 안에 있다. viewport 아래로 playback control과 snapshot
timeline, 그리고 키보드로 접근 가능한 DOM mirror가 이어진다.

**반응 탐색기** — 엔진 이벤트와 snapshot을 `buildAnalysisEvents`가 활성화 / 결합 /
복합체 형성 / 해리 / 억제 / 감쇠 / 반응 일곱 종류로 재해석해 타임라인으로 보여 준다.
해리와 감쇠는 엔진이 따로 뱉는 이벤트가 아니라 snapshot 사이의 실제 수준 하락을 읽어
만든 것이고, 시뮬레이션 수치에는 영향을 주지 않는다. 이벤트를 고르고 `선택 반응 재생`을
누르면 해당 snapshot으로 스크럽한 뒤 Simulation으로 넘어가 카메라가 그 노드를 잡는다.

**분자 탐색기** — 노드별 도메인, 활성 부위, 참여 복합체를 `StructureRegistry`에서 읽어
보여 준다. 구조 뷰포트 자리는 아직 비어 있다. Phase 1–2에서는 Mol* context를 Simulation
쪽에만 띄우기 때문이고, 표현 방식 조절과 도메인 선택은 Phase 5 몫이다.

**지식 자료** — 연쇄 흐름 요약, 분자 사전, 반응 설명, 용어 사전. 항목을 누르면 해당
분자나 반응이 열린 상태로 다른 워크스페이스로 넘어간다.

## Mol* 장면 읽는 법

Simulation은 번들해 둔 RCSB PDB `6MV4` mmCIF를 지연 로드해서 실험 Factor IXa 구조 하나를
실제로 그린다. 반투명 관 경계와 damage band는 Mol* custom shape이고, 아직 curated 구조가
없는 노드는 provenance가 분명하게 표시된 conceptual marker로 대신한다. marker나 분자를
선택하면 `MolStarSelectionBridge`가 application selection과 Mol* highlight를 양방향으로
동기화한다.

카메라는 드래그로 회전하고 휠이나 핀치로 확대한다. `카메라 리셋`은 전체 흐름이 한 화면에
들어오는 초기 구도로 돌아가고, `카메라 스토리`는 damage → platelet → Tenase → Factor Xa
→ Thrombin → Fibrin 순으로 천천히 훑는다.

### legacy R3F 장면

feature flag를 켜면 나오는 예전 Three.js 장면이다. Mol*로 옮기지 못한 동작들이 아직
여기 남아 있다.

장면은 왼쪽 vessel damage와 platelet 표면에서 시작해 개시 → 증폭 → 전파 → Fibrin 형성
네 구역으로 좌에서 우로 읽힌다. 엔진 그래프를 건드리지 않고도 전구형/활성형 전환을
위치와 화살표로 이을 수 있어서 이렇게 잡았다. 밝은 흐름선이 현재 snapshot의 활성 반응,
흐린 선이 비활성 경로, 끝의 차단 막대가 억제 경로다.

- 자유 분자는 결정론적 다중 파동 목표를 보간해 작게 흔들린다. 활성 효소는 조금 빠르고
  억제자는 느리다.
- 반응 종류마다 짧은 pulse가 다르다. 활성화는 팽창 고리, 전환은 faceted pulse, Thrombin
  생성은 확장 wave, 억제는 차단 표식.
- FIXa와 FVIIIa 결합은 두 형상이 다가가 합쳐진 뒤 Tenase 형상이 자리 잡는 순서로 보인다.
- damage signal이 커지면 platelet disk가 두꺼워지며 돌기를 펼치고, 낮아지면 같은 경로로
  돌아간다.
- Fibrin은 고정된 시작점에서 가까운 branch부터 자라고, 신호가 줄면 geometry를 새로 만들지
  않고 밀도와 opacity만 낮춘다.
- hover는 인접 상호작용 미리보기, click은 선택 고정. 선택된 분자의 상류 반응과 참여
  분자가 밝아지고 나머지는 흐려진다.

### 색상과 형태 범례

색은 보조 수단이고 분류는 형태·glyph·short code로 한 번 더 반복한다.

| 분류 | 대표 형태 | 상태 표현 |
| --- | --- | --- |
| 비활성 응고 인자 | 부드러운 sphere, box, cone 또는 capsule | 낮은 기본 발광 |
| 활성 인자 / 효소 | faceted octahedron 또는 각진 box | 활동에 따른 제한된 발광 |
| 보조인자 | tetrahedron | `◇` glyph |
| 복합체 | icosahedron | `⬡` glyph |
| 억제자 | torus clamp | `▽`/`▼`, 차단선 `⊣` |
| 구조 생성물 | 연결된 strand network | `✚` glyph |
| platelet / surface | 납작한 disk | `⬢` glyph |

선택된 분자는 이중 고리, 네 개의 눈금, 크기 증가를 함께 쓴다.

## KPI와 타임라인

Factor IX, Factor Xa, Thrombin, Fibrin, inhibition KPI는 엔진이 snapshot에 기록한
`DerivedSignals`를 그대로 보여 주고, 차트도 같은 snapshot ring을 입력으로 쓴다.

타임라인은 UI 시간 표시가 아니라 수준·derived signal·반응 활동도가 다 들어 있는 실제
snapshot을 복원한다. 상태는 `Live`, `일시정지`, `기록 snapshot 재생` 셋이고 기록을 고르면
진행이 멈춘다. `실시간으로 복귀`는 기록을 보는 동안에만 활성화된다. snapshot은 최대
600개, 최근 이벤트는 64개까지 고정 용량 ring buffer에 담긴다.

## 키보드

| 키 | 동작 |
| --- | --- |
| `Space` | 재생 / 일시정지 |
| `S` | 한 스텝 진행 |
| `R` | 선택한 프리셋으로 reset |
| `←` `→` `Home` `End` | 타임라인 snapshot 이동 |
| `L` | 실시간 보기로 복귀 |
| `C` | 카메라 스토리 시작 / 종료 |
| `⌘K` / `Ctrl+K` | 명령 팔레트 |
| `Escape` | 카메라 스토리 중단, 없으면 선택 해제 |

전부 같은 기능의 DOM 버튼이 따로 있고, 입력란이나 슬라이더에 포커스가 있을 때는 전역
단축키가 끼어들지 않는다.

## 실행

Node.js 22 기준으로 개발했다.

```bash
npm install
```

```bash
npm run dev
```

`http://localhost:3000`을 열면 된다.

`npm run verify`가 린트 → 타입 검사 → 테스트 → 프로덕션 빌드를 차례로 돌린다. 현재
13개 파일 222개 테스트가 통과한다. 개별 단계는 `npm run lint`, `npm run typecheck`,
`npm test`, `npm run build`.

## 코드 구조

```
src/
  app/                     Next.js 앱 라우터 셸, 테마 토큰
  analysis/                엔진 이벤트를 분석용 이벤트로 재해석
  components/
    workspaces/            네 개의 작업공간, 명령 팔레트, 상단 내비게이션
    molstar/               Mol* viewport lifecycle UI
    controls/              슬라이더, 토글, 시나리오 선택
    dashboard/             셸, 실행 제어, 타임라인, 인스펙터, 접근성 미러
    three/                 feature flag 뒤의 legacy R3F 장면
    charts/                Recharts 신호 차트
  hooks/                   애니메이션 클록, 키보드 컨트롤
  simulation/
    types.ts               공유 계약
    entities.ts            엔티티 레지스트리
    reactions.ts           데이터 주도 반응 그래프
    engine.ts              결정론적 고정 스텝 적분기
    scheduler.ts           의존성 주입된 애니메이션 클록
    snapshots.ts           이력과 이벤트용 ring buffer
    reactionTrace.ts       상류 경로 / 인접 노드 계산
    particles.ts           입자 예산 배분
    numeric.ts             정규화 값 검증
  presets/                 시나리오 프리셋
  store/                   Zustand 스토어 (메모리 전용)
  molecules/               structure registry, provenance, adapters
  rendering/               renderer contract, flags, Mol* adapter, custom shapes
  tests/                   Vitest 스위트
```

`src/simulation/`은 순수하다. React, DOM, WebGL, Mol* 어디에도 의존하지 않아서 떼어 놓고
테스트할 수 있고, 무작위성을 전혀 안 쓰기 때문에 같은 설정과 같은 스텝 순서는 언제나
같은 상태를 만든다.

엔진은 애니메이션 프레임마다 진행하지만 React 상태는 12Hz 정도로만 발행한다. 3D 계층은
자기 렌더 루프 안에서 엔진 상태를 직접 읽으므로 60Hz 장면이 60Hz 재렌더링을 부르지
않는다.

## 데이터

백엔드가 없다. API 라우트도, 서버 액션도, 분석 도구도, 원격 측정도 없다. Simulation은
same-origin `/structures/6mv4.cif`만 읽고 외부 구조를 런타임에 받아오지 않는다. 외부 RCSB
주소는 provenance link로만 registry에 적어 둔다. 서체는 기기에 이미 있는 폰트에서
해결된다.

저장도 안 한다. localStorage, sessionStorage, 쿠키, IndexedDB, 쿼리 문자열 상태를 전혀
쓰지 않아서 모든 상태는 페이지가 살아 있는 동안 메모리에만 있고 새로 고치면 새 실행이
시작된다. 소스 트리를 훑는 테스트가 이걸 강제한다.

## 접근성

3D 장면은 라이브 영역을 갖춘 DOM 텍스트로 그대로 옮겨진다. canvas 자체는
`aria-hidden`이고, 장면에서 할 수 있는 일은 전부 키보드로 조작 가능한 DOM 컨트롤로도
할 수 있다. 의미가 색에만 의존하는 곳은 없어서 모든 엔티티가 색과 나란히 기호와 축약
코드를 갖는다. 모션 줄이기는 앱 안에서 켤 수 있고 운영체제 설정도 따라간다. WebGL을 못
쓰는 환경에서는 DOM만으로 네트워크 상태를 전부 그리는 대체 화면이 나온다.

## 성능

Mol*과 605 KB mmCIF는 viewport가 mount된 뒤 client에서만 지연 로드한다. live scene은
curated full structure 하나만 올리고 나머지는 LOD 0 marker로 처리하며, representation
registry가 detailed structure를 최대 2개로 제한한다.

legacy 장면 쪽은 화면에 보이는 입자 인스턴스를 400개로 묶어 뒀다. 순수 배분 함수가 이
상한을 강제하고 퍼즈 테스트가 확인한다. 작은 화면에서는 입자 밀도를 자동으로 낮추고
DPR은 1.75까지만 올린다. Brownian 위치 보간, platelet 돌기, vessel current, Fibrin branch는
전부 고정 용량 typed array와 instanced mesh를 재사용해서 렌더 루프 안에서 프레임마다
할당하지 않는다. WebGL 컨텍스트 손실과 복구도 처리한다.

## 아쉬운 점

- 적분은 수치적으로 정교한 방식이 아니라 읽기 쉬운 명시적 고정 스텝 갱신이다.
- 그래프가 아주 작고 되먹임 엣지가 없다.
- 3D 위치, vessel, damage patch, 입자 형태는 공간적 은유일 뿐이다.
- Molecule Explorer의 구조 뷰포트가 아직 비어 있다.
- Mol* 쪽에는 반응 event animation이 없어서, 그 표현은 legacy 장면에만 남아 있다.
- WebGL canvas 안의 텍스트는 접근성 트리에 안 들어가서, 별도 DOM mirror가 약 2초 간격으로
  같은 snapshot을 다시 설명한다.
- 모션 줄이기에서는 Brownian motion과 카메라 스토리를 끄고 pulse·glow를 정적인 단서로
  바꾼다. 선택, replay, Inspector, 모델 제어는 그대로다.
