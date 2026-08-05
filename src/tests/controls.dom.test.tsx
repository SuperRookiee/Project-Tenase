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

function renderSlider(
  overrides: { value?: number; disabled?: boolean; displayScale?: number } = {},
) {
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
      displayScale={overrides.displayScale}
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

describe('눈금 표시', () => {
  const SCALE = 3000;

  it('두 제어를 정수 공간에서 움직인다', () => {
    renderSlider({ value: 0.15, displayScale: SCALE });

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', String(SCALE));
    expect(slider).toHaveAttribute('step', '1');
    expect(slider).toHaveAttribute('value', '450');

    const numberField = screen.getByRole('spinbutton');
    expect(numberField).toHaveAttribute('min', '0');
    expect(numberField).toHaveAttribute('max', String(SCALE));
    expect(numberField).toHaveAttribute('step', '1');
    expect(numberField).toHaveValue(450);
  });

  it('제어를 더 만들지 않는다', () => {
    // 목록 화면들이 이 컴포넌트를 여러 개 동시에 띄우므로, 역할 조회가 하나로
    // 좁혀지지 않으면 그쪽 테스트가 한꺼번에 무너진다.
    renderSlider({ value: 0.15, displayScale: SCALE });
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
  });

  it('확정값은 여전히 0–1로 알린다', () => {
    const { onChange } = renderSlider({ value: 0.5, displayScale: SCALE });

    fireEvent.change(screen.getByRole('slider'), { target: { value: '450' } });
    expect(onChange).toHaveBeenLastCalledWith(0.15);

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '2100' } });
    expect(onChange).toHaveBeenLastCalledWith(0.7);
  });

  it('양 끝을 정확한 0과 1로 알린다', () => {
    const { onChange } = renderSlider({ value: 0.5, displayScale: SCALE });
    const slider = screen.getByRole('slider');

    fireEvent.change(slider, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith(0);

    fireEvent.change(slider, { target: { value: String(SCALE) } });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it('기준을 넘는 입력을 정규화 값으로 오해하지 않는다', () => {
    // parseNormalized로 갔다면 9999가 1이 되는 것은 같아도, 450이 조용히 1이 됐을 것이다.
    const { onChange } = renderSlider({ value: 0.5, displayScale: SCALE });

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '9999' } });
    expect(onChange).toHaveBeenLastCalledWith(1);

    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '450' } });
    expect(onChange).toHaveBeenLastCalledWith(0.15);
  });

  it.each(['abc', '', 'NaN'])('%o를 입력해도 변경을 알리지 않는다', (raw) => {
    const { onChange } = renderSlider({ value: 0.5, displayScale: SCALE });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: raw } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('보이는 정수와 기준을 함께 읽어 준다', () => {
    renderSlider({ value: 0.15, displayScale: SCALE });

    const valueText = screen.getByRole('slider').getAttribute('aria-valuetext') ?? '';
    expect(valueText).toContain('450');
    expect(valueText).toContain('3000');
    // 비율도 함께 남겨 둔다. 기준이 바뀌어도 뜻이 통하는 유일한 표현이다.
    expect(valueText).toContain('15');
  });

  it('정밀 입력 라벨이 실제 범위를 말한다', () => {
    renderSlider({ value: 0.15, displayScale: SCALE });
    expect(screen.getByRole('spinbutton')).toHaveAccessibleName(/0에서 3000 사이/);
  });

  it('기준을 쓸 수 없으면 0–1 소수 표시로 돌아간다', () => {
    for (const displayScale of [0, 2.5, Number.NaN, -3000]) {
      const { view } = renderSlider({ value: 0.15, displayScale });
      const slider = screen.getByRole('slider');
      expect(slider, `기준 ${displayScale}`).toHaveAttribute('max', '1');
      expect(slider).toHaveAttribute('step', '0.01');
      view.unmount();
    }
  });
});
