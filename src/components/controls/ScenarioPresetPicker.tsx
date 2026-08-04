'use client';

/**
 * 추상 그래프의 출발점 선택.
 *
 * 프리셋은 이름이 붙은 무차원 0–1 슬라이더 위치 묶음, 그 이상이 아니다. 프리셋은
 * 어떤 상태도, 프로토콜도, 인물도 설명하지 않는다. 같은 교육용 반응망의 서로 다른
 * 모양일 뿐이다.
 */
import { SCENARIO_PRESETS, getPreset } from '@/presets/scenarios';
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection';
import { useSimulationStore } from '@/store/simulationStore';

export function ScenarioPresetPicker() {
  const presetId = useSimulationStore((state) => state.presetId);
  const applyPreset = useSimulationStore((state) => state.applyPreset);
  const selected = getPreset(presetId);

  return (
    <CollapsibleSection title="시나리오" defaultOpen>
      <div className="px-4 pt-3">
        <fieldset aria-describedby="scenario-presets-note">
          <legend className="sr-only">시나리오 프리셋</legend>

          <div className="flex flex-col gap-0.5">
            {SCENARIO_PRESETS.map((preset) => {
              const inputId = `scenario-preset-${preset.id}`;
              const isSelected = preset.id === presetId;
              return (
                <span
                  key={preset.id}
                  className={
                    isSelected
                      ? 'flex items-center gap-2 rounded-sm bg-surface-2 px-2 py-1'
                      : 'flex items-center gap-2 rounded-sm px-2 py-1'
                  }
                >
                  <input
                    id={inputId}
                    type="radio"
                    name="scenario-preset"
                    value={preset.id}
                    checked={isSelected}
                    onChange={() => applyPreset(preset.id)}
                    className="size-3.5 shrink-0 cursor-pointer accent-accent"
                  />
                  <label
                    htmlFor={inputId}
                    className={
                      isSelected
                        ? 'cursor-pointer text-xs font-semibold text-ink-0'
                        : 'cursor-pointer text-xs text-ink-1'
                    }
                  >
                    {preset.name}
                  </label>
                </span>
              );
            })}
          </div>

          <p
            id="scenario-presets-note"
            className="mt-2 text-[0.7rem] leading-snug text-ink-2"
          >
            적용 즉시 tick·모델 시간·반응 이력이 초기화된다. 현재 분자 선택은 유지되고,
            타임라인은 최신 실행으로 돌아오며 조정한 슬라이더 값은 프리셋 값으로 바뀐다.
          </p>
        </fieldset>

        <div className="mt-3 rounded-md border border-line bg-surface-2 p-2.5">
          <h4 className="text-xs font-semibold text-ink-0">{selected.name}</h4>
          <dl className="mt-1.5 flex flex-col gap-1.5 text-[0.7rem] leading-snug">
            <div>
              <dt className="font-semibold text-ink-2">무엇이 달라지나</dt>
              <dd className="text-ink-1">{selected.description}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink-2">무엇을 볼까</dt>
              <dd className="text-ink-1">{selected.focus}</dd>
            </div>
          </dl>
        </div>
      </div>
    </CollapsibleSection>
  );
}
