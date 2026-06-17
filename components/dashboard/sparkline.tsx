"use client";

import { ResponsiveContainer, LineChart, Line, YAxis } from "recharts";

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

// Tiny 7-day trend line shown inside a KPI card. No axes, no tooltip — purely
// decorative shape that conveys the recent direction of the metric.
export function Sparkline({ data, color, width = 88, height = 36 }: SparklineProps) {
  if (!data.length) return null;

  const chartData = data.map((value, i) => ({ i, value }));

  // Pad the domain slightly so a flat line doesn't sit on the edge.
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = (max - min) * 0.15 || 1;

  return (
    <div style={{ width, height, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
          <YAxis hide domain={[min - pad, max + pad]} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
