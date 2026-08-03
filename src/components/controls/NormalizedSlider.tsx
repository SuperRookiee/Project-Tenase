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
  parseNormalized,
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
}: NormalizedSliderProps) {
  /**
   * 숫자 필드를 편집하는 동안에는 그 텍스트가 여기에 머문다. 그래야 입력하다 만
   * 값이 키를 누를 때마다 확정 값으로 덮어써지지 않는다. `null`은 "확정된 값을
   * 보여 준다"는 뜻이고, 포커스를 잃으면 그 상태로 돌아온다.
   */
  const [draft, setDraft] = useState<string | null>(null);

  const numberId = `${id}-number`;
  const descriptionId = description ? `${id}-description` : undefined;
  const readout = formatNormalized(value, 2);
  const valueText = formatPercentOfScale(value);
  const showSwatch =
    accentColor !== undefined && (glyph !== undefined || shortCode !== undefined);

  function commit(raw: string): void {
    const parsed = parseNormalized(raw);
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
          {readout}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          aria-valuetext={valueText}
          aria-describedby={descriptionId}
          onChange={handleRangeChange}
          className="h-4 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-not-allowed"
        />
        <label htmlFor={numberId} className="sr-only">
          {label} — 정밀 입력, 0에서 1 사이
        </label>
        <input
          id={numberId}
          type="number"
          inputMode="decimal"
          min={0}
          max={1}
          step={0.01}
          value={draft ?? readout}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          aria-describedby={descriptionId}
          onChange={handleNumberChange}
          onBlur={handleNumberBlur}
          className="w-16 shrink-0 rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 text-right font-mono text-xs tabular-nums text-ink-0 disabled:cursor-not-allowed"
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
