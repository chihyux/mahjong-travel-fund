import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import type { LeaderboardEntry } from '../../lib/utils';

const COLORS = [
  '#2F4A2F',
  '#4A6B4A',
  '#D9A441',
  '#B8781F',
  '#8A8074',
  '#6B7A6B',
  '#C48A3E',
  '#3F4A44'
];

interface ContributionPieProps {
  data: LeaderboardEntry[];
}

interface PieLabelArg {
  percent: number;
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
}

const RADIAN = Math.PI / 180;

function renderSliceLabel({ percent, cx, cy, midAngle, innerRadius, outerRadius }: PieLabelArg) {
  if (percent < 0.06) return null;
  const r = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#FFFFFF"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 13, fontWeight: 600 }}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function ContributionPie({ data }: ContributionPieProps) {
  const chartData = data
    .filter((d) => d.total > 0)
    .map((d) => ({ name: d.name, value: d.total }));

  if (chartData.length === 0) return null;

  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={54}
              outerRadius={96}
              paddingAngle={2}
              stroke="#FFFFFF"
              strokeWidth={3}
              label={renderSliceLabel}
              labelLine={false}
            >
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
        {chartData.map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <div key={d.name} className="flex items-center gap-2 min-w-0">
              <span
                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-[15px] text-ink-2 truncate">{d.name}</span>
              <span className="num text-[15px] text-ink-3 ml-auto flex-shrink-0">
                {pct.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
