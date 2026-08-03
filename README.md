# Project Tenase

**추상적이고 가상인 반응 네트워크**를 Mol* 기반 분자 작업공간에서 시각화한
프로젝트다. 응고 캐스케이드의 구조에서 느슨하게, 그리고 오직 시각적으로만 착안했다.

현재 마이그레이션 상태는 **Phase 1–2 완료**다. Mol*이 Simulation의 기본 렌더러이며,
R3F 장면은 `NEXT_PUBLIC_SIMULATION_RENDERER=legacy-r3f` feature flag 뒤에 보존돼 있다.
반응 애니메이션, full event replay, Reaction Explorer와 Molecule Explorer의 Mol* 통합은
후속 Phase 범위이며 이번 상태에는 포함되지 않는다.

---

## ⚠️ 범위 고지 — 이것부터 읽을 것

**개인이 만든 비임상 교육용 시각화다. 생물학이나 의료 모델이 아니라 시각적 시스템
모델이다.**

- 어떤 종류의 의료 조언도 **제공하지 않는다**.
- 무엇의 용량도 계산하거나 권고하지 **않는다**.
- 현실의 결과를 모형화하지 **않으며**, 누구에 대해서도 무엇에 대해서도 예측하지
  않는다.
- 어떤 요법, 시술, 프로토콜, 실험 절차도 기술하거나 제안하지 **않는다**.
- 시뮬레이션 값에는 실제 측정 데이터를 **전혀** 쓰지 않는다. 단, 표시 자산으로는
  출처가 명시된 실험 분자 구조를 사용할 수 있다.
- 생물학적·임상적 정확성을 **주장하지 않는다**.

이 애플리케이션의 모든 양은 **0.0–1.0으로 정규화된 척도의 무차원 교육용 파라미터**다.
농도도, 단위도, 질량도, 반감기도, 판정 기준값도 없다. "시간"은 *추상 모델 시간
단위*로 재며, 이는 현실의 무엇에도 대응하지 않는다.

엔티티 이름(Factor IX, Thrombin, Fibrin 등)은 추상 방향 그래프의 노드를 가리키는
**라벨로만** 쓰인다. 반응 속도 상수는 화면에서 애니메이션이 또렷하게 읽히도록 고른
값이다. 생물학의 무엇에서 유도되지도, 그것에 맞춰 보정되지도, 그것으로 검증되지도
않았다.

인체 생리를 배우고 싶다면 이 프로젝트는 자료가 되지 못한다. 이것은 *활성화 노드와
억제 노드로 이루어진 네트워크가 어떻게 움직이는지*에 관한 대화형 소프트웨어다.

---

## 실제로 하는 일

이 애플리케이션은 데이터 주도의 작은 반응 그래프를 적분하고, 그 결과를 양식화된 3D
장면과 여러 차트로 그린다.

그래프는 다음과 같다.

```
  Factor IX                     ->  Factor IXa      (손상 신호가 열어 준다)
  Factor IXa     + Factor VIIIa ->  Tenase Complex
  Tenase Complex + Factor X     ->  Factor Xa
  Factor Xa      + Prothrombin  ->  Thrombin
  Thrombin       + Fibrinogen   ->  Fibrin

  TFPI                          -|  Factor Xa 경로
  Antithrombin                  -|  활성 Thrombin
```

출력에는 일부러 중립적인 이름을 붙였다. *네트워크 활동도*, *활성화 강도*, *억제
강도*, *Thrombin 모델 신호*, *Fibrin 모델 신호*, *반응 이벤트 수*가 그것이다.

## 현재 UI 구조

- compact top bar는 workspace, 실행 상태, 추상 모델 시간, 선택 엔티티를 공유한다.
- Simulation은 다섯 KPI 아래에 큰 Mol* Canvas3D viewport를 우선 배치한다.
- 데스크톱 context panel은 선택 level과 구조 provenance를 보여 주며, 모델 파라미터는
  필요할 때만 여는 drawer에 있다.
