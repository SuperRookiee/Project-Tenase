'use client';

/**
 * 실행 전체에 적용되는 파라미터.
 *
 * 각각 0–1 무차원 교육용 파라미터다. 어느 것도 무언가의 양이 아니며, 속도 컨트롤은
 * 실제 경과 시간이 아니라 추상 모델 시간의 배율을 조절한다.
 */
import { useSimulationStore } from '@/store/simulationStore';
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection';
import { NormalizedSlider } from './NormalizedSlider';

export function GlobalParameterControls() {
  const vesselDamageSignal = useSimulationStore(
    (state) => state.config.vesselDamageSignal,
  );
  const simulationSpeed = useSimulationStore((state) => state.config.simulationSpeed);

  const setVesselDamageSignal = useSimulationStore(
    (state) => state.setVesselDamageSignal,
  );
  const setSimulationSpeed = useSimulationStore((state) => state.setSimulationSpeed);

  return (
    <CollapsibleSection title="전역 파라미터" defaultOpen>
      <div className="px-4 pt-3">
        <fieldset className="flex flex-col gap-4">
          <legend className="sr-only">전역 파라미터</legend>

          <NormalizedSlider
            id="global-vessel-damage-signal"
            label="관 손상 신호"
            value={vesselDamageSignal}
            onChange={setVesselDamageSignal}
            description="모델 관의 손상 영역에 대한 추상 개시 입력이다. 0이면 개시 엣지가 닫힌 채로 있고 반응망은 조용히 머문다."
          />

          <NormalizedSlider
            id="global-simulation-speed"
            label="시뮬레이션 속도"
            value={simulationSpeed}
            onChange={setSimulationSpeed}
            description="실제 시간이 아니라 추상 모델 시간에 곱해지는 정규화 배율이다. 0이면 실행이 멈추고, 0.25가 기준 속도다."
          />

        </fieldset>
      </div>
    </CollapsibleSection>
  );
}
