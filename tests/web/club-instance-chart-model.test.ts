import assert from "node:assert/strict";
import { test } from "node:test";
import { instanceChartPoints } from "../../apps/web/src/app/account/communities/[slug]/club-instance-chart-model";
const t = Date.UTC(2026, 10, 7, 20);
test("instance counters preserve independent values and all-series gaps", () => {
  const points = instanceChartPoints([
    { at: t, value: 110, coverage: "observed", queueSize: 135, userCount: 78, platforms: { standalonewindows: 58, android: 18 } },
    { at: t + 180000, value: 0, coverage: "observed", queueSize: 0, platforms: { standalonewindows: 0 } },
    { at: t + 720000, value: 12, coverage: "observed", platforms: {} },
  ]);
  assert.equal(points.length, 4);
  assert.equal(points[0]?.population, 110);
  assert.equal(points[0]?.queueSize, 135);
  assert.equal(points[0]?.windows, 58);
  assert.equal(points[0]?.android, 18);
  assert.equal(points[1]?.windows, 0);
  assert.equal(points[1]?.android, null);
  assert.equal(points[1]?.queueSize, 0);
  assert.equal(points[2]?.population, null);
  for (const key of ["windows", "android", "queueSize", "userCount", "platforms"] as const) assert.equal(points[2]?.[key], null);
  assert.deepEqual(points[3]?.platforms, {});
});
test("legacy, coverage breaks and singleton diagnostics stay unknown", () => {
  assert.deepEqual(instanceChartPoints([]), []);
  const points = instanceChartPoints([
    { at: t, value: 6, coverage: "observed" },
    { at: t + 60000, value: 58, coverage: "unknown", queueSize: 4, platforms: { android: 22 } },
    { at: t + 120000, value: 58, coverage: "observed", breakBefore: true, userCount: 58 },
  ]);
  assert.equal(points[0]?.queueSize, null);
  assert.equal(points[1]?.population, null);
  assert.equal(points[1]?.android, null);
  assert.equal(points.length, 4);
  assert.equal(points[3]?.userCount, 58);
  assert.equal(instanceChartPoints([{ at: t, value: 8, coverage: "observed", platforms: { android: 0 } }])[0]?.android, 0);
});
