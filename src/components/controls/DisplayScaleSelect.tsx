'use client';

/**
 * 표시 눈금 기준 선택.
 *
 * 파라미터 슬라이더를 0–1 소수로 읽을지, 어떤 기준에 맞춘 정수로 읽을지 고른다.
 * 순전히 입력 편의를 위한 표시 설정이다. 확정되고 저장되는 값은 어느 쪽을 고르든
 * 그대로 0–1 무차원 값이며, 이 기준값에 단위는 없다.
 *
 * 자유 입력 대신 목록으로 두었다. 자유 입력은 "3000"을 타이핑하는 동안 3, 30, 300을
 * 거치는데, 그때마다 화면의 슬라이더가 전부 다시 눈금을 매겨 눈에 거슬린다.
 */
import { DEFAULT_DISPLAY_SCALE } from '@/simulation/numeric';

/** 목록에 올릴 기준값. `null`은 원래대로 0–1 소수 표시다. */
const OPTIONS: readonly { readonly value: number | null; readonly label: string }[] = [
  { value: null, label: '0–1 소수' },
  { value: 100, label: '100 기준' },
  { value: 1000, label: '1000 기준' },
  { value: DEFAULT_DISPLAY_SCALE, label: `${DEFAULT_DISPLAY_SCALE} 기준` },
  { value: 10000, label: '10000 기준' },
];

const OFF = 'off';

export function DisplayScaleSelect({
  id,
  value,
  onChange,
  description,
}: {
  readonly id: string;
  readonly value: number | null;
  readonly onChange: (next: number | null) => void;
  readonly description: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-ink-0">
        표시 눈금 기준
      </label>
      <select
        id={id}
        value={value === null ? OFF : String(value)}
        aria-describedby={`${id}-description`}
        onChange={(event) =>
          onChange(event.target.value === OFF ? null : Number(event.target.value))
        }
        className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink-0"
      >
        {OPTIONS.map((option) => (
          <option key={option.label} value={option.value === null ? OFF : option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p id={`${id}-description`} className="text-[0.7rem] leading-snug text-ink-2">
        {description}
      </p>
    </div>
  );
}
