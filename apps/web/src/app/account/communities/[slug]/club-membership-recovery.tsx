"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueries } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@convex-generated-api";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { useOptionalClubWorkspace } from "./club-workspace";
import { metricNumber, metricTime } from "./club-chart";

type Recovery = FunctionReturnType<typeof api.clubMembershipRecovery.getRecoveryStatus>;
const labels = { disabled: "Disabled", unavailable: "Unavailable", idle: "Ready", pending: "Pending", running: "Running", stopped: "Stopped", partial: "Partial", complete: "Complete" };

export function ClubMembershipRecovery() {
  const workspace = useOptionalClubWorkspace();
  const owner = workspace?.actor.kind === "owner";
  const communityProfileId = owner ? workspace.community._id : undefined;
  const queries = useMemo(() => {
    const reads: Record<string, { query: typeof api.clubMembershipRecovery.getRecoveryStatus; args: FunctionArgs<typeof api.clubMembershipRecovery.getRecoveryStatus> }> = {};
    if (communityProfileId) reads.recovery = { query: api.clubMembershipRecovery.getRecoveryStatus, args: { communityProfileId } };
    return reads;
  }, [communityProfileId]);
  const results: { recovery?: Recovery | Error } = useQueries(queries);
  const request = useMutation(api.clubMembershipRecovery.requestRecovery);
  const stop = useMutation(api.clubMembershipRecovery.stopRecovery);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const result = results.recovery;
  if (!owner || !result || result instanceof Error || !result.enabled || (!result.available && !result.job)) return null;
  const job = result.job;
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailed(false);
    try { await action(); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  };
  return <Card padding="lg" className="min-w-0" aria-label="History recovery">
    <div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle>History recovery</SectionTitle><span className="text-sm" role="status">{labels[result.state]}</span></div>
    {job ? <>
      <p className="mt-3 text-sm text-muted" aria-label="Recovery window"><time dateTime={new Date(job.startAt).toISOString()}>{metricTime(job.startAt)}</time> to <time dateTime={new Date(job.endAt).toISOString()}>{metricTime(job.endAt)}</time></p>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">{[["Scanned", job.nextOffset], ["Recovered", job.recovered], ["Conflicts", job.conflicts], ["Unmatched", job.unmatched]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-lg tabular-nums">{metricNumber(typeof value === "number" ? value : null)}</dd></div>)}</dl>
    </> : null}
    {failed ? <Notice variant="error" role="alert" className="mt-4">Refresh to continue.</Notice> : null}
    <div className="mt-4 flex flex-wrap gap-3">
      {!job && result.available ? <Button disabled={busy} onClick={() => void run(() => request({ communityProfileId: workspace.community._id }))}>Recover recent history</Button> : null}
      {job && ["pending", "running"].includes(job.state) ? <Button disabled={busy} onClick={() => void run(() => stop({ recoveryId: job.recoveryId, expectedRevision: job.revision }))}>Stop recovery</Button> : null}
      {job && result.available && ["stopped", "partial"].includes(job.state) && job.nextOffset < 10_000 && job.pages < 100 ? <Button disabled={busy} onClick={() => void run(() => request({ communityProfileId: workspace.community._id, resume: true, expectedRevision: job.revision }))}>Resume recovery</Button> : null}
    </div>
  </Card>;
}
