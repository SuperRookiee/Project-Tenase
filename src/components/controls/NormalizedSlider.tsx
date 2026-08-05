'use client';

/**
 * 패널의 모든 컨트롤이 사용하는 단일 정규화 파라미터 프리미티브.
 *
 * 범위 고지
 * ---------
 * 이 값은 0.0–1.0 척도의 무차원 교육용 파라미터다. 측정값이 아니고 단위도 없으며,
 * 이 추상 그래프 바깥의 어떤 것도 설명하지 않는다.
 *
 * 입력 정책
 * ---------
 * 범위 입력과 정밀 입력 숫자 필드는 모두 원시 값을 `parseNormalized`로 흘려보낸다.
 * 범위 안의 유한한 숫자가 아닌 것 — 빈 텍스트, "abc", "NaN", "Infinity" — 은 조용히
 * 무시되고 확정된 값은 그대로 남는다.
 */
import { useState, type ChangeEvent } from 'react';
import {
  formatNormalized,
  formatPercentOfScale,
  formatScaled,
  formatScaledValueText,
  isDisplayScale,
  parseNormalized,
  parseScaled,
} from '@/simulation/numeric';

export interface NormalizedSliderProps {
  /** 범위 입력의 id. 짝을 이루는 모든 id가 여기서 파생된다. */
  readonly id: string;
  readonly label: string;
  /** 확정된 정규화 값, 0–1. */
  readonly value: number;
  /** 파싱되어 범위 안에 든 값으로만 호출된다. */
  readonly onChange: (next: number) => void;
  readonly description?: string;
  readonly disabled?: boolean;
  /**
   * 색상 견본의 hex 색. 기호나 축약 코드가 함께 주어질 때만 그려지므로, 의미가 색
   * 하나에만 실리는 일은 없다.
   */
  readonly accentColor?: string;
  readonly glyph?: string;
  readonly shortCode?: string;
  /**
   * 표시 눈금 기준. 주면 0–1 확정값을 0에서 이 값까지의 정수로 보여 주고 정수로
   * 입력받는다. 확정되는 값 자체는 그대로 0–1 무차원 값이다.
   *
   * 소수를 직접 타이핑하지 않으려는 입력 편의일 뿐이며, 이 숫자에 단위는 없다.
   * 1 이상의 정수가 아니면 무시하고 0–1 소수 표시로 돌아간다.
   */
  readonly displayScale?: number;
}

export function NormalizedSlider({
  id,
  label,
  value,
  onChange,
  description,
  disabled = false,
  accentColor,
  glyph,
  shortCode,
  displayScale,
}: NormalizedSliderProps) {
  /**
   * 숫자 필드를 편집하는 동안에는 그 텍스트가 여기에 머문다. 그래야 입력하다 만
   * 값이 키를 누를 때마다 확정 값으로 덮어써지지 않는다. `null`은 "확정된 값을
   * 보여 준다"는 뜻이고, 포커스를 잃으면 그 상태로 돌아온다.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const numberId = `${id}-number`;
  const descriptionId = description ? `${id}-description` : undefined;
  /** 쓸 수 없는 기준은 조용히 무시한다. 렌더 도중 던지면 패널 전체가 무너진다. */
  const scale = isDisplayScale(displayScale) ? displayScale : null;

  // 눈금 표시일 때 범위 입력과 숫자 필드, 판독값이 모두 이 하나에서 나온다. 각자
  // 계산하면 반올림 경계에서 셋이 서로 다른 숫자를 보일 수 있다.
  const readout = scale === null ? formatNormalized(value, 2) : formatScaled(value, scale);
  const valueText =
    scale === null ? formatPercentOfScale(value) : formatScaledValueText(value, scale);
  const showSwatch =
    accentColor !== undefined && (glyph !== undefined || shortCode !== undefined);

  function commit(raw: string): void {
    // 눈금 위의 숫자를 `parseNormalized`에 넘기면 1을 넘는 값이 조용히 1로 잘린다.
    const parsed = scale === null ? parseNormalized(raw) : parseScaled(raw, scale);
    // 잘못된 입력은 확정된 값을 그대로 둔다.
    if (parsed === null) return;
    onChange(parsed);
  }

  function handleRangeChange(event: ChangeEvent<HTMLInputElement>): void {
    commit(event.target.value);
  }

  function handleNumberChange(event: ChangeEvent<HTMLInputElement>): void {
    const raw = event.target.value;
    setDraft(raw);
    commit(raw);
  }

  function handleNumberBlur(): void {
    // 필드 텍스트를 확정된 값에 다시 맞춘다.
    setDraft(null);
  }

  return (
    <div
      aria-disabled={disabled || undefined}
      className={
        disabled
          ? 'flex flex-col gap-1.5 opacity-50'
          : 'flex flex-col gap-1.5'
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={id}
          className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-0"
        >
          {showSwatch ? (
            <span
              aria-hidden="true"
              style={{ backgroundColor: accentColor }}
              className="inline-block size-2.5 shrink-0 rounded-sm border border-line-strong"
            />
          ) : null}
          {glyph ? (
            // 축약 코드가 있을 때는 그것이 같은 의미를 텍스트로 되풀이한다.
            <span aria-hidden={shortCode ? true : undefined} className="text-ink-1">
              {glyph}
            </span>
          ) : null}
          {shortCode ? (
            <span className="font-mono text-[0.65rem] text-ink-2">{shortCode}</span>
          ) : null}
          <span className="truncate">{label}</span>
        </label>
        {/* 시각적 판독값일 뿐이다. 같은 정보는 범위 입력의 `aria-valuetext`를 통해
            보조 기술에 전달된다. */}
        <span
          aria-hidden="true"
          className="shrink-0 font-mono text-xs tabular-nums text-ink-1"
        >
          {/* 눈금 표시일 때는 기준을 나란히 적어, 이 정수가 무엇에 대한 값인지가
              숫자만 보고도 드러나게 한다. */}
          {scale === null ? readout : `${readout} / ${scale}`}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* 눈금 표시일 때 범위 입력은 정수 공간에서 움직인다. 정규화 공간에 1/기준을
            step으로 두면 브라우저의 눈금 맞춤이 마지막 자리에서 갈라져, 슬라이더로
            넣은 값과 숫자 필드로 넣은 값이 보이기에는 같은데 서로 다른 수가 된다. */}
        <input
          id={id}
          type="range"
          min={0}
          max={scale ?? 1}
          step={scale === null ? 0.01 : 1}
          value={scale === null ? value : readout}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          aria-valuetext={valueText}
          aria-describedby={descriptionId}
          onChange={handleRangeChange}
          className="h-4 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-not-allowed"
        />
        <label htmlFor={numberId} className="sr-only">
          {label} — 정밀 입력, 0에서 {scale ?? 1} 사이
        </label>
        <input
          id={numberId}
          type="number"
          inputMode={scale === null ? 'decimal' : 'numeric'}
          min={0}
          max={scale ?? 1}
          step={scale === null ? 0.01 : 1}
          value={draft ?? readout}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          aria-describedby={descriptionId}
          onChange={handleNumberChange}
          onBlur={handleNumberBlur}
          className={`shrink-0 rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 text-right font-mono text-xs tabular-nums text-ink-0 disabled:cursor-not-allowed ${scale === null ? 'w-16' : 'w-20'}`}
        />
      </div>

      {description ? (
        <p id={descriptionId} className="text-[0.7rem] leading-snug text-ink-2">
          {description}
        </p>
      ) : null}
    </div>
  );
}
