'use client';

import { useId, useState, type ReactNode } from 'react';

interface CollapsibleSectionProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
  readonly description?: string;
  readonly className?: string;
}

/**
 * 패널과 장면 범례가 공유하는 접근 가능한 접기 영역.
 * 상태는 페이지 메모리에만 머물며 브라우저 저장소에는 기록하지 않는다.
 */
export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  description,
  className = '',
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const reactId = useId().replaceAll(':', '');
  const contentId = `collapsible-${reactId}`;

  return (
    <section className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 border-y border-line bg-surface-1 px-4 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-ink-1 hover:bg-surface-2"
      >
        <span>{title}</span>
        <span aria-hidden="true" className="font-mono text-sm text-accent">
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? (
        <div id={contentId}>
          {description ? (
            <p className="px-4 pt-3 text-[0.7rem] leading-snug text-ink-2">
              {description}
            </p>
          ) : null}
          {children}
        </div>
      ) : null}
    </section>
  );
}
