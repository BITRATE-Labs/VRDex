import type { SeriesPoint } from "../../../../../../../convex/_clubAnalyticsMath";
import type { Doc } from "../../../../../../../convex/_generated/dataModel";
import { observedChartPoints } from "./club-analytics-model";

export type InstanceObservation = SeriesPoint & Pick<Doc<"instancePopulationObservations">, "userCount" | "queueSize" | "platforms">;
export type InstanceChartPoint = {
  at: number;
  label: string;
  population: number | null;
  windows: number | null;
  android: number | null;
  queueSize: number | null;
  userCount: number | null;
  platforms: Record<string, number> | null;
};

export function instanceChartPoints(observations: InstanceObservation[]): InstanceChartPoint[] {
  const byTime = new Map(observations.map((point) => [point.at, point]));
  return observedChartPoints(observations).map((point) => {
    const source = point.value !== null ? byTime.get(point.at) : undefined;
    return {
      at: point.at,
      label: point.label,
      population: point.value,
      windows: source?.platforms?.standalonewindows ?? null,
      android: source?.platforms?.android ?? null,
      queueSize: source?.queueSize ?? null,
      userCount: source?.userCount ?? null,
      platforms: source?.platforms ?? null,
    };
  });
}
