'use client';

/**
 * 3D 장면의 접근성 미러.
 *
 * 캔버스는 보조 기술에게 장식일 뿐이며, 이 컴포넌트가 같은 정보를 평범한 문장으로
 * 전달한다. 갱신 주기는 일부러 늦춰 놓았다. 스토어는 초당 열두 번쯤 값을 발행하는데,
 * 그 속도로 읽어 주면 화면 낭독기가 감당하지 못하므로 설명은 매 프레임이 아니라
 * 느린 타이머에 맞춰 다시 만든다.
 *
 * 설명을 그 타이머 안에서 스토어로부터 명령형으로 읽어 오기 때문에, 이 컴포넌트는
 * 발행 주기가 아니라 안내 주기에 맞춰 다시 렌더링된다.
 */
import { useEffect, useState } from 'react';
import { ENTITY_DEFINITIONS } from '@/simulation/entities';
import { getReactionTrace } from '@/simulation/reactionTrace';
import { REACTION_DEFINITIONS, REACTION_KIND_LABELS } from '@/simulation/reactions';
import { formatNormalized, formatPercentOfScale } from '@/simulation/numeric';
import {
  selectDisplayed,
  simulationStore,
  type SimulationStoreState,
} from '@/store/simulationStore';

/** 대략 2초에 한 번씩 안내한다. */
const ANNOUNCE_INTERVAL_MS = 2000;
/** 이 정규화 수준 아래면 노드가 없는 것으로 설명한다. */
const PRESENCE_THRESHOLD = 0.01;
/** 이 정규화 활동도 아래면 엣지가 조용한 것으로 설명한다. */
const ACTIVITY_THRESHOLD = 0.005;

interface SceneDescription {
  readonly lines: readonly string[];
  readonly text: string;
}

function describeMesh(fibrinModelSignal: number): string {
  if (fibrinModelSignal < 0.05) {
    return 'Fibrin 모델 신호가 0에 가까워 장면에 메시가 형성되지 않았다.';
  }
  if (fibrinModelSignal < 0.3) {
    return 'Fibrin 모델 신호가 낮아 메시 가닥이 드문드문 흩어져 그려진다.';
  }
  if (fibrinModelSignal < 0.6) {
    return 'Fibrin 모델 신호가 척도 중간쯤이어서 표시 영역 일부를 메시가 부분적으로 덮는다.';
  }
  if (fibrinModelSignal < 0.85) {
    return 'Fibrin 모델 신호가 높아 표시 영역 대부분을 촘촘한 메시가 덮는다.';
  }
  return 'Fibrin 모델 신호가 척도 최상단에 가까워 메시가 표시 영역을 가득 채운다.';
}

