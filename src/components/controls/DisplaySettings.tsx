'use client';

import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection';
import { MAX_VISIBLE_PARTICLES } from '@/simulation/particles';
import { useSimulationStore } from '@/store/simulationStore';
import { NormalizedSlider } from './NormalizedSlider';

export function DisplaySettings() {
  const particleDensity = useSimulationStore((state) => state.config.particleDensity);
  const reducedMotion = useSimulationStore((state) => state.reducedMotion);
  const setParticleDensity = useSimulationStore((state) => state.setParticleDensity);
  const setReducedMotion = useSimulationStore((state) => state.setReducedMotion);

  return (
    <CollapsibleSection title="표시 설정" defaultOpen={false}>
      <div className="px-4 pt-3">
        <fieldset className="flex flex-col gap-4">
          <legend className="sr-only">표시 설정</legend>
          <NormalizedSlider
            id="display-particle-density"
            label="입자 밀도"
            value={particleDensity}
            onChange={setParticleDensity}
            description={`장면의 표시 밀도만 바꾼다. 엔진 계산에는 영향을 주지 않으며 전체 입자는 ${MAX_VISIBLE_PARTICLES}개를 넘지 않는다.`}
          />
          <div className="flex items-start gap-2 border-t border-line pt-3">
            <input
              id="display-reduced-motion"
              type="checkbox"
              checked={reducedMotion}
              aria-describedby="display-reduced-motion-description"
              onChange={(event) => setReducedMotion(event.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 cursor-pointer accent-accent"
            />
            <span className="flex flex-col gap-0.5">
              <label
                htmlFor="display-reduced-motion"
                className="cursor-pointer text-xs font-semibold text-ink-0"
              >
                모션 줄이기
              </label>
              <span
                id="display-reduced-motion-description"
                className="text-[0.7rem] leading-snug text-ink-2"
              >
                입자 표류, 맥동과 카메라 감속을 멈춘다. 운영체제 설정도 함께 따른다.
              </span>
            </span>
          </div>
        </fieldset>
      </div>
    </CollapsibleSection>
  );
}
