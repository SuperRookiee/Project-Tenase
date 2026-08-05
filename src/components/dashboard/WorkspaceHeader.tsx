'use client';

/**
 * 분석 작업공간의 공통 머리글.
 *
 * 범위 고지 문구는 작업공간마다 되풀이해 적지 않고 여기 한 벌만 둔다. 밀어 올리는
 * 조작을 부르는 이름만 화면마다 다르므로 그것만 받는다.
 *
 * 고지는 접히지만 요지는 접히지 않는다. 접힌 상태에서도 "0–1 무차원이며 어떤
 * 상태·절차·프로토콜·제품·집단에도 대응하지 않는다"는 핵심 문장이 그대로 보이고,
 * 펼치면 라벨의 성격과 숫자의 성격을 덧붙인다. 화면 위쪽을 문단 하나가 통째로
 * 차지하지 않으면서도 고지가 사라지지 않게 하려는 절충이다.
 */
import type { ReactNode } from 'react';

export function ScopeNotice({ inputTerm }: { readonly inputTerm: string }) {
  return (
    <details className="group mt-2 max-w-3xl rounded-lg border border-caution/40 bg-caution/5">
      <summary className="flex cursor-pointer list-none items-baseline gap-1.5 px-3 py-1.5 text-xs leading-relaxed text-ink-1 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="shrink-0 text-[0.6rem] text-caution transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        <span>
          <strong className="font-semibold">범위 고지.</strong> 모든 축은 0–1 무차원
          값이며 어떤 상태·절차·프로토콜·제품·집단에도 대응하지 않습니다.
        </span>
      </summary>
      <p className="px-3 pb-2.5 pl-[1.85rem] text-xs leading-relaxed text-ink-2">
        노드가 응고 생물학의 이름을 빌려 쓰지만 그것은 순전히 라벨일 뿐입니다.
        &ldquo;{inputTerm}&rdquo;은 가상 그래프의 한 노드를 밀어 올리는 조작에 붙인
        이름이며, 여기 나오는 숫자는 어느 것도 측정값이 아닙니다.
      </p>
    </details>
  );
}

export interface WorkspaceHeaderProps {
  /** 상단 내비게이션의 탭 이름과 같은 짧은 분류. */
  readonly eyebrow: string;
  readonly title: string;
  readonly description: ReactNode;
  /** 범위 고지에서 밀어 올리는 조작을 부르는 이름. */
  readonly inputTerm: string;
}

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  inputTerm,
}: WorkspaceHeaderProps) {
  return (
    <div className="mb-4">
      {/* 분류와 제목을 한 줄에 둔다. 둘을 쌓으면 그만큼 본문이 아래로 밀린다. */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-accent">
          {eyebrow}
        </p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
      <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-2">{description}</p>
      <ScopeNotice inputTerm={inputTerm} />
    </div>
  );
}
