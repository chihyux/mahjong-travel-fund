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
  name: string;
  percent: number;
}

export default function ContributionPie({ data }: ContributionPieProps) {
  const chartData = data
    .filter((d) => d.total > 0)
    .map((d) => ({ name: d.name, value: d.total }));

  if (chartData.length === 0) return null;

  return (
    <div style={{ width: '100%', height: 280 }}>
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
            label={(e: PieLabelArg) => `${e.name} ${(e.percent * 100).toFixed(0)}%`}
            labelLine={false}
            style={{ fontSize: 14, fontWeight: 500 }}
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
