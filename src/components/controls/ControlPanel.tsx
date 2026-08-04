'use client';

/**
 * 왼쪽 컨트롤 영역.
 *
 * 장면과 별개로 스크롤되며, 각 구획마다 고정 제목이 붙는다. 여기 담긴 모든 컨트롤은
 * 가상 반응망을 위한 0–1 무차원 교육용 파라미터다. 이 패널 어디에도 단위는 없다.
 */
import { EntityControls } from './EntityControls';
import { DisplaySettings } from './DisplaySettings';
import { GlobalParameterControls } from './GlobalParameterControls';
import { ScenarioPresetPicker } from './ScenarioPresetPicker';

export function ControlPanel() {
  return (
    <aside
      aria-labelledby="control-panel-heading"
      className="relative flex h-full min-h-0 w-full flex-col overflow-y-auto bg-surface-1"
    >
      <div className="px-4 pt-4 pb-3">
        <h2 id="control-panel-heading" className="text-sm font-semibold text-ink-0">
          반응망 컨트롤
        </h2>
        <p className="mt-1 text-[0.7rem] leading-snug text-ink-2">
          아래 모든 컨트롤은 0–1 무차원 교육용 파라미터다. 단위도, 실제 시간도, 측정값도
          없다.
        </p>
      </div>

      <div className="flex flex-col pb-10">
        <ScenarioPresetPicker />
        <GlobalParameterControls />
        <EntityControls />
        <DisplaySettings />
      </div>
    </aside>
  );
}
