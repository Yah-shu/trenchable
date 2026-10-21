"use client";

import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/misc";
import { formatUsd } from "@/lib/utils";

export type SpendStats = {
  today: number;
  week: number;
  month: number;
  all_time: number;
  count_all: number;
  by_model: { model: string; name: string; spend: number; count: number }[];
  by_user: { user_id: string; name: string; spend: number; count: number }[];
  daily: { day: string; spend: number; count: number }[];
};

/** Plinth chart colours: ink for the main series, coral for the second, hairline grid, mute ticks. */
const INK = "#111111";
const CORAL = "#fd9b9b";
const HAIRLINE = "#ebe6dd";
const MUTE = "#5a5a5a";
const TICK = { fill: MUTE, fontSize: 11, fontFamily: "var(--font-inter), system-ui, sans-serif" };
const money = (n: number) => `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatTile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="text-[13px] font-semibold text-mute">{label}</div>
      <div className="mt-2 font-display text-[34px] font-bold leading-none tracking-[-0.03em] text-ink tabular-nums">{money(value)}</div>
      {sub ? <div className="mt-2 text-xs text-mute">{sub}</div> : null}
    </Card>
  );
}

/** Ranked horizontal bars — one hue (magnitude), values in text ink, not series color. */
function RankedBars({ title, rows }: { title: string; rows: { key: string; name: string; spend: number; count: number }[] }) {
  const max = Math.max(...rows.map((r) => Number(r.spend)), 0.0001);
  return (
    <Card className="p-5">
      <h3 className="mb-4 text-lg font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-mute">No spend yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th>Name</th>
              <th>Spend</th>
              <th>Generations</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="group" title={`${r.name}: ${money(r.spend)} across ${r.count} generations`}>
                <td className="w-[38%] max-w-0 truncate py-1.5 pr-3 font-medium text-ink">{r.name}</td>
                <td className="w-[46%] py-1.5 pr-3">
                  <div className="h-3 w-full">
                    <div className="h-full rounded-[4px] border-[1.5px] border-ink bg-coral transition-colors group-hover:bg-ink" style={{ width: `${Math.max(1.5, (Number(r.spend) / max) * 100)}%` }} />
                  </div>
                </td>
                <td className="whitespace-nowrap py-1.5 text-right text-xs font-semibold tabular-nums text-ink">{money(r.spend)}</td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right text-[11px] tabular-nums text-mute">{r.count}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function SpendDashboard({ stats }: { stats: SpendStats }) {
  const daily = stats.daily.map((d) => ({ ...d, spend: Number(d.spend), label: format(parseISO(d.day), "MMM d") }));
  const last30 = daily.reduce((a, d) => a + d.spend, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Today" value={stats.today} />
        <StatTile label="This week" value={stats.week} />
        <StatTile label="This month" value={stats.month} />
        <StatTile label="All time" value={stats.all_time} sub={`${stats.count_all.toLocaleString()} generations`} />
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-ink">Daily spend, last 30 days</h3>
          <span className="pl-badge pl-badge--coral tabular-nums">{money(last30)} total</span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={HAIRLINE} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} width={48} tick={TICK} tickFormatter={(v: number) => `$${v < 10 ? v.toFixed(1) : Math.round(v)}`} />
              <Tooltip
                cursor={{ stroke: INK, strokeWidth: 1, strokeDasharray: "3 3" }}
                contentStyle={{ background: "#ffffff", border: `2px solid ${INK}`, borderRadius: 10, color: INK, fontSize: 12, fontWeight: 600 }}
                labelStyle={{ color: MUTE, fontWeight: 500 }}
                formatter={(value, _name, item) => [`${formatUsd(Number(value))} · ${(item.payload as { count: number }).count} gens`, "Spend"]}
              />
              <Line type="monotone" dataKey="spend" stroke={INK} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: CORAL, stroke: INK, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedBars title="Spend by model" rows={stats.by_model.map((r) => ({ key: r.model, name: r.name, spend: Number(r.spend), count: r.count }))} />
        <RankedBars title="Spend by user" rows={stats.by_user.map((r) => ({ key: r.user_id, name: r.name ?? "Unknown", spend: Number(r.spend), count: r.count }))} />
      </div>
    </div>
  );
}
