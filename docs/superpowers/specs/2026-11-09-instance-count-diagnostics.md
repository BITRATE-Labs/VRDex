# Instance count capture and queue UX preview

## Outcome

BASIC requested retaining userCount, queueSize and platform totals alongside the existing n_users population, plus a queue-chart UX pass and a live preview site. Capture is approved for implementation. The chart is an exploratory prototype for review, not approved production UI. Keep this separate from recap PR #444.

## Capture contract

- population remains the unchanged provider n_users value. Add optional userCount, queueSize and platforms to each retained instance observation and private instance-series readback.
- platforms is the provider-reported map of platform names to integer counts. Preserve its breakdown. Compute any reported-platform sum for display instead of storing a second derived total.
- Missing/null optional fields remain absent/unknown, not zero. Preserve real zero. Accept differences between counters, including counts above world capacity or queue larger than occupancy. Do not infer any relationship or rewrite history.
- Validate optional counts as non-negative safe integers, bound the platform map and keys, reject malformed supplied diagnostics at the trust boundary, and document that deployment must put additive backend support before the worker starts sending fields.
- Preserve existing request budget, membership gates, fencing, idempotency, population arithmetic, private visibility, legacy observations and workers. No extra provider requests or player lists. No exposure of diagnostics through public projections.

## Queue UX prototype

Use the existing dark VRDex primitives and chart library. Compare an unstacked solid population series and dashed queue series on one count axis. Give an exact-value tooltip/table, an optional Diagnostics disclosure with userCount and reported platform sum/breakdown. Show missing intervals as gaps and missing queue as unknown, never as a zero line.

Use clearly marked synthetic sample states for queue present, true zero, missing historical queue and conflicting diagnostic counts. Include the earlier requested closed-to-new-joins marker, continuing population afterward. No marker for an unknown closure. Confirmed closure markers are always shown, without a visibility control. Preview labels are candidates for BASIC review, not shipped product prose.

The existing instance page remains unchanged until the UX is accepted. Build the prototype as an isolated component and Storybook story, with a running local preview URL that BASIC can inspect. Do not wire sample data into a real account route, loosen authentication or deploy production.

## Question: how would an operator compare population and queue?

~~~mermaid
flowchart LR
 A[Instance detail] --> B[Population and queue chart]
 B --> C[Compare platform and queue lines]
 B --> D[Inspect exact sample table]
 D --> E[Expand Diagnostics]
~~~

## UX reference pass

Inspected web screenshots on November 9: [Searchable comparison chart and table](https://mobbin.com/screens/67b0a484-9bc6-4e7b-bb04-5ef269facd6d) places a legend and compare control next to the chart; [Base44 analytics](https://mobbin.com/screens/da0f9406-dbdd-47b4-af80-3e3f97a21459) shows a filter popover obscuring the chart. BASIC subsequently chose plain legend labels and automatic queue visibility. No series menu or toggle is needed. These are single-screen observations, not verified interaction journeys.

## Deferred and risks

No historical queue reconstruction, count correction, production field-definition switch, recap work, production UI integration or production deployment. Paired future samples are required to determine whether n_users includes queue or is otherwise inconsistent. Old records will remain sparse for these new fields.

## Preview for review

[Open the live closure example](http://127.0.0.1:6019/iframe.html?id=clubs-instance-population-preview--confirmed-closure&viewMode=story). The Sample case control switches between paired counts, historical unknowns, conflicting counts and confirmed closure. This is a local Storybook server and uses synthetic data.

Locked revision from BASIC: label the total Population, add separate Windows and Android lines, remove the gap caption and closure-marker toggle. Show Queue automatically only when at least one sample is positive. It has a plain legend label and no toggle. Zero-only and wholly missing queues have no chart line or control, while exact values retain zero versus unknown. Platform fields stay independent from Population and missing platform samples remain gaps. Keep the exact-value table and Diagnostics collapsed initially. That keeps the chart readable while retaining inspectable counts one action away. BASIC should review the updated multi-line chart and contrast before production integration. No recap or population calculation changes are proposed here.

Desktop and mobile browser checks pass for the preview. The mobile closure label was moved above its marker after visual review found clipping. The production instance screen is unchanged.

## Production follow-through

The prototype is a visual reference. The [production instance-history design](2026-11-09-instance-history-chart.md) and its [implementation plan](../plans/2026-11-09-instance-history-chart.md) define real account-page integration, rollout and acceptance.
