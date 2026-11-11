"use client";

import { useState } from "react";
import { ClubInstanceChart } from "@/app/account/communities/[slug]/club-instance-chart";
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
  unknown: "Unknown coverage",
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
  unknown: [{ minute: 0, population: null }],
};
export function InstancePopulationChartPreview({ initialScenario = "paired" }: { initialScenario?: PopulationPreviewScenario }) {
  const [scenario, setScenario] = useState(initialScenario);
  const start = Date.UTC(2026, 10, 7, 20);
  const points = samples[scenario].map((point) => ({ at: start + point.minute * 18000, label: "", population: point.population,
    windows: point.platforms?.standalonewindows ?? null, android: point.platforms?.android ?? null,
    queueSize: point.queueSize ?? null, userCount: point.userCount ?? null, platforms: point.platforms ?? null }));
  return <main className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 sm:px-8 sm:py-12">
    <header className="flex flex-wrap items-end justify-between gap-5"><div><h1 className="text-2xl font-semibold tracking-tight">Instance population</h1><p className="mt-2 text-sm text-muted">Synthetic sample data</p></div>
    <Field>Sample case<Select value={scenario} onChange={(event) => { const next = event.target.value; if (next === "paired" || next === "historical" || next === "noQueue" || next === "conflicting" || next === "closure" || next === "unknown") setScenario(next); }}>{Object.entries(scenarios).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Select></Field></header>
    <Card><ClubInstanceChart points={points} closedAt={scenario === "closure" ? start + 18 * 60000 : null} /></Card>
  </main>;
}