- playback control과 기존 snapshot timeline은 viewport 아래에 그대로 유지된다.
- Canvas 정보는 키보드로 접근 가능한 DOM mirror에도 계속 제공된다.

## Mol* 장면을 읽는 법

Simulation은 번들된 RCSB PDB `6MV4` mmCIF를 지연 로드해 실험 Factor IXa 구조 하나를
실제로 그린다. 반투명 관 경계와 damage band는 Mol* custom shape이고, 아직 curated
구조가 없는 노드는 provenance가 분명한 conceptual marker다. marker나 분자 구조를
선택하면 `MolStarSelectionBridge`가 application selection과 Mol* highlight를 양방향으로
동기화한다.

Phase 1–2에서는 아래 legacy 장면 동작이 feature flag 경로에 남아 있다. Mol*의 반응
event animation으로 옮기는 일은 Phase 3 이후 범위다.

장면은 기존 X축 배치와 가장 잘 맞는 **좌→우 흐름형**을 사용한다. 왼쪽의 vessel damage
및 platelet 표면에서 시작해 개시 → 증폭 → 전파 → Fibrin 형성의 네 구역으로 읽는다.
이 선택은 엔진 그래프를 바꾸지 않고도 전구형/활성형 상태 전환을 가까운 위치와 방향
화살표로 연결할 수 있기 때문이다. 밝은 흐름선은 현재 snapshot의 활성 반응, 흐린 선은
비활성 경로, 끝의 차단 막대는 억제 경로다. Fibrin 가닥은 마지막 구역에서 해당 모델
신호에 맞춰 드러난다.

카메라는 드래그로 회전하고 휠 또는 핀치로 확대한다. `카메라 리셋` 버튼은 전체 흐름이
한 화면에 들어오는 초기 구도로 되돌린다. `카메라 스토리`는 damage → platelet →
Tenase → Factor Xa → Thrombin → Fibrin 순서로 천천히 이동한다. Inspector의
`선택 경로 재생`은 현재 분자의 상류 반응만 따라간다.

### 살아 있는 시각화 계층

- 자유 분자는 결정론적인 다중 파동 목표와 보간된 현재 위치를 사용해 작고 부드러운
  Brownian motion을 한다. 활성 효소는 조금 빠르고 억제자는 느리다.
- 반응 종류마다 짧은 pulse를 사용한다. 활성화는 팽창 고리, 전환은 faceted pulse,
  Thrombin 생성은 확장 wave, 억제는 차단 표식으로 보인다.
- FIXa와 FVIIIa의 결합은 두 형상이 접근·병합한 뒤 Tenase 형상이 안정화되는 순서로
  표시된다.
- damage signal이 커지면 platelet disk가 점진적으로 두꺼워지고 작은 돌기를 펼친다.
  낮아지면 같은 보간 경로로 resting shape에 돌아간다.
- Fibrin은 하나의 고정된 시작점에서 가까운 branch부터 점진적으로 자라며, 신호가
  줄면 geometry를 새로 만들지 않고 부드럽게 밀도와 opacity를 낮춘다.
- 분자 hover는 인접 상호작용을 미리 보여 주고, click은 선택을 고정한다. 선택된 분자의
  모든 상류 반응과 참여 분자는 밝아지고 관련 없는 branch는 흐려진다.

### 색상과 형태 범례

색은 보조 수단일 뿐이며 분류는 형태·glyph·short code로도 반복한다.

| 분류 | 대표 형태 | 상태 표현 |
| --- | --- | --- |
| 비활성 응고 인자 | 부드러운 sphere, box, cone 또는 capsule | 낮은 기본 발광 |
| 활성 인자 / 효소 | faceted octahedron 또는 각진 box | 활동에 따른 제한된 발광 |
| 보조인자 | tetrahedron | `◇` glyph |
| 복합체 | icosahedron | `⬡` glyph |
| 억제자 | torus clamp | `▽`/`▼`, 차단선 `⊣` |
| 구조 생성물 | 연결된 strand network | `✚` glyph |
| platelet / surface | 납작한 disk | `⬢` glyph |

