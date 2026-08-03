import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection';
import { InspectorPanel } from '@/components/dashboard/InspectorPanel';
import { KpiStrip } from '@/components/dashboard/KpiStrip';
import { SceneLegend } from '@/components/dashboard/SceneLegend';
import { SceneTextMirror } from '@/components/dashboard/SceneTextMirror';
import { TimelineScrubber } from '@/components/dashboard/TimelineScrubber';
import { TransportBar } from '@/components/dashboard/TransportBar';
import { DEFAULT_PRESET_ID } from '@/presets/scenarios';
import { simulationStore } from '@/store/simulationStore';

function actions() {
  return simulationStore.getState();
}

beforeEach(() => {
  actions().applyPreset(DEFAULT_PRESET_ID);
  actions().pause();
  actions().setScrubIndex(null);
  actions().selectEntity('thrombin');
  actions().setReducedMotion(false);
  actions().setHoveredEntity(null);
  actions().stopCameraStory();
});

describe('접기 상태', () => {
  it('공용 패널 섹션이 aria-expanded와 내용을 함께 전환한다', () => {
    render(
      <CollapsibleSection title="테스트 섹션">
        <p>접을 수 있는 내용</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole('button', { name: /테스트 섹션/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('접을 수 있는 내용')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('접을 수 있는 내용')).not.toBeInTheDocument();
  });

});

describe('동일한 snapshot을 쓰는 판독값', () => {
  it('KPI는 선택한 역사 snapshot의 신호를 표시한다', () => {
    actions().play();
    for (let index = 0; index < 40; index += 1) actions().advanceFrame(0.1);
    actions().publish();
    actions().setScrubIndex(0);

    render(<KpiStrip />);
    expect(screen.getByText(/선택한 기록 샘플/)).toBeInTheDocument();
    expect(screen.getAllByText('0.00')).toHaveLength(5);
  });

  it('Inspector는 선택된 분자와 같은 store 상태를 표시한다', () => {
    actions().selectEntity('factorIX');
    render(<InspectorPanel />);
    expect(screen.getByRole('heading', { name: 'Factor IX' })).toBeInTheDocument();
    expect(screen.getByText(/현재 선택됨/)).toBeInTheDocument();
    expect(screen.getAllByText('0.70').length).toBeGreaterThan(0);
    expect(screen.getByText(/상류 생산 경로가 없는 시작 노드/)).toBeInTheDocument();
  });

  it('Inspector의 선택 경로 재생과 이벤트 필터가 실제 store에 연결된다', () => {
    render(<InspectorPanel />);
    expect(screen.getByText('Factor IX → Factor IXa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '선택 경로 재생' }));
    expect(simulationStore.getState().cameraStoryTarget).toBe('thrombin');
    expect(screen.getByRole('button', { name: '재생 종료' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '전체' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '활성화' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '억제' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '복합체 형성' })).toBeInTheDocument();
  });

  it('모션 줄이기에서는 선택 경로 카메라 재생을 비활성화한다', () => {
    actions().setReducedMotion(true);
    render(<InspectorPanel />);
    expect(screen.getByRole('button', { name: '선택 경로 재생' })).toBeDisabled();
  });

  it('DOM 장면 미러가 현재 tick과 모델 상태를 텍스트로 제공한다', () => {
    render(<SceneTextMirror />);
    expect(screen.getAllByText(/틱 0/).length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: '실시간 장면 설명' })).toBeInTheDocument();
  });
});

describe('Timeline과 핵심 조작', () => {
  it('Live, Paused, historical replay 상태를 구분한다', () => {
    actions().play();
    for (let index = 0; index < 20; index += 1) actions().advanceFrame(0.1);
    actions().publish();
    actions().pause();
    render(<TimelineScrubber />);
    expect(screen.getByText('일시정지')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('slider', { name: '기록 샘플 위치' }), {
      target: { value: '0' },
    });
    expect(screen.getByText(/^기록 snapshot 재생$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '실시간으로 복귀' })).toBeEnabled();
  });

  it('좁은 화면에서도 필요한 실행 제어가 접근 가능한 이름을 가진다', () => {
    render(<TransportBar />);
    expect(screen.getByRole('button', { name: '재생' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '한 interval 진행' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '네트워크 초기화' })).toBeInTheDocument();
  });

  it('모션 줄이기 설정은 표시 설정과 store에서 같은 값으로 유지된다', () => {
    actions().setReducedMotion(true);
    expect(simulationStore.getState().reducedMotion).toBe(true);
  });
});

describe('범례 접근성', () => {
  it('분류와 선택·억제 상태를 텍스트로 설명한다', () => {
    render(<SceneLegend />);
    fireEvent.click(screen.getByRole('button', { name: /장면 범례/ }));
    expect(screen.getByText('비활성 응고 인자')).toBeInTheDocument();
    expect(screen.getByText(/차단 표식: 억제/)).toBeInTheDocument();
    expect(screen.getByText(/이중 고리: 선택됨/)).toBeInTheDocument();
  });
});
