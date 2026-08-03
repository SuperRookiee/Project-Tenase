import type { RendererFeatureFlags, SimulationRendererKind } from './types';

export function parseSimulationRenderer(value: unknown): SimulationRendererKind {
  return value === 'legacy-r3f' ? 'legacy-r3f' : 'molstar';
}

export const rendererFeatureFlags: RendererFeatureFlags = {
  simulationRenderer: parseSimulationRenderer(
    process.env.NEXT_PUBLIC_SIMULATION_RENDERER,
  ),
};