선택된 분자는 이중 고리, 네 개의 눈금과 크기 증가를 함께 사용한다.

## KPI와 Timeline

Factor IX, Factor Xa, Thrombin, Fibrin, inhibition KPI는 모두 엔진이 snapshot에 기록한
`DerivedSignals`를 직접 표시한다. 값은 0–1 무차원 모델 척도이며 농도, 임상 기준값,
안전성이나 치료 성공 여부가 아니다. 차트도 같은 snapshot ring을 입력으로 쓴다.

Timeline은 단순한 UI 시간 표시가 아니라 수준, derived signal, 반응 활동도를 담은 실제
snapshot을 복원한다. 상태는 `Live`, `일시정지`, `기록 snapshot 재생`으로 구분되며,
기록을 고르면 진행이 멈춘다. `실시간으로 복귀`는 기록을 보는 동안에만 활성화된다.
snapshot은 최대 600개, 최근 반응 이벤트는 최대 64개로 제한된다.

## 키보드 조작

- `Space`: 재생 / 일시정지
- `S`: 정확히 한 고정 interval 진행
- `R`: 선택한 프리셋으로 reset
- `←` / `→`, `Home` / `End`: Timeline snapshot 이동
- `L`: 실시간 보기로 복귀
- `C`: 전체 카메라 스토리 시작 / 종료
- `Escape`: 분자 선택 해제

모든 단축키에는 같은 기능의 DOM 버튼이 있으며 입력, 슬라이더나 링크에 포커스가 있을
때는 전역 단축키가 개입하지 않는다.

## 실행 방법

Node.js 22 이상이 필요하다.

```bash
npm install
```

```bash
npm run dev
```

그다음 `http://localhost:3000`을 연다.

`npm run verify`는 린트, 타입 검사, 테스트, 프로덕션 빌드를 차례로 실행한다. 개별
단계는 `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`다.

## 아키텍처

```
src/
  app/                     Next.js 앱 라우터 셸, 테마 토큰
  components/
    molstar/               Mol* Simulation viewport lifecycle UI
    controls/              왼쪽 패널 — 슬라이더, 토글, 시나리오 선택
    dashboard/             레이아웃, 실행 제어, 타임라인, 인스펙터, 접근성 미러
    three/                 feature flag 뒤의 legacy React Three Fiber 장면
    charts/                Recharts 신호 차트
  hooks/                   애니메이션 클록, 키보드 컨트롤
  simulation/
    types.ts               공유 계약
    entities.ts            추상 엔티티 레지스트리
    reactions.ts           데이터 주도 반응 그래프
    engine.ts              결정론적 고정 스텝 적분기
    scheduler.ts           의존성이 주입된 애니메이션 클록
    snapshots.ts           이력과 이벤트용 링 버퍼
    particles.ts           입자 예산 배분
    numeric.ts             정규화 값 검증
  presets/                 추상 시나리오 프리셋
  store/                   Zustand 스토어 (메모리 전용)
  molecules/               structure registry, provenance, providers
  rendering/               renderer contract, flags, Mol* adapter, custom shapes
  tests/                   Vitest 스위트
```

시뮬레이션 계층은 순수하며 React, DOM, WebGL과 Mol*에 전혀 의존하지 않는다. 그래서 따로
떼어 놓고 추론하고 테스트할 수 있다. 엔진은 결정론적이다. 같은 설정과 같은 스텝
순서는 언제나 같은 상태를 만들며, 무작위성은 전혀 쓰지 않는다.

### 렌더링과 상태

엔진은 애니메이션 프레임 클록에 맞춰 진행하지만, React 상태는 대략 12Hz로 발행된다.
3D 계층은 자신의 렌더 루프 안에서 엔진의 실시간 상태를 직접 읽으므로, 60Hz 장면이
60Hz React 재렌더링을 일으키지 않는다.

