'use client';

/**
 * 다섯 개의 모델 신호 곡선.
 *
 * 스냅샷 링에는 150픽셀 높이 차트가 분해할 수 있는 것보다 훨씬 많은 샘플이 들어
 * 있으므로, N개마다 하나씩 골라 계열을 솎아 낸다. 솎아 낼 때도 가장 오래된 샘플과
 * 가장 최근 샘플은 제자리에 남겨 두므로 보이는 구간이 흔들리지 않는다.
 */
import { useMemo } from 'react';
import { getEntity } from '@/simulation/entities';
import type { SimulationSnapshot } from '@/simulation/types';
import { simulationStore, useSimulationStore } from '@/store/simulationStore';
import { SignalChart } from './SignalChart';

/** 곡선 하나에 그릴 점의 상한. */
const MAX_CHART_POINTS = 120;

type ChartRow = Record<string, number>;

interface ChartSeries {
  readonly title: string;
  readonly description: string;
  readonly dataKey: string;
  readonly color: string;
  readonly glyph: string;
}

const SERIES: readonly ChartSeries[] = [
  {
    title: 'Factor IX 모델 신호',
    description:
      '0에서 1 사이의 무차원 모델 신호. 전구 노드가 아니라 그 활성형인 Factor IXa를 따라간다.',
    dataKey: 'factorIX',
    color: getEntity('factorIXa').color,
    glyph: getEntity('factorIXa').glyph,
  },
  {
    title: 'Factor Xa 모델 신호',
    description:
      '반응망 중간부의 활성형 노드에 대한 0에서 1 사이의 무차원 모델 신호.',
    dataKey: 'factorXa',
    color: getEntity('factorXa').color,
    glyph: getEntity('factorXa').glyph,
  },
  {
    title: 'Thrombin 모델 신호',
    description:
      '그래프의 중심 출력 노드에 대한 0에서 1 사이의 무차원 모델 신호.',
    dataKey: 'thrombin',
    color: getEntity('thrombin').color,
    glyph: getEntity('thrombin').glyph,
  },
  {
    title: 'Fibrin 모델 신호',
    description:
      '메시로 그려지는 종단 구조 노드에 대한 0에서 1 사이의 무차원 모델 신호.',
    dataKey: 'fibrin',
    color: getEntity('fibrin').color,
    glyph: getEntity('fibrin').glyph,
  },
  {
    title: '억제 모델 신호',
    description:
      '0에서 1 사이의 무차원 모델 신호. 억제 엣지가 걷어내고 있는, 억제 대상 노드별 회전량의 비율이다. 두 억제 노드 중 어느 쪽을 올려도 상승한다.',
    dataKey: 'inhibition',
    color: getEntity('antithrombin').color,
    glyph: getEntity('antithrombin').glyph,
  },
];

function toRow(snapshot: SimulationSnapshot): ChartRow {
  return {
    time: snapshot.time,
    factorIX: snapshot.signals.factorIXModelSignal,
    factorXa: snapshot.signals.factorXaModelSignal,
    thrombin: snapshot.signals.thrombinModelSignal,
    fibrin: snapshot.signals.fibrinModelSignal,
    inhibition: snapshot.signals.inhibitionModelSignal,
  };
}

function buildChartRows(
  snapshots: readonly SimulationSnapshot[],
): readonly ChartRow[] {
  const length = snapshots.length;
  if (length === 0) return [];
  if (length <= MAX_CHART_POINTS) return snapshots.map(toRow);

  const stride = Math.ceil(length / MAX_CHART_POINTS);
  const rows: ChartRow[] = [];
  for (let index = 0; index < length; index += stride) {
    rows.push(toRow(snapshots[index]));
  }
  // 곡선이 오른쪽 끝까지 닿도록 항상 가장 최근 샘플로 마무리한다.
  const last = snapshots[length - 1];
  if (rows.length === 0 || rows[rows.length - 1].time !== last.time) {
    rows.push(toRow(last));
  }
  return rows;
}

export function SignalChartGrid() {
  const tick = useSimulationStore((state) => state.frame.tick);

  const rows = useMemo<readonly ChartRow[]>(() => {
    // 발행된 틱을 키로 삼는다. 스냅샷 배열은 스토어가 프레임을 발행할 때만 교체되므로,
    // 여기서 명령형으로 읽는 것은 구독하는 것과 같으면서 구독을 하나 더 만들지 않는다.
    void tick;
    return buildChartRows(simulationStore.getState().frame.snapshots);
  }, [tick]);

  return (
    <section aria-labelledby="charts-heading">
      <h2
        id="charts-heading"
        className="text-sm font-semibold uppercase tracking-wide text-ink-1"
      >
        추상 모델 시간에 따른 모델 신호
      </h2>
      <p className="mt-1 text-xs text-ink-2">
        각 곡선은 0과 1 사이의 무차원 값이다. 가로축은 추상 모델 시간 단위를 센다.
        곡선에는 기호와 이름이 함께 붙어 있으므로, 어떤 계열도 구분을 색에 의존하지
        않는다.
      </p>

      <div className="mt-2 grid grid-cols-1 gap-3 xl:grid-cols-2">
        {SERIES.map((series) => (
          <SignalChart
            key={series.dataKey}
            title={series.title}
            description={series.description}
            dataKey={series.dataKey}
            color={series.color}
            glyph={series.glyph}
            data={rows}
          />
        ))}
      </div>
    </section>
  );
}
