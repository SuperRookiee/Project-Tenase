'use client';
/**
 * 3D 스테이지.
 *
 * 접근성 접근 방식 (하나의 일관된 선택을 여기에 적어 둔다)
 * ------------------------------------------------------------
 * 캔버스 래퍼에는 `aria-hidden="true"`가 붙어 있고 자체 role은 전혀 없다. 따라서
 * 보조 기술이 그림을 해석해야 할 일이 없다. 장면의 전체 상태는 `SceneTextMirror`가
 * 실시간 텍스트로 발행하고, 눈으로 보는 사용자를 위해서는 스테이지 바로 아래에
 * 설명이 붙는다. 캔버스 안의 어떤 것도 특정 정보에 이르는 유일한 경로가 아니며,
 * 장면이 지원하는 모든 상호작용은 키보드로 조작할 수 있는 DOM 컨트롤로도 존재한다.
 *
 * WebGL 정책
 * ----------
 * 지원 여부는 이펙트 안에서 일회용 캔버스로 확인한다. 그래서 서버 렌더링은 건드리지
 * 않고, 지원이 확인된 뒤에만 `<Canvas>`를 마운트한다. 컨텍스트 손실은 붙잡아 DOM에
 * 알리며, 멈춘 그림을 그대로 두지 않는다.
 *
 * 이 장면은 어떤 원격 자원도 불러오지 않는다. 환경 맵도, 텍스처도, 폰트도, 모델
 * 파일도 없다.
 */
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import { Canvas, type RootState } from '@react-three/fiber';
import { AdaptiveDpr, OrbitControls } from '@react-three/drei';
import { useSimulationStore } from '@/store/simulationStore';
import { SceneLegend } from '@/components/dashboard/SceneLegend';
import { CinematicCamera } from './CinematicCamera';
import { FibrinNetwork } from './FibrinNetwork';
import { FlowGuides } from './FlowGuides';
import { ParticleField } from './ParticleField';
import { PlateletSurfaces } from './PlateletSurfaces';
import { ReactionPulses } from './ReactionPulses';
import { SelectionMarker } from './SelectionMarker';
import { VesselEnvironment } from './VesselEnvironment';
import { VesselCurrent } from './VesselCurrent';
import { WebglFallback } from './WebglFallback';

const DPR: [number, number] = [1, 1.75];
const GL_PROPS = { antialias: true, powerPreference: 'high-performance' } as const;
const CAMERA_PROPS = {
  position: [0.2, 4.4, 13.8] as [number, number, number],
  fov: 40,
  near: 0.1,
  far: 80,
};
const ORBIT_TARGET: [number, number, number] = [0, -0.3, 0];
const BACKGROUND = '#05070d';

/**
 * 일회용 캔버스로 WebGL을 확인한다. 서버 렌더링 중에는 절대 호출되지 않는다.
 */
function detectWebglSupport(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    const context =
      probe.getContext('webgl2') ??
      probe.getContext('webgl') ??
      null;
    return context !== null;
  } catch {
    return false;
  }
}

