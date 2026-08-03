'use client';
/**
 * WebGL을 초기화할 수 없을 때 사용하는 DOM 전용 장면 보기.
 *
 * 자리를 채우는 대체물이 아니다. 3D 레이어가 나르는 것과 같은 정보 — 기호, 축약 코드,
 * 라벨, 정규화 수준을 갖춘 모든 노드와 추상 그래프의 전체 엣지 목록 — 를 UI의 나머지
 * 부분이 읽는 것과 같은 조절된 프레임으로 그린다.
 *
 * 여기 있는 모든 수준은 0–1 척도의 무차원 값이다. 막대에는 기호, 축약 코드, 숫자가
 * 함께 붙으므로 색에 의존하는 것은 없다.
 */
import { ENTITY_DEFINITIONS, getEntity } from '@/simulation/entities';
import { formatNormalized, formatPercentOfScale } from '@/simulation/numeric';
import {
  GRAPH_EDGES,
  REACTION_DEFINITIONS,
  REACTION_KIND_LABELS,
} from '@/simulation/reactions';
import type { ReactionKind } from '@/simulation/types';
import { useSimulationStore } from '@/store/simulationStore';

const RELATION_LABELS: Readonly<
  Record<'consumes' | 'produces' | 'catalyzes' | 'inhibits', string>
> = {
  produces: '→ 생성',
  consumes: '⊗ 소모',
  catalyzes: '⇢ 가속',
  inhibits: '⊣ 약화',
};

const KIND_GLYPHS: Readonly<Record<ReactionKind, string>> = {
  activation: '◎',
  binding: '◉',
  conversion: '⟳',
  inhibition: '⊣',
};

/** 소속 엣지별로 묶은 연결선. 모듈을 불러올 때 한 번만 계산한다. */
const EDGE_GROUPS = REACTION_DEFINITIONS.map((reaction) => ({
  reaction,
  edges: GRAPH_EDGES.filter((edge) => edge.reactionId === reaction.id),
}));

export function WebglFallback() {
  const levels = useSimulationStore((state) => state.frame.levels);
  const reactionActivity = useSimulationStore(
    (state) => state.frame.reactionActivity,
  );
  const time = useSimulationStore((state) => state.frame.time);

  return (
    <section
      className="flex h-full w-full flex-col gap-6 overflow-auto rounded-lg border border-line bg-surface-1 p-5"
      aria-labelledby="webgl-fallback-heading"
    >
      <header className="flex flex-col gap-2">
        <h2
          id="webgl-fallback-heading"
          className="font-mono text-sm tracking-wide text-caution uppercase"
        >
          3D 렌더링을 사용할 수 없음
        </h2>
        <p className="max-w-prose text-sm text-ink-1">
          이 브라우저에서 WebGL 컨텍스트를 시작하지 못해 3D 스테이지가 그려지지
          않는다. 추상 네트워크 모델은 계속 돌아가고 아래의 모든 판독값도 실시간으로
          유지되며, 모든 컨트롤이 그대로 동작한다.
        </p>
        <p className="max-w-prose text-xs text-ink-2">
          값은 추상 모델 시간 단위 위에서 0–1 척도의 무차원 숫자다. 현재 모델 시간:{' '}
          {formatNormalized(time, 2)}.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <h3 className="font-mono text-xs tracking-wide text-ink-2 uppercase">
          노드 수준
        </h3>
        <ul className="flex flex-col gap-2">
          {ENTITY_DEFINITIONS.map((definition) => {
            const level = levels[definition.id] ?? 0;
            const percent = Math.round(level * 100);
            return (
              <li
                key={definition.id}
                className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    aria-hidden="true"
                    className="font-mono text-base"
                    style={{ color: definition.color }}
                  >
                    {definition.glyph}
                  </span>
                  <span className="font-mono text-xs text-ink-1">
                    {definition.shortCode}
                  </span>
                  <span className="text-sm text-ink-0">{definition.label}</span>
                  <span className="ml-auto font-mono text-xs text-ink-1">
                    {formatNormalized(level)}
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-sm bg-surface-4"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={1}
                  aria-valuenow={level}
                  aria-valuetext={`${definition.label}, ${formatPercentOfScale(level)}`}
                >
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${percent}%`,
                      backgroundColor: definition.color,
                    }}
                  />
                </div>
                <p className="text-xs text-ink-2">{definition.role}</p>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="font-mono text-xs tracking-wide text-ink-2 uppercase">
          엣지 목록
        </h3>
        <ol className="flex flex-col gap-2">
          {EDGE_GROUPS.map(({ reaction, edges }) => {
            const activity = reactionActivity[reaction.id] ?? 0;
            return (
              <li
                key={reaction.id}
                className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span aria-hidden="true" className="font-mono text-sm text-ink-1">
                    {KIND_GLYPHS[reaction.kind]}
                  </span>
                  <span className="text-sm text-ink-0">{reaction.label}</span>
                  <span className="font-mono text-xs text-ink-2">
                    {REACTION_KIND_LABELS[reaction.kind]}
                  </span>
                  <span className="ml-auto font-mono text-xs text-ink-1">
                    활동도 {formatNormalized(activity)}
                  </span>
                </div>
                <ul className="flex flex-col gap-0.5">
                  {edges.map((edge, index) => (
                    <li
                      key={`${edge.reactionId}-${edge.from}-${edge.to}-${edge.relation}-${index}`}
                      className="font-mono text-xs text-ink-2"
                    >
                      <span aria-hidden="true">{getEntity(edge.from).glyph}</span>{' '}
                      {getEntity(edge.from).shortCode} {RELATION_LABELS[edge.relation]}{' '}
                      {getEntity(edge.to).shortCode}{' '}
                      <span aria-hidden="true">{getEntity(edge.to).glyph}</span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
