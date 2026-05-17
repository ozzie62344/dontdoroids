"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Point = { measured_on: string; weight_kg: number | null; height_cm: number | null };

export default function WeightChart({ data }: { data: Point[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-neutral-500">Log a measurement to see your chart.</p>;
  }
  const sorted = [...data].sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={sorted} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="measured_on" tick={{ fontSize: 11 }} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="weight_kg"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
            name="Weight (kg)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
