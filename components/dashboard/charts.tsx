"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  XAxis,
  Tooltip,
  Cell,
  Pie,
  PieChart,
} from "recharts";
import { fmtUSDShort } from "@/lib/format";

export function SalesAreaChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 10.5, fill: "var(--text-3)" }}
          interval={0}
        />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontSize: 12,
            color: "var(--text)",
            boxShadow: "var(--shadow-md)",
          }}
          labelStyle={{ color: "var(--text-3)" }}
          formatter={(v) => [fmtUSDShort(Number(v)), "Ventas"]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--brand)"
          strokeWidth={2.5}
          fill="url(#salesArea)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Donut({
  data,
  centerValue,
  centerLabel,
  size = 128,
}: {
  data: { name: string; value: number; color: string }[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data.length ? data : [{ name: "—", value: 1, color: "var(--surface-2)" }]}
            dataKey="value"
            nameKey="name"
            innerRadius={size * 0.32}
            outerRadius={size * 0.5}
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="none"
          >
            {(data.length ? data : [{ color: "var(--surface-2)" }]).map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] font-bold tracking-tight text-foreground">
          {centerValue}
        </span>
        <span className="text-[10.5px] text-text-3">{centerLabel}</span>
      </div>
    </div>
  );
}
