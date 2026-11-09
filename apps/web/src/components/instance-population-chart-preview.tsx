"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";

type Sample = {
  minute: number;
  population: number | null;
  queueSize?: number;
  userCount?: number;
  platforms?: Record<string, number>;
};

const scenarios = {
  paired: "Queue and gaps",
  historical: "Missing historical queue",
  noQueue: "No queue",
  conflicting: "Conflicting counts",
  closure: "Confirmed closure",
};
export type PopulationPreviewScenario = keyof typeof scenarios;

const pairedSamples: Sample[] = [
  { minute: 0, population: 18, queueSize: 0, userCount: 18, platforms: { standalonewindows: 14, android: 4 } },
  { minute: 10, population: 44, queueSize: 3, userCount: 44, platforms: { standalonewindows: 32, android: 12 } },
  { minute: 20, population: 72, queueSize: 14, userCount: 72, platforms: { standalonewindows: 50, android: 22 } },
  { minute: 30, population: null },
  { minute: 40, population: 80, queueSize: 24, userCount: 80, platforms: { standalonewindows: 60, android: 20 } },
  { minute: 50, population: 76, userCount: 76 },
  { minute: 60, population: 64, queueSize: 0, userCount: 64, platforms: { standalonewindows: 45, android: 19 } },
  { minute: 70, population: 36, queueSize: 0, userCount: 36, platforms: { standalonewindows: 26, android: 10 } },
  { minute: 80, population: 12, queueSize: 0, userCount: 12, platforms: { standalonewindows: 9, android: 3 } },
];
const samples: Record<PopulationPreviewScenario, Sample[]> = {
  paired: pairedSamples,
  noQueue: pairedSamples.map((sample) => ({ ...sample, ...(sample.queueSize !== undefined ? { queueSize: 0 } : {}) })),
  historical: pairedSamples.map(({ minute, population }) => ({ minute, population })),
  conflicting: pairedSamples.map((sample) => sample.minute === 40
    ? { ...sample, population: 110, queueSize: 135, userCount: 78, platforms: { standalonewindows: 58, android: 18 } }
    : sample),
  closure: pairedSamples,
};
const count = (value: number | null | undefined) => value == null ? "Unknown" : value.toLocaleString();
const time = (minute: number) => `${20 + Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}`;