function describeScene(state: SimulationStoreState): SceneDescription {
  const displayed = selectDisplayed(state);
  const lines: string[] = [];

  lines.push(
    displayed.isHistorical
      ? `틱 ${displayed.tick}, ${displayed.time.toFixed(
          2,
        )} 모델 시간 단위의 기록 샘플을 검토하는 중.`
      : `틱 ${displayed.tick}, ${displayed.time.toFixed(
          2,
        )} 모델 시간 단위의 실시간 보기.`,
  );

  if (state.selectedEntityId !== null) {
    const selected = ENTITY_DEFINITIONS.find(
      (definition) => definition.id === state.selectedEntityId,
    );
    const trace = getReactionTrace(state.selectedEntityId);
    lines.push(
      `${selected?.label ?? state.selectedEntityId}이 선택되어 있으며, 상류 반응 ${trace.reactionIds.size}개와 관련 분자 ${trace.entityIds.size}개를 강조한다.`,
    );
  }
  if (state.cameraStoryTarget !== null) {
    lines.push(
      state.cameraStoryTarget === 'full'
        ? '전체 연쇄를 따라가는 카메라 스토리가 재생 중이다.'
        : '선택한 분자의 상류 경로를 따라가는 카메라 재생이 진행 중이다.',
    );
  }

  const damage = state.config.vesselDamageSignal;
  lines.push(
    `추상 손상 신호는 ${formatNormalized(
      damage,
    )}, ${formatPercentOfScale(damage)}로 설정돼 있다. 이 값이 네트워크의 개시 엣지를 연다.`,
  );

  const present: string[] = [];
  const absent: string[] = [];
  const switchedOff: string[] = [];

  for (const definition of ENTITY_DEFINITIONS) {
    if (!state.config.enabled[definition.id]) {
      switchedOff.push(`${definition.glyph} ${definition.shortCode} ${definition.label}`);
      continue;
    }
    const level = displayed.levels[definition.id];
    if (level >= PRESENCE_THRESHOLD) {
      present.push(
        `${definition.glyph} ${definition.shortCode} ${definition.label} ${formatNormalized(
          level,
        )}, ${formatPercentOfScale(level)}`,
      );
    } else {
      absent.push(`${definition.glyph} ${definition.shortCode} ${definition.label}`);
    }
  }

  lines.push(
    present.length > 0
      ? `존재하는 노드: ${present.join('; ')}.`
      : '현재 존재 기준값을 넘는 노드가 없다.',
  );

  if (absent.length > 0) {
    lines.push(`0에 가까운 노드: ${absent.join('; ')}.`);
  }
  if (switchedOff.length > 0) {
    lines.push(`꺼져 있는 노드: ${switchedOff.join('; ')}.`);
  }

  const active = REACTION_DEFINITIONS.map((reaction) => ({
    label: reaction.label,
    kind: reaction.kind,
    strength: displayed.reactionActivity[reaction.id] ?? 0,
  }))
    .filter((entry) => entry.strength > ACTIVITY_THRESHOLD)
    .sort((a, b) => b.strength - a.strength);

  lines.push(
    active.length > 0
      ? `활성 엣지, 세기가 큰 순서: ${active
          .map(
            (entry) =>
              `${entry.label}, ${REACTION_KIND_LABELS[entry.kind]}, 세기 ${formatNormalized(
                entry.strength,
              )}`,
          )
          .join('; ')}.`
      : '지금 측정 가능한 활동을 나르는 엣지가 없다.',
  );

  lines.push(describeMesh(displayed.signals.fibrinModelSignal));
  lines.push(
    `종합 네트워크 활동도는 ${formatNormalized(
      displayed.signals.networkActivity,
    )}, 활성화 강도는 ${formatNormalized(
      displayed.signals.activationIntensity,
    )}, 억제 강도는 ${formatNormalized(
      displayed.signals.inhibitionIntensity,
    )}이다.`,
  );

  return { lines, text: lines.join(' ') };
}

export function SceneTextMirror({ showDetails = true }: { readonly showDetails?: boolean }) {
  const [description, setDescription] = useState<SceneDescription>(() =>
    describeScene(simulationStore.getState()),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handle = window.setInterval(() => {
      const next = describeScene(simulationStore.getState());
      // 문구가 실제로 달라졌을 때만 반영한다. 그래야 조용한 네트워크가 같은 문장을
      // 몇 번이고 다시 안내하지 않는다.
      setDescription((previous) => (previous.text === next.text ? previous : next));
    }, ANNOUNCE_INTERVAL_MS);

    return () => {
      window.clearInterval(handle);
    };
  }, []);

  return (
    <section aria-labelledby="scene-mirror-heading">
      <h2 id="scene-mirror-heading" className="sr-only">
        장면 설명
      </h2>

      {/*
        시각적으로는 숨겨져 있지만 키보드로 접근할 수 있다. 그래서 눈으로 보는
        키보드 사용자도 탭으로 이동해 라이브 영역이 안내하는 것과 같은 텍스트를
        펼쳐 볼 수 있다.
      */}
      <div
        tabIndex={0}
        role="region"
        aria-label="실시간 장면 설명"
        aria-live="polite"
        aria-atomic="false"
        className="sr-only focus:not-sr-only focus:block focus:rounded-lg focus:border focus:border-accent focus:bg-surface-1 focus:p-3 focus:text-sm focus:text-ink-0"
      >
        {description.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      {showDetails ? <details className="rounded-lg border border-line bg-surface-1 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-0">
          장면 설명을 글로 보기
        </summary>
        <p className="mt-2 text-xs text-ink-2">
          3D 장면이 보여 주는 것과 같은 정보를 글로 옮긴 것이다. 읽을 만한 속도를
          유지하려고 대략 2초에 한 번씩 갱신된다.
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-1">
          {description.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details> : null}
    </section>
  );
}
