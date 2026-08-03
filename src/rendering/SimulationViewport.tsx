'use client';

import dynamic from 'next/dynamic';
import { SceneCanvas } from '@/components/three/SceneCanvas';
import { rendererFeatureFlags } from './featureFlags';

const MolStarSimulationViewport = dynamic(
  () =>
    import('@/components/molstar/MolStarSimulationViewport').then(
      (module) => module.MolStarSimulationViewport,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full min-h-[30rem] place-items-center bg-[#070b12] text-sm text-ink-2">
        Mol* 렌더러 모듈을 불러오는 중…
      </div>
    ),
  },
);

export function SimulationViewport() {
  return rendererFeatureFlags.simulationRenderer === 'legacy-r3f' ? (
    <SceneCanvas />
  ) : (
    <MolStarSimulationViewport />
  );
}
