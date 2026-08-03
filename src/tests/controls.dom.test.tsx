/**
 * `NormalizedSlider` — 패널의 모든 제어가 기반으로 삼는 기본 요소.
 *
 * 여기의 조회는 마크업이 아니라 ARIA 역할을 거치므로, 범위 제어와 정밀 입력용
 * 숫자 필드를 계속 제공하기만 하면 컴포넌트의 스타일이나 구조를 자유롭게 바꿀
 * 수 있다.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NormalizedSlider } from '@/components/controls/NormalizedSlider';

const LABEL = '활성화 강도';

function renderSlider(overrides: { value?: number; disabled?: boolean } = {}) {
  const onChange = vi.fn<(next: number) => void>();
  const view = render(
    <NormalizedSlider
      id="activation-intensity"
      label={LABEL}
      value={overrides.value ?? 0.5}
      onChange={onChange}
      description="0에서 1 사이 척도의 무차원 교육용 파라미터."
      accentColor="#2dd4bf"
      glyph="◆"
      shortCode="IXa"
      disabled={overrides.disabled}
    />,
  );
  return { onChange, view };
}

describe('구조와 접근성', () => {
  it('정규화 척도로 제한된 범위 제어를 노출한다', () => {
    renderSlider();
    const slider = screen.getByRole('slider');

    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '1');
    expect(slider).toHaveAttribute('type', 'range');
  });

  it('보이는 라벨을 범위 제어와 연결한다', () => {
    renderSlider();

    expect(screen.getByText(LABEL)).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveAccessibleName(
      new RegExp(LABEL, 'i'),
    );
  });

  it('숫자 값과 함께 접근성 값 텍스트도 노출한다', () => {
    renderSlider({ value: 0.63 });
    const slider = screen.getByRole('slider');

    const valueText = slider.getAttribute('aria-valuetext');
    expect(valueText, '범위 제어는 aria-valuetext를 노출해야 한다').not.toBeNull();
    expect(valueText ?? '').toMatch(/\S/);
    expect(valueText ?? '').toContain('63');
  });

  it('의미를 색만으로 두지 않고 기호나 축약 코드로 함께 나타낸다', () => {
    const { view } = renderSlider();
    expect(view.container.textContent ?? '').toMatch(/IXa|◆/);
  });

  it('정밀 입력용 숫자 필드를 노출한다', () => {
    renderSlider();
    const numberField = screen.getByRole('spinbutton');

    expect(numberField).toHaveAttribute('min', '0');
    expect(numberField).toHaveAttribute('max', '1');
  });

  it('요청받으면 두 제어를 모두 비활성화한다', () => {
    renderSlider({ disabled: true });
    expect(screen.getByRole('slider')).toBeDisabled();
    expect(screen.getByRole('spinbutton')).toBeDisabled();
  });
});

describe('유효한 입력', () => {
  it('범위 제어가 바뀌면 파싱한 값을 알린다', () => {
    const { onChange } = renderSlider({ value: 0.5 });

    fireEvent.change(screen.getByRole('slider'), { target: { value: '0.42' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(0.42);
  });

  it('숫자 필드가 바뀌면 파싱한 값을 알린다', () => {
    const { onChange } = renderSlider({ value: 0.5 });

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0.25' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(0.25);
  });

  it('경계값 자체도 알린다', () => {
    const { onChange } = renderSlider({ value: 0.5 });
    const slider = screen.getByRole('slider');

    fireEvent.change(slider, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith(0);

    fireEvent.change(slider, { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });
});

describe('유효하지 않은 입력은 무시한다', () => {
  it.each(['abc', '', 'NaN'])(
    '숫자 필드에 %o를 입력해도 변경을 알리지 않는다',
    (raw) => {
      const { onChange } = renderSlider({ value: 0.5 });

      fireEvent.change(screen.getByRole('spinbutton'), { target: { value: raw } });

      expect(
        onChange,
        `사용할 수 없는 입력 ${JSON.stringify(raw)}에 대해 onChange가 호출됐다`,
      ).not.toHaveBeenCalled();
    },
  );

  it('사용할 수 없는 입력 뒤에도 확정된 값을 그대로 둔다', () => {
    const { onChange } = renderSlider({ value: 0.5 });
    const numberField = screen.getByRole('spinbutton');

    fireEvent.change(numberField, { target: { value: 'abc' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(numberField, { target: { value: '0.75' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(0.75);
  });
});
