'use client';

import { CollapsibleSection } from './CollapsibleSection';

const KINDS = [
  ['●', '비활성 응고 인자', '부드러운 구형·기본형'],
  ['◆', '활성 인자 / 효소', '각진 형상과 제한된 발광'],
  ['◇', '보조인자', '삼각 면 형상'],
  ['⬡', '복합체', '다면체 그룹 형상'],
  ['▽', '억제자', '고리형 clamp'],
  ['✚', '구조 생성물', '연결된 가닥망'],
  ['⬢', '혈소판 / 표면', '납작한 원반'],
] as const;

export function SceneLegend() {
  return (
    <CollapsibleSection
      title="장면 범례"
      defaultOpen={false}
      className="overflow-hidden rounded-lg border border-line bg-surface-1"
    >
      <div className="p-3">
        <ul className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3" aria-label="분자 형태 범례">
          {KINDS.map(([glyph, label, shape]) => (
            <li key={label} className="flex items-start gap-2 rounded bg-surface-2 p-2">
              <span aria-hidden="true" className="w-5 shrink-0 text-center font-mono text-base text-accent">
                {glyph}
              </span>
              <span>
                <strong className="block font-semibold text-ink-0">{label}</strong>
                <span className="text-ink-2">{shape}</span>
              </span>
            </li>
          ))}
        </ul>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-ink-1" aria-label="장면 상태 범례">
          <li><span aria-hidden="true" className="mr-1 text-accent">✦</span>밝음: 활성 경로</li>
          <li><span aria-hidden="true" className="mr-1 text-ink-2">—</span>흐림: 비활성 경로</li>
          <li><span aria-hidden="true" className="mr-1 text-inhibition">⊣</span>차단 표식: 억제</li>
          <li><span aria-hidden="true" className="mr-1 text-accent">◎</span>이중 고리: 선택됨</li>
        </ul>
      </div>
    </CollapsibleSection>
  );
}