export function InstancePopulationChartPreview({ initialScenario = "paired" }: { initialScenario?: PopulationPreviewScenario }) {
  const [scenario, setScenario] = useState(initialScenario);
  const [showTable, setShowTable] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const points = samples[scenario];
  const hasQueue = points.some((point) => (point.queueSize ?? 0) > 0);
  const hasPlatforms = points.some((point) => point.platforms !== undefined);
  const closedAt = scenario === "closure" ? 60 : null;

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Instance population</h1>
          <p className="mt-2 text-sm text-muted">Synthetic sample data · UX preview</p>
        </div>
        <Field className="w-full sm:w-64">
          Sample case
          <Select value={scenario} onChange={(event) => {
            const next = event.target.value;
            if (next === "noQueue" || next === "paired" || next === "historical" || next === "conflicting" || next === "closure") setScenario(next);
          }}>
            {Object.entries(scenarios).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
      </header>
      <Card className="min-w-0" aria-label="Population preview">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Population</h2>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-accent" />Population</span>
            {hasPlatforms ? <>
              <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-success" />Windows</span>
              <span className="flex items-center gap-2"><span className="w-5 border-t-2 border-warning" />Android</span>
            </> : null}
            {hasQueue ? <span className="flex items-center gap-2">
              <span className="w-5 border-t-2 border-dashed border-muted" />Queue
            </span> : null}
          </div>
        </div>
        <div className="h-72 min-w-0" role="group" aria-label="Population and queue chart">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={points} accessibilityLayer margin={{ top: 28, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="minute" tickFormatter={time} minTickGap={30} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <YAxis width={36} domain={[0, "auto"]} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
              <Tooltip cursor={{ stroke: "var(--border-strong)" }} content={({ active, label }) => {
                const point = points.find((sample) => sample.minute === Number(label));
                return active && point ? <div className="rounded-control border border-border bg-surface px-3 py-2 text-sm shadow-lg">
                  <p className="mb-2 text-muted">{time(point.minute)}</p>
                  <p>Population: {count(point.population)}</p>
                  {hasPlatforms ? <><p>Windows: {count(point.platforms?.standalonewindows)}</p><p>Android: {count(point.platforms?.android)}</p></> : null}
                  {hasQueue ? <p>Queue: {count(point.queueSize)}</p> : null}
                </div> : null;
              }} />
              {closedAt !== null ? <ReferenceLine x={closedAt} stroke="var(--muted)" strokeDasharray="2 4" label={{ value: "Closed to new joins", position: "top", fill: "var(--muted)", fontSize: 10 }} /> : null}
              <Line name="Population" dataKey="population" type="linear" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
              {hasPlatforms ? <>
                <Line name="Windows" dataKey="platforms.standalonewindows" type="linear" stroke="var(--success)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
                <Line name="Android" dataKey="platforms.android" type="linear" stroke="var(--warning)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
              </> : null}
              {hasQueue ? <Line name="Queue" dataKey="queueSize" type="linear" stroke="var(--muted)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} /> : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted">20:00–21:20 · Sample clock</p>
          <Button size="sm" variant="ghost" aria-expanded={showTable} aria-controls="population-sample-table" onClick={() => setShowTable(!showTable)}>{showTable ? "Hide data table" : "Show data table"}</Button>
        </div>
        {closedAt !== null ? <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted">21:00 · Confirmed closed to new joins</span>
        </div> : <p className="mt-3 text-xs text-muted">Closure time: Unknown</p>}
        {showTable ? <div id="population-sample-table" className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="sr-only">Exact synthetic sample values</caption>
            <thead className="border-b border-border text-muted"><tr><th className="py-3 pr-4 font-normal">Time</th><th className="px-2 py-3 font-normal">Population</th>{hasPlatforms ? <><th className="px-2 py-3 font-normal">Windows</th><th className="px-2 py-3 font-normal">Android</th></> : null}<th className="px-2 py-3 font-normal">Queue</th></tr></thead>
            <tbody>{points.map((point) => <tr key={point.minute} className="border-b border-border"><th scope="row" className="py-3 pr-4 font-normal">{time(point.minute)}</th><td className="px-2 py-3">{count(point.population)}</td>{hasPlatforms ? <><td className="px-2 py-3">{count(point.platforms?.standalonewindows)}</td><td className="px-2 py-3">{count(point.platforms?.android)}</td></> : null}<td className="px-2 py-3">{count(point.queueSize)}</td></tr>)}</tbody>
          </table>
        </div> : null}
      </Card>
      <Card padding="sm" className="min-w-0">
        <details open={diagnostics} onToggle={(event) => setDiagnostics(event.currentTarget.open)}>
          <summary className="cursor-pointer text-sm font-medium">Diagnostics</summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <caption className="sr-only">Synthetic diagnostic counts</caption>
              <thead className="border-b border-border text-muted"><tr><th className="py-3 pr-4 font-normal">Time</th><th className="px-2 py-3 font-normal">userCount</th><th className="px-2 py-3 font-normal">Platform sum</th><th className="px-2 py-3 font-normal">Reported platforms</th></tr></thead>
              <tbody>{points.map((point) => <tr key={point.minute} className="border-b border-border"><th scope="row" className="py-3 pr-4 font-normal">{time(point.minute)}</th><td className="px-2 py-3">{count(point.userCount)}</td><td className="px-2 py-3">{point.platforms ? count(Object.values(point.platforms).reduce((sum, value) => sum + value, 0)) : "Unknown"}</td><td className="px-2 py-3 text-xs text-muted">{point.platforms ? Object.entries(point.platforms).map(([platform, value]) => <div key={platform}>{platform}: {count(value)}</div>) : "Unknown"}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </Card>
    </main>
  );
}
