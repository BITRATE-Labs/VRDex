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

Use the existing dark VRDex primitives and chart library. Compare an unstacked solid population series and dashed queue series on one count axis. Give an exact-value tooltip/table, a simple Queue visibility control, and an optional Diagnostics disclosure with userCount and reported platform sum/breakdown. Show missing intervals as gaps and missing queue as unknown, never as a zero line.

Use clearly marked synthetic sample states for queue present, true zero, missing historical queue and conflicting diagnostic counts. Include the earlier requested closed-to-new-joins marker as a preview option, continuing population afterward. No marker for an unknown closure. Preview labels are candidates for BASIC review, not shipped product prose.

The existing instance page remains unchanged until the UX is accepted. Build the prototype as an isolated component and Storybook story, with a running local preview URL that BASIC can inspect. Do not wire sample data into a real account route, loosen authentication or deploy production.

## Question: how would an operator compare population and queue?

~~~mermaid
flowchart LR
 A[Instance detail] --> B[Population and queue chart]
 B --> C[Toggle Queue]
 B --> D[Inspect exact sample table]
 D --> E[Expand Diagnostics]
~~~

## UX reference pass

Inspected web screenshots on November 9: [Searchable comparison chart and table](https://mobbin.com/screens/67b0a484-9bc6-4e7b-bb04-5ef269facd6d) places a legend and compare control next to the chart; [Base44 analytics](https://mobbin.com/screens/da0f9406-dbdd-47b4-af80-3e3f97a21459) shows a filter popover obscuring the chart. Reuse the compact adjacent-control pattern. Avoid a popover for two series. These are single-screen observations, not verified interaction journeys.

## Deferred and risks

No historical queue reconstruction, count correction, production field-definition switch, recap work, production UI integration or production deployment. Paired future samples are required to determine whether n_users includes queue or is otherwise inconsistent. Old records will remain sparse for these new fields.
