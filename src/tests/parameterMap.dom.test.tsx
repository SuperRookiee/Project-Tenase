/**
 * 파라미터 지도 작업공간의 구조와 접근성.
 *
 * 지도 자체는 보조 기술에서 숨겨진 그림이므로, 이 테스트들은 그림이 아니라 그 곁에
 * 놓인 글과 제어를 확인한다. 격자를 줄 단위로 채우는 경로가 실제로 끝까지 돌아
 * 완료를 알리는지, 고른 칸과 고정 설정이 글로 남는지, 보충 입력을 켰을 때 요약이
 * 따라 움직이는지를 본다. 색이나 좌표는 단언하지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ParameterMapWorkspace } from '@/components/workspaces/ParameterMapWorkspace';
import { MAP_RESOLUTION } from '@/simulation/parameterMap';

/** 격자가 다 채워질 때까지 기다린다. 줄마다 애니메이션 프레임을 하나씩 쓴다. */
async function waitForMap(): Promise<void> {
  await waitFor(
    () => {
      expect(screen.getByText(/모두 계산했다/)).toBeInTheDocument();
    },
    { timeout: 15000 },
  );
}

describe('구조와 접근성', () => {
  it('두 축과 결과값을 고르는 제어를 이름으로 노출한다', async () => {
    render(<ParameterMapWorkspace />);

    expect(screen.getByLabelText('가로축')).toHaveValue('factorIX');
    expect(screen.getByLabelText('세로축')).toHaveValue('antithrombin');
    expect(screen.getByLabelText('칠할 결과값')).toHaveValue('finalFibrin');

    await waitForMap();
  });

  it('같은 축을 두 번 고를 수 없게 목록에서 빼 둔다', async () => {
    render(<ParameterMapWorkspace />);

    const xAxis = screen.getByLabelText('가로축');
    const yAxis = screen.getByLabelText('세로축');

    // 세로축이 이미 쓰고 있는 항목은 가로축 목록에 없어야 한다.
    expect(
      within(xAxis).queryByRole('option', { name: 'Antithrombin 공급값' }),
    ).toBeNull();
    expect(within(yAxis).queryByRole('option', { name: 'Factor IX 공급값' })).toBeNull();

    await waitForMap();
  });

  it('지도 그림을 보조 기술에서 숨긴다', async () => {
    const { container } = render(<ParameterMapWorkspace />);
    await waitForMap();

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('칸을 고르는 두 위치 제어에 접근성 값 텍스트를 붙인다', async () => {
    render(<ParameterMapWorkspace />);

    for (const label of ['고른 칸 · 가로 위치', '고른 칸 · 세로 위치']) {
      const control = screen.getByLabelText(label);
      expect(control).toHaveAttribute('type', 'range');
      expect(control.getAttribute('aria-valuetext') ?? '').toMatch(/\S/);
    }

    await waitForMap();
  });
});

describe('격자 채우기', () => {
  it('줄마다 진행 상황을 알리고 끝내 완료를 알린다', async () => {
    const { container } = render(<ParameterMapWorkspace />);

    await waitForMap();

    // 격자 칸에 더해 고른 칸을 표시하는 테두리가 하나 붙는다.
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('rect').length).toBe(
      MAP_RESOLUTION * MAP_RESOLUTION + 1,
    );
  });

  it('축을 바꾸면 지도를 다시 채운다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    fireEvent.change(screen.getByLabelText('가로축'), { target: { value: 'damage' } });

    await waitFor(() => {
      expect(screen.getByLabelText('가로축')).toHaveValue('damage');
    });
    await waitForMap();

    // 축이 바뀌면 고정 설정 목록에서 빠지고 자리를 내준 축이 대신 들어온다.
    // 슬라이더 하나가 범위 제어와 정밀 입력 두 개를 함께 내놓으므로 역할로 좁힌다.
    expect(
      screen.getByRole('slider', { name: /Factor IX 공급값/ }),
    ).toBeInTheDocument();
  });
});

