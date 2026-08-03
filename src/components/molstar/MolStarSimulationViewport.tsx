'use client';

import { useEffect, useRef, useState } from 'react';
import { getEntity } from '@/simulation/entities';
import type { EntityId } from '@/simulation/types';
import { structureRegistry } from '@/molecules/StructureRegistry';
import { MolStarSelectionBridge } from '@/rendering/MolStarSelectionBridge';
import type { RendererLifecycleState, SimulationRendererAdapter } from '@/rendering/types';
import { getEngine, simulationStore, useSimulationStore } from '@/store/simulationStore';

const QUICK_ENTITIES: readonly EntityId[] = [
  'factorIXa',
  'factorVIIIa',
  'factorX',
  'thrombin',
  'antithrombin',
];

function supportsWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const STATUS_LABELS: Readonly<Record<RendererLifecycleState, string>> = {
  idle: '대기',
  'checking-webgl': 'WebGL 확인',
  initializing: 'Mol* 초기화',
  'loading-structure': '6MV4 구조 로딩',
  ready: 'Mol* 준비됨',
  'context-lost': 'WebGL context 손실',
  error: '렌더러 오류',
};

export function MolStarSimulationViewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<SimulationRendererAdapter | null>(null);
  const bridgeRef = useRef<MolStarSelectionBridge | null>(null);
  const selectedEntityId = useSimulationStore((state) => state.selectedEntityId);
  const running = useSimulationStore((state) => state.running);
  const reducedMotion = useSimulationStore((state) => state.reducedMotion);
  const scrubIndex = useSimulationStore((state) => state.scrubIndex);
  const selectEntity = useSimulationStore((state) => state.selectEntity);
  const setWebglAvailable = useSimulationStore((state) => state.setWebglAvailable);
  const [status, setStatus] = useState<RendererLifecycleState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const mountTarget: HTMLElement = host;
    const controller = new AbortController();
    let active = true;

    async function initialize(): Promise<void> {
      setStatus('checking-webgl');
      setError(null);
      if (!supportsWebgl()) {
        setWebglAvailable(false);
        setStatus('error');
        setError('이 브라우저에서는 WebGL을 사용할 수 없습니다. 시뮬레이션 데이터와 컨트롤은 계속 사용할 수 있습니다.');
        return;
      }
      setWebglAvailable(true);
      setStatus('initializing');
      const { MolStarSimulationAdapter } = await import(
        '@/rendering/molstar/MolStarSimulationAdapter'
      );
      if (!active) return;
      const adapter = new MolStarSimulationAdapter({
        onLifecycle(next) {
          if (!active) return;
          setStatus(next);
          if (next === 'ready') {
            bridgeRef.current?.applicationSelectionChanged(
              simulationStore.getState().selectedEntityId,
            );
          }
        },
        onSelection(entityId) {
          bridgeRef.current?.rendererSelectionChanged(entityId);
        },
      });
      adapterRef.current = adapter;
      bridgeRef.current = new MolStarSelectionBridge(
        {
          select: (id) => adapter.selectEntity(id),
          clear: () => adapter.selectEntity(null),
        },
        (id) => simulationStore.getState().selectEntity(id),
      );
      await adapter.mount(mountTarget, controller.signal);
    }

    void initialize().catch((cause: unknown) => {
      if (!active || controller.signal.aborted) return;
      setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Mol* 렌더러를 초기화하지 못했습니다.');
      adapterRef.current?.dispose();
      adapterRef.current = null;
    });

    return () => {
      active = false;
      controller.abort();
      bridgeRef.current = null;
      adapterRef.current?.dispose();
      adapterRef.current = null;
    };
  }, [attempt, setWebglAvailable]);

  useEffect(() => {
    if (status === 'ready') {
      bridgeRef.current?.applicationSelectionChanged(selectedEntityId);
    }
  }, [selectedEntityId, status]);

  useEffect(() => {
    let lastTimestamp = performance.now();
    let visualTime = getEngine().getState().time;

    const render = (): void => {
      const timestamp = performance.now();
      const deltaSeconds = Math.min(Math.max((timestamp - lastTimestamp) / 1000, 0), 0.1);
      lastTimestamp = timestamp;
      if (document.visibilityState === 'hidden') return;

      const storeState = simulationStore.getState();
      const liveState = getEngine().getState();
      const snapshot =
        storeState.scrubIndex === null
          ? undefined
          : storeState.frame.snapshots[storeState.scrubIndex];

      if (snapshot) {
        visualTime = snapshot.time;
      } else if (storeState.running && !storeState.reducedMotion) {
        // Canvas 합성이 포인터 이벤트에 묶이는 브라우저에서도 모션 위상은 독립적으로
        // 진행한다. 속도 슬라이더는 시각 모션에도 완만하게 반영한다.
        const motionRate = 0.25 + storeState.config.simulationSpeed * 1.75;
        visualTime += deltaSeconds * motionRate;
      }

      adapterRef.current?.updateFrame({
        time: visualTime,
        levels: snapshot?.levels ?? liveState.levels,
        signals: snapshot?.signals ?? liveState.signals,
        reducedMotion: storeState.reducedMotion,
      });
    };

    render();
    const interval = window.setInterval(render, 1000 / 30);
    return () => window.clearInterval(interval);
  }, []);

  const selected = selectedEntityId ? getEntity(selectedEntityId) : null;
  const selectedStructure = selectedEntityId
    ? structureRegistry.resolve(selectedEntityId)
    : null;
  const isReady = status === 'ready';
  const motionActive = isReady && running && scrubIndex === null && !reducedMotion;

  return (
    <figure className="relative h-full min-h-[31rem] overflow-hidden rounded-xl border border-line bg-[#070b12] shadow-[0_22px_80px_rgba(0,0,0,0.28)]">
      <div ref={hostRef} className="molstar-viewport-host absolute inset-0" aria-hidden="true" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black/65 to-transparent p-4">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-accent">
            주 분자 렌더러
          </p>
          <p className="mt-1 text-sm font-semibold text-white">Factor IXa · RCSB 6MV4</p>
          <p className="mt-0.5 text-[0.68rem] text-white/60">실험 X-ray 구조 · 개념적 관 배경</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-semibold backdrop-blur ${isReady ? 'border-accent/40 bg-accent/10 text-accent' : status === 'error' || status === 'context-lost' ? 'border-caution/50 bg-caution/10 text-caution' : 'border-line-strong bg-surface-1/75 text-ink-1'}`}>
            {STATUS_LABELS[status]}
          </span>
          {isReady ? (
            <span className={`rounded-full border px-2 py-1 text-[0.58rem] font-semibold backdrop-blur ${motionActive ? 'border-accent/30 bg-black/55 text-accent' : 'border-white/10 bg-black/55 text-white/45'}`}>
              {motionActive
                ? '● 재생 · 6MV4 자전 · 노드 순환'
                : reducedMotion
                  ? '모션 줄이기 · 정지 자세'
                  : 'Ⅱ 장면 일시정지'}
            </span>
          ) : null}
        </div>
      </div>

      {!isReady ? (
        <div className="absolute inset-0 z-[5] grid place-items-center bg-[#070b12]/92 px-6 text-center backdrop-blur-sm">
          <div className="max-w-md">
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border border-accent/30 bg-accent/10 p-2">
              <div className="h-full w-full animate-spin rounded-full border-2 border-accent border-r-transparent" />
            </div>
            <p className="text-sm font-semibold text-ink-0">{STATUS_LABELS[status]}</p>
            <p className="mt-2 text-xs leading-5 text-ink-2">
              {error ?? 'Mol* Canvas3D와 로컬 실험 구조를 지연 초기화하고 있습니다.'}
            </p>
            {error ? (
              <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-4 rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs font-semibold text-ink-0 hover:bg-surface-3">
                다시 시도
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="absolute inset-x-3 bottom-3 z-10 flex flex-col gap-2 sm:inset-x-4 sm:bottom-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="rounded-lg border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-md">
          <p className="text-[0.6rem] uppercase tracking-[0.16em] text-white/50">선택된 엔티티</p>
          <p className="mt-0.5 text-xs font-semibold text-white">{selected?.label ?? '선택 없음'}</p>
          <p className="mt-0.5 text-[0.62rem] text-white/55">
            {selectedEntityId === null
              ? '전체 장면 · 자유 시점'
              : selectedStructure?.evidence === 'experimental'
              ? `${selectedStructure.accession} · 실험 구조`
              : '명시된 개념 대체 표시'}
          </p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-white/10 bg-black/55 p-1.5 backdrop-blur-md" aria-label="Mol* 분자 선택 브리지">
          <button
            type="button"
            onClick={() => adapterRef.current?.resetCamera()}
            className="whitespace-nowrap rounded-md px-2 py-1.5 text-[0.65rem] font-semibold text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            시점 초기화
          </button>
          <button
            type="button"
            aria-pressed={selectedEntityId === null}
            onClick={() => selectEntity(null)}
            className={`whitespace-nowrap rounded-md px-2 py-1.5 text-[0.65rem] font-semibold transition ${selectedEntityId === null ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/10 hover:text-white'}`}
          >
            선택 해제
          </button>
          {QUICK_ENTITIES.map((id) => {
            const entity = getEntity(id);
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selectedEntityId === id}
                onClick={() => selectEntity(id)}
                className={`whitespace-nowrap rounded-md px-2 py-1.5 text-[0.65rem] font-semibold transition ${selectedEntityId === id ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/10 hover:text-white'}`}
              >
                {entity.shortCode}
              </button>
            );
          })}
        </div>
      </div>

      {isReady ? (
        <div className="pointer-events-none absolute bottom-[4.6rem] left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-[0.6rem] font-medium text-white/55 backdrop-blur-md md:block">
          좌클릭 드래그 회전 · 우클릭/Ctrl+드래그 이동 · 휠 확대/축소
        </div>
      ) : null}

      <figcaption className="sr-only">
        Mol* Canvas3D에 실험 구조 Factor IXa 6MV4, 관 경계 custom shape, 그리고 구조가 배정되지 않은 엔티티의 개념 대체 표식이 표시된다.
      </figcaption>
    </figure>
  );
}