## 데이터와 개인 정보

백엔드가 없다. API 라우트도, 서버 액션도, 분석 도구도, 원격 측정도 없다. 기본
Simulation은 same-origin `/structures/6mv4.cif`만 읽으며 외부 구조를 런타임에 다운로드하지
않는다. 외부 RCSB 주소는 provenance link로만 중앙 registry에 기록한다. 서체 스택은
기기에 이미 있는 폰트에서 해결된다.

**아무것도 저장되지 않는다.** 이 앱은 localStorage, sessionStorage, 쿠키, IndexedDB,
쿼리 문자열 상태를 쓰지 않는다. 모든 시뮬레이션 상태는 페이지가 살아 있는 동안
메모리에만 있으며, 새로 고치면 새 실행이 시작된다. 이 약속은 소스 트리를 훑는
테스트로 강제된다.

## 접근성

- 3D 장면은 라이브 영역을 갖춘 접근성 DOM 텍스트로 그대로 옮겨진다.
- 모든 컨트롤을 키보드로 조작할 수 있고, 단축키는 문서로 정리돼 있다.
- 모션 줄이기 모드를 앱 안에서 쓸 수 있으며, 운영체제 설정도 함께 따른다.
- 의미가 색에만 의존하는 일은 없다. 모든 엔티티는 색과 나란히 기호와 축약 코드를
  갖는다.
- WebGL을 쓸 수 없을 때는 DOM만으로 네트워크 상태 전체를 그리는 대체 화면이 나온다.

## 성능

- Mol*과 619 KB mmCIF fixture는 client에서 viewport가 mount된 뒤에만 지연 로드된다.
- live scene은 curated full structure 하나만 로드하고 나머지는 LOD 0 marker로 표시한다.
- representation registry는 detailed structure를 최대 2개로 제한한다.

- 화면에 보이는 입자 인스턴스는 400개를 넘지 않는다. 순수 배분 함수가 이 상한을
  강제하며 퍼즈 테스트가 이를 검사한다.
- 작은 화면에서는 표시 입자 밀도를 자동으로 낮추며, DPR은 최대 1.75로 제한한다.
- 전반적으로 인스턴스 메시를 쓰고, 렌더 루프 안에서 프레임마다 할당하지 않는다.
- Brownian 위치 보간, platelet 돌기, vessel current, Fibrin branch는 모두 고정 용량
  typed array와 instanced mesh를 재사용한다.
- React 판독값은 약 12Hz로 제한하고, 3D 렌더 루프는 store state를 갱신하지 않는다.
- snapshot과 이벤트는 고정 용량 ring buffer를 사용해 메모리가 무제한 증가하지 않는다.
- WebGL 컨텍스트 손실과 복구를 처리한다.

## 한계

- 적분 방식은 수치적 정교함이 아니라 읽기 쉬움을 골라 채택한 단순한 명시적 고정 스텝
  갱신이다.
- 그래프는 의도적으로 아주 작고 되먹임 엣지가 없다.
- 시나리오 프리셋은 추상적인 출발점일 뿐, 실제로 존재하는 무엇에 관한 시나리오가
  아니다.
- 3D 위치, vessel, damage patch와 입자 형태는 이해를 돕는 공간적 은유이며 실제 해부나
  분자 구조가 아니다.
- WebGL Canvas 내부 텍스트는 접근성 트리에 들어가지 않으므로 별도의 DOM 장면 미러가
  약 2초 간격으로 같은 snapshot을 설명한다.
- 실제 환자 데이터, 생물학적 보정값, 임상 예측, 투약 계산, 저장 또는 전송 기능은 없다.
- 모션 줄이기에서는 Brownian motion과 카메라 스토리를 끄고 pulse·glow를 정적인 상태
  단서로 바꾸지만 선택, replay, Inspector와 모든 모델 제어는 그대로 유지한다.
