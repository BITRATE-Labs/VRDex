"use client";
import { useId, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { metricNumber as count } from "./club-chart";
import type { InstanceChartPoint } from "./club-instance-chart-model";

const exactTime = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });
export function ClubInstanceChart({ points, closedAt }: { points: InstanceChartPoint[]; closedAt: number | null }) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();
  const hasQueue = points.some((point) => (point.queueSize ?? 0) > 0);
  const hasWindows = points.some((point) => point.windows !== null);
  const hasAndroid = points.some((point) => point.android !== null);
  const first = points[0]?.at, last = points.at(-1)?.at;
  if (first === undefined || last === undefined) return <Notice variant="dashed">No observations in this range.</Notice>;
  const domain = [Math.min(first, closedAt ?? first), Math.max(last, closedAt ?? last, first + 1)];
  const multiDay = new Date(first).toDateString() !== new Date(domain[1]!).toDateString();
  const axisTime = new Intl.DateTimeFormat(undefined, { ...(multiDay ? { month: "short", day: "numeric" } : {}), hour: "2-digit", minute: "2-digit" });
  return <div className="min-w-0">
      <div className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Population</h2>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-accent" />Population</span>
            {hasWindows ? <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-success" />Windows</span> : null}
              {hasAndroid ? <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-warning" />Android</span> : null}
            {hasQueue ? <span className="flex items-center gap-2">
              <span className="w-5 border-t-2 border-dashed border-muted" />Queue
            </span> : null}
          </div>
        </div>
        <div className="h-72 min-w-0" role="group" aria-label="Instance population chart">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={points} accessibilityLayer margin={{ top: 28, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="at" type="number" scale="time" domain={domain} tickFormatter={(at: number) => axisTime.format(at)} minTickGap={30} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <YAxis width={36} domain={[0, "auto"]} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={({ active, label }) => {
                const point = points.find((sample) => sample.at === Number(label));
                return active && point ? <div className="rounded-control border border-border bg-surface px-3 py-2 text-sm shadow-lg">
                  <p className="mb-2 text-muted">{exactTime.format(point.at)}</p>
                  <p>Population: {count(point.population)}</p>
                  {hasWindows ? <p>Windows: {count(point.windows)}</p> : null}{hasAndroid ? <p>Android: {count(point.android)}</p> : null}
                  {hasQueue ? <p>Queue: {count(point.queueSize)}</p> : null}
                </div> : null;
              }} />
              {closedAt !== null ? <ReferenceLine x={closedAt} stroke="var(--muted)" strokeDasharray="2 4" ifOverflow="extendDomain" label={{ value: "Closed to new joins", position: closedAt > domain[0]! + (domain[1]! - domain[0]!) * 0.7 ? "insideTopRight" : "top", fill: "var(--muted)", fontSize: 10 }} /> : null}
              <Line name="Population" dataKey="population" type="linear" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
              {hasWindows ? <Line name="Windows" dataKey="windows" type="linear" stroke="var(--success)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} /> : null}
              {hasAndroid ? <Line name="Android" dataKey="android" type="linear" stroke="var(--warning)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} /> : null}
              {hasQueue ? <Line name="Queue" dataKey="queueSize" type="linear" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} /> : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted">{exactTime.format(first)} – {exactTime.format(last)}</p>
          <Button size="sm" variant="ghost" aria-expanded={showTable} aria-controls={tableId} onClick={() => setShowTable(!showTable)}>{showTable ? "Hide data table" : "Show data table"}</Button>
        </div>
        {closedAt !== null ? <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted">{exactTime.format(closedAt)} · Closed to new joins</span>
        </div> : <p className="mt-3 text-xs text-muted">Closure time: Unknown</p>}
        {showTable ? <div id={tableId} className="mt-5 max-h-80 overflow-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="sr-only">Instance population values</caption>
            <thead className="border-b border-border text-muted"><tr><th className="py-3 pr-4 font-normal">Time</th><th className="px-2 py-3 font-normal">Population</th><th className="px-2 py-3 font-normal">Windows</th><th className="px-2 py-3 font-normal">Android</th><th className="px-2 py-3 font-normal">Queue</th></tr></thead>
            <tbody>{points.map((point) => <tr key={point.at} className="border-b border-border"><th scope="row" className="py-3 pr-4 font-normal">{exactTime.format(point.at)}</th><td className="px-2 py-3">{count(point.population)}</td><td className="px-2 py-3">{count(point.windows)}</td><td className="px-2 py-3">{count(point.android)}</td><td className="px-2 py-3">{count(point.queueSize)}</td></tr>)}</tbody>
          </table>
        </div> : null}
      </div>
      <div className="mt-5 min-w-0 border-t border-border pt-4">
        <details>
          <summary className="cursor-pointer text-sm font-medium">Diagnostics</summary>
          <div className="mt-4 max-h-80 overflow-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <caption className="sr-only">Instance diagnostic counts</caption>
              <thead className="border-b border-border text-muted"><tr><th className="py-3 pr-4 font-normal">Time</th><th className="px-2 py-3 font-normal">userCount</th><th className="px-2 py-3 font-normal">Platform sum</th><th className="px-2 py-3 font-normal">Reported platforms</th></tr></thead>
              <tbody>{points.map((point) => <tr key={point.at} className="border-b border-border"><th scope="row" className="py-3 pr-4 font-normal">{exactTime.format(point.at)}</th><td className="px-2 py-3">{count(point.userCount)}</td><td className="px-2 py-3">{point.platforms ? count(Object.values(point.platforms).reduce((sum, value) => sum + value, 0)) : "Unknown"}</td><td className="px-2 py-3 text-xs text-muted">{point.platforms ? Object.entries(point.platforms).map(([platform, value]) => <div key={platform}>{platform}: {count(value)}</div>) : "Unknown"}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </div>
  </div>;
}