export function SceneCanvas() {
  const webglAvailable = useSimulationStore((state) => state.webglAvailable);
  const setWebglAvailable = useSimulationStore((state) => state.setWebglAvailable);
  const reducedMotion = useSimulationStore((state) => state.reducedMotion);
  const cameraStoryTarget = useSimulationStore((state) => state.cameraStoryTarget);
  const startCameraStory = useSimulationStore((state) => state.startCameraStory);
  const stopCameraStory = useSimulationStore((state) => state.stopCameraStory);
  const setHoveredEntity = useSimulationStore((state) => state.setHoveredEntity);
  const [contextLost, setContextLost] = useState(false);
  const detachRef = useRef<(() => void) | null>(null);
  const controlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  useEffect(() => {
    setWebglAvailable(detectWebglSupport());
  }, [setWebglAvailable]);

  // 리스너는 `onCreated`에서 붙이고, 언마운트될 때 여기서 정리한다.
  useEffect(
    () => () => {
      detachRef.current?.();
      detachRef.current = null;
    },
    [],
  );

  const handleCreated = useCallback((state: RootState) => {
    detachRef.current?.();

    const element = state.gl.domElement;
    const handleLost = (event: Event) => {
      // 기본 동작을 막으면 브라우저가 복구를 시도할 수 있다.
      event.preventDefault();
      setContextLost(true);
    };
    const handleRestored = () => {
      setContextLost(false);
    };

    element.addEventListener('webglcontextlost', handleLost);
    element.addEventListener('webglcontextrestored', handleRestored);
    detachRef.current = () => {
      element.removeEventListener('webglcontextlost', handleLost);
      element.removeEventListener('webglcontextrestored', handleRestored);
    };
  }, []);

  return (
    <figure className="flex w-full min-w-0 flex-col gap-2">
      <div className="relative h-[52vh] min-h-96 overflow-hidden rounded-lg border border-line bg-surface-0 lg:h-[min(58vh,44rem)] lg:min-h-[32rem]">
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 grid grid-cols-4 gap-1" aria-label="응고 흐름 단계">
          {['1 개시', '2 증폭', '3 전파', '4 Fibrin 형성'].map((phase, index) => (
            <div key={phase} className="flex items-center gap-1 rounded bg-surface-1/80 px-2 py-1 text-[0.62rem] font-semibold text-ink-1 backdrop-blur-sm">
              <span className="truncate">{phase}</span>
              {index < 3 ? <span aria-hidden="true" className="ml-auto text-accent">→</span> : null}
            </div>
          ))}
        </div>
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              stopCameraStory();
              controlsRef.current?.reset();
            }}
            className="rounded border border-line-strong bg-surface-1/90 px-2.5 py-1.5 text-xs font-semibold text-ink-0 backdrop-blur-sm hover:bg-surface-2"
            aria-label="3D 카메라를 초기 시점으로 재설정"
          >
            카메라 리셋
          </button>
          <button
            type="button"
            disabled={reducedMotion}
            aria-pressed={cameraStoryTarget !== null}
            onClick={() =>
              cameraStoryTarget === null
                ? startCameraStory('full')
                : stopCameraStory()
            }
            className="rounded border border-accent-dim bg-accent-dim/30 px-2.5 py-1.5 text-xs font-semibold text-ink-0 backdrop-blur-sm hover:bg-accent-dim/50 disabled:cursor-not-allowed disabled:opacity-50"
            title={reducedMotion ? '모션 줄이기 상태에서는 카메라 스토리를 사용하지 않는다.' : undefined}
          >
            {cameraStoryTarget === null ? '카메라 스토리' : '스토리 종료'}
          </button>
        </div>
        {webglAvailable === null ? (
          <p className="flex h-full w-full items-center justify-center p-6 text-sm text-ink-2">
            이 브라우저가 3D 스테이지를 그릴 수 있는지 확인하는 중…
          </p>
        ) : null}

        {webglAvailable === false ? <WebglFallback /> : null}

        {webglAvailable === true ? (
          <div className="h-full w-full" aria-hidden="true">
            <Canvas
              dpr={DPR}
              gl={GL_PROPS}
              camera={CAMERA_PROPS}
              performance={{ min: 0.5 }}
              onCreated={handleCreated}
              onPointerMissed={() => setHoveredEntity(null)}
            >
              <color attach="background" args={[BACKGROUND]} />
              <fog attach="fog" args={[BACKGROUND, 12, 34]} />

              <ambientLight intensity={0.62} />
              <directionalLight
                position={[6, 9, 7]}
                intensity={1.45}
                color="#dbeafe"
              />
              <pointLight
                position={[-7, -5, -6]}
                intensity={45}
                distance={34}
                decay={2}
                color="#2dd4bf"
              />

              <Suspense fallback={null}>
                <VesselEnvironment />
                <VesselCurrent />
                <PlateletSurfaces />
                <FlowGuides />
                <FibrinNetwork />
                <ParticleField />
                <ReactionPulses />
                <SelectionMarker />
              </Suspense>

              <OrbitControls
                ref={controlsRef}
                makeDefault
                regress
                autoRotate={false}
                enabled={cameraStoryTarget === null}
                enablePan={false}
                enableDamping={!reducedMotion}
                dampingFactor={0.08}
                rotateSpeed={0.55}
                zoomSpeed={0.7}
                minDistance={4.5}
                maxDistance={24}
                target={ORBIT_TARGET}
              />
              <CinematicCamera
                target={cameraStoryTarget}
                controlsRef={controlsRef}
              />
              <AdaptiveDpr pixelated={false} />
            </Canvas>
          </div>
        ) : null}

        {webglAvailable === true && contextLost ? (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-0/85 p-6">
            <p className="max-w-prose text-center text-sm text-caution">
              브라우저가 3D 렌더링 컨텍스트를 놓아주었다. 반응망 모델은 계속
              돌아가고 모든 판독값도 실시간으로 유지된다. 컨텍스트가 돌아오는 즉시
              스테이지는 스스로 다시 그려진다.
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.7rem] text-ink-2">
        <p>드래그: 회전 · 휠/핀치: 확대 · 카메라 스토리: 연쇄 자동 탐색</p>
        <p>밝은 화살표는 현재 활성 반응, 흐린 선은 비활성 경로다.</p>
      </div>

      <SceneLegend />

      <figcaption className="text-xs text-ink-2">
        좌→우 네 구역은 개시, 증폭, 전파, Fibrin 형성을 나타낸다. 위치·형태·색은
        개념적이며 실제 해부나 분자 구조가 아니다. 같은 상태가 아래 텍스트 설명과
        KPI에도 제공된다.
      </figcaption>
    </figure>
  );
}