describe('출발점 프리셋', () => {
  /**
   * 공급값 슬라이더는 기본적으로 눈금 기준에 맞춘 정수로 표시된다. 화면에 적힌
   * 숫자를 다시 0–1 모델 값으로 되돌려 확인하므로, 표시 방식을 바꿔도 이 검사가
   * 재는 대상은 그대로 모델 값이다.
   */
  function readSupplySlider(name: RegExp): number {
    const slider = screen.getByRole('slider', { name });
    const shown = Number(slider.getAttribute('value'));
    const max = Number(slider.getAttribute('max'));
    return shown / max;
  }

  it('열릴 때 고정 설정을 프리셋 값으로 채운다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    // 슬라이더가 빈 채로 시작하지 않는다. 기본 프리셋의 값이 들어가 있어야 한다.
    expect(readSupplySlider(/TFPI 공급값/)).toBeCloseTo(0.3, 6);
  });

  it('프리셋을 바꾸면 고정 슬라이더가 따라 움직인다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    fireEvent.change(screen.getByLabelText('출발점 프리셋'), {
      target: { value: 'increased-tfpi-inhibition' },
    });

    await waitFor(() => {
      expect(readSupplySlider(/TFPI 공급값/)).toBeCloseTo(0.85, 6);
    });
    await waitForMap();
  });

  it('슬라이더를 손으로 옮기면 프리셋에서 벗어났다고 알린다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    expect(screen.getByText(/그대로다/)).toBeInTheDocument();

    // 눈금 기준이 3000이므로 2700이 0.9다. 0.9를 그대로 넣으면 반올림되어 1로
    // 확정되는데, 그래도 0.3에서 벗어나기는 하므로 검사가 엉뚱한 이유로 통과한다.
    fireEvent.change(screen.getByRole('slider', { name: /TFPI 공급값/ }), {
      target: { value: '2700' },
    });

    await waitFor(() => {
      expect(screen.getByText(/손으로 옮긴 상태다/)).toBeInTheDocument();
    });
    expect(readSupplySlider(/TFPI 공급값/)).toBeCloseTo(0.9, 6);
    await waitForMap();
  });

  it('눈금 기준을 바꿔도 모델 값은 그대로다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    const scaled = screen.getByRole('slider', { name: /TFPI 공급값/ });
    expect(scaled).toHaveAttribute('value', '900');
    expect(scaled).toHaveAttribute('max', '3000');

    fireEvent.change(screen.getByLabelText('표시 눈금 기준'), {
      target: { value: '1000' },
    });

    await waitFor(() => {
      const rescaled = screen.getByRole('slider', { name: /TFPI 공급값/ });
      expect(rescaled).toHaveAttribute('value', '300');
      expect(rescaled).toHaveAttribute('max', '1000');
    });

    // 요약은 지도가 실제로 돌린 명세에서 값을 읽는다. 표시만 바뀌었으므로 그대로여야 한다.
    const card = screen.getByText('현재 설정 요약').closest('div');
    expect(within(card as HTMLElement).getByText('TFPI 공급값')).toBeInTheDocument();
    expect(
      within(card as HTMLElement).getByText('TFPI 공급값').nextElementSibling,
    ).toHaveTextContent('0.30');
  });

  it('0–1 소수 표시로 되돌릴 수 있다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    fireEvent.change(screen.getByLabelText('표시 눈금 기준'), {
      target: { value: 'off' },
    });

    await waitFor(() => {
      const plain = screen.getByRole('slider', { name: /TFPI 공급값/ });
      expect(plain).toHaveAttribute('max', '1');
      expect(plain).toHaveAttribute('step', '0.01');
    });
  });
});

describe('반감 시간 표시', () => {
  it('대상 노드의 반감 시간을 모델 시간 단위로 적는다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    // 실제 시간으로 읽히지 않도록 언제나 "모델 시간"이라고 밝혀 적어야 한다.
    expect(screen.getByText(/모델 시간 2\.0단위/)).toBeInTheDocument();
    expect(screen.getByText(/실제 시간으로 옮기는\s+환산은 이 프로젝트에 없다/)).toBeInTheDocument();
  });

  it('대상 노드를 바꾸면 반감 시간도 따라 바뀐다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    fireEvent.change(screen.getByLabelText('대상 노드'), {
      target: { value: 'thrombin' },
    });

    await waitFor(() => {
      expect(screen.getByText(/모델 시간 4\.3단위/)).toBeInTheDocument();
    });
  });
});

describe('요약 표', () => {
  it('고른 칸과 고정 설정을 모두 글로 적는다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    // 같은 낱말이 왼쪽 제어에도 쓰이므로 요약 카드 안으로 좁혀서 본다.
    const card = screen.getByText('현재 설정 요약').closest('div');
    expect(card).not.toBeNull();
    const summary = within(card as HTMLElement);

    expect(summary.getByText('가로축')).toBeInTheDocument();
    expect(summary.getByText('세로축')).toBeInTheDocument();
    expect(summary.getByText('칠한 결과값')).toBeInTheDocument();

    // 지도에 오르지 않은 축은 값이 글로 남아야 한다. 그림이 숨겨져 있으므로 이 표가
    // 무엇을 돌렸는지 알 수 있는 유일한 경로다.
    expect(summary.getByText('고정 설정 값')).toBeInTheDocument();
    expect(summary.getByText('TFPI 공급값')).toBeInTheDocument();
    expect(summary.getByText('손상 개시 신호')).toBeInTheDocument();
  });

  it('보충 입력을 켜기 전에는 계획이 없다고 적는다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    const term = screen.getByText('보충 입력');
    expect(term.nextElementSibling).toHaveTextContent('없음');
  });

  it('보충 입력을 켜면 계획을 요약에 적고 지도를 다시 채운다', async () => {
    render(<ParameterMapWorkspace />);
    await waitForMap();

    fireEvent.click(screen.getByLabelText('계획을 지도에 반영'));

    await waitFor(() => {
      expect(screen.getByText('보충 입력').nextElementSibling).not.toHaveTextContent(
        '없음',
      );
    });
    await waitForMap();

    // 기본 계획은 반복 방식이므로 간격과 횟수까지 적힌다.
    expect(screen.getByText('보충 입력').nextElementSibling).toHaveTextContent(/회$/);
  });
});
