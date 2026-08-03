'use client';

/**
 * 추상 모델 시간에 대해 그린 무차원 모델 신호 하나.
 *
 * Y축은 0에서 1까지 전체 척도에 고정돼 있어, 축을 읽지 않고도 차트끼리 눈으로 비교할
 * 수 있다. 제목에는 노드 기호가 함께 실려 있어 계열을 색만으로 구분하는 일이 없다.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNormalized } from '@/simulation/numeric';
import { useSimulationStore } from '@/store/simulationStore';

const CHART_HEIGHT = 150;

export interface SignalChartProps {
  readonly title: string;
  readonly description: string;
  readonly dataKey: string;
  readonly color: string;
  readonly data: readonly Record<string, number>[];
  readonly glyph: string;
}

function formatAxisValue(value: unknown): string {
  return typeof value === 'number' ? value.toFixed(1) : '';
}

function formatTimeValue(value: unknown): string {
  return typeof value === 'number' ? value.toFixed(0) : '';
}

export function SignalChart({
  title,
  description,
  dataKey,
  color,
  data,
  glyph,
}: SignalChartProps) {
  const reducedMotion = useSimulationStore((state) => state.reducedMotion);
  const gradientId = `tenase-signal-gradient-${dataKey}`;

  return (
    <figure className="rounded-lg border border-line bg-surface-1 p-3">
      <figcaption>
        <h3 className="text-sm font-semibold text-ink-0">
          <span aria-hidden="true" className="mr-1 font-mono">
            {glyph}
          </span>
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-ink-2">{description}</p>
        <p className="mt-0.5 text-xs text-ink-2">
          추상 모델 시간에 대해 척도 0에서 1까지 그린 것이다. 같은 값이 장면 설명과
          인스펙터에도 글로 적혀 있다.
        </p>
      </figcaption>

      {/*
        이 그림은 중복된 표현이다. 뒤에 있는 숫자들은 장면 설명과 인스펙터에 이미
        들어 있고 둘 다 평범한 텍스트다. 그래서 틱마다 읽어 주는 대신 보조 기술에서
        숨긴다.
      */}
      <div className="mt-2" style={{ height: CHART_HEIGHT }} aria-hidden="true">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <AreaChart
            data={data}
            margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.55} />
                <stop offset="100%" stopColor={color} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" />
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTimeValue}
              tick={{ fill: 'var(--color-ink-2)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-line)' }}
              height={20}
            />
            <YAxis
              domain={[0, 1]}
              ticks={[0, 0.5, 1]}
              tickFormatter={formatAxisValue}
              tick={{ fill: 'var(--color-ink-2)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-line)' }}
              width={30}
            />
            <Tooltip
              isAnimationActive={!reducedMotion}
              formatter={(value) =>
                typeof value === 'number' ? formatNormalized(value) : '—'
              }
              labelFormatter={(label) =>
                `모델 시간 ${typeof label === 'number' ? label.toFixed(2) : ''}`
              }
              contentStyle={{
                backgroundColor: 'var(--color-surface-2)',
                border: '1px solid var(--color-line-strong)',
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--color-ink-1)' }}
              itemStyle={{ color: 'var(--color-ink-0)' }}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              name={`${glyph} ${title}`}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={!reducedMotion}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
