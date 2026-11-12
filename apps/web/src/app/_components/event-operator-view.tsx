"use client";

import Link from "next/link";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType, FunctionArgs } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { api } from "@convex-generated-api";
import { EventBroadcastQuickSwitch, type PreparedBroadcastSource } from "./event-broadcast-quick-switch";
import { Button } from "@/components/ui/button";
import { PageContainer, PageActions, PageShell } from "@/components/ui/page-shell";
import { CopyValueRow } from "@/components/ui/copy-value-row";
import { EventOperatorPreview } from "./event-operator-preview";
import { parseBroadcastInputUrl } from "../../../../../convex/_broadcastInputUrl";
import { eventBroadcastObservationFresh } from "@/lib/event-broadcast-observation";
import { Radio, ArrowUpRight } from "lucide-react";
import { ViewerLocalEventDateTime } from "./viewer-local-event-times";
import { operatorViewState } from "@/lib/event-operator-state";
import {
  EventOperatorSources,
  type SourceAuthoring,
} from "./event-operator-sources";
import { EventOperatorDiagnostics } from "./event-operator-diagnostics";
import {
  EventStreamSettings,
  type StreamSettings,
} from "./event-stream-settings";
import { NEW_PROGRAM_MEDIA_SETTINGS } from "../../../../../workers/restream/broadcast-profiles.mjs";
import type { PublicEvent } from "./event-public-page";

export type OperatorStatus = FunctionReturnType<
  typeof api.events.getEventMediaControlStatus
>;
type Command =
  | "resume_previous"
  | "switch_next"
  | "switch_source"
  | "switch_hold"
  | "hold_current"
  | "set_automatic_mode";
export function EventOperatorView({
  currentSlug,
}: {
  currentSlug: string;
  initialStatus: OperatorStatus;
  event?: PublicEvent;
}) {
  const { isAuthenticated } = useConvexAuth();
  // Server route authorization can finish before the browser token reaches Convex.
  const status = useQuery(
    api.events.getEventMediaControlStatus,
    isAuthenticated ? { currentSlug } : "skip",
  );
  const nextSource = useQuery(api.events.getNextEventMediaSource,isAuthenticated ? {currentSlug} : "skip");
  const queue = useMutation(api.events.queueEventMediaCommand);
  const start = useMutation(api.events.scheduleEventMediaWorker);
  const stop = useMutation(api.events.stopEventMediaWorker);
  const policy = useMutation(api.events.configureEventBroadcastPolicy);
  const configureTwitch = useMutation(api.events.configureTwitchOutput);
  const cancel = useMutation(api.events.cancelEventMediaOperation);
  const create = useMutation(api.eventMediaSources.create);
  const replace = useMutation(api.eventMediaSources.replace);
  const remove = useMutation(api.eventMediaSources.remove);
  const settings = useMutation(api.eventMediaSettings.configure);
  // A loading/rejected replacement subscription must never restore old authority.
  const current = status;
  if (!isAuthenticated || !current) return null;
  return (
    <>
      <EventOperatorControls
        key={current.eventId}
        status={current}
        nextSource={nextSource}
        onCancel={(commandId) =>
          cancel({
            currentSlug,
            commandId,
            idempotencyKey: crypto.randomUUID(),
          })
        }
        onCreate={(input) => create({ currentSlug, ...input })}
        onPrepare={(label,url,idempotencyKey) => create({currentSlug,label,url,idempotencyKey,...{temporary:true}})}
        onReplace={(source, input, expected) =>
          replace({ currentSlug, sourceId: source.sourceId, ...input, ...expected })
        }
        onRemove={(source, expected) =>
          remove({ currentSlug, sourceId: source.sourceId, ...expected })
        }
        onSaveSettings={(input) => settings({ currentSlug, ...input })}
        title={current.eventTitle}
        onTwitch={(input) => configureTwitch({ currentSlug, ...input })}
        onCommand={(type, targetSourceKey, expected) =>
          queue({
            currentSlug,
            type,
            targetSourceKey,
            ...expected,
            idempotencyKey: crypto.randomUUID(),
          })
        }
        onStart={(outputKey) =>
          start({ currentSlug, outputKey, startImmediately: true })
        }
        onStop={(sessionId) => stop({ currentSlug, sessionId })}
        onPolicy={(maxOverrunMs) =>
          policy({ currentSlug, policy: { maxOverrunMs } })
        }
      />
    </>
  );
}

type TwitchInput = {
  key: string;
  label: string;
  channel: string;
  outputAccountKey: string;
  simulcastEnabled: boolean;
  sourceConsentAccepted: boolean;
  destinationAuthorityAccepted: boolean;
  providerRulesAccepted: boolean;
  rightsClearedMediaAccepted: boolean;
};
type CommandExpected = Pick<FunctionArgs<typeof api.events.queueEventMediaCommand>, "expectedSourceRevision" | "expectedSessionId" | "expectedIntentSequence">;
type AuthoringExpected = Pick<FunctionArgs<typeof api.eventMediaSources.remove>, "expectedSourceRevision" | "expectedSessionId" | "expectedIntentSequence">;
type ControlsProps = {
  nextSource?: FunctionReturnType<typeof api.events.getNextEventMediaSource>;
  onPrepare?: (label:string,url:string,idempotencyKey:string)=>Promise<PreparedBroadcastSource>;
  title?: string;
  onTwitch: (input: TwitchInput) => Promise<unknown>;
  status: OperatorStatus;
  onCommand: (type: Command, key?: string, expected?:CommandExpected) => Promise<unknown>;
  onStart: (key: string) => Promise<unknown>;
  onStop: (
    id: OperatorStatus["sessions"][number]["sessionId"],
  ) => Promise<unknown>;
  onPolicy: (maxOverrunMs?: number) => Promise<unknown>;
  onCancel: (
    id: OperatorStatus["commands"][number]["commandId"],
  ) => Promise<unknown>;
  onCreate: (input: SourceAuthoring) => Promise<unknown>;
  onReplace: (
    source: OperatorStatus["sources"][number],
    input: SourceAuthoring,
    expected?: AuthoringExpected,
  ) => Promise<unknown>;
  onRemove: (source: OperatorStatus["sources"][number], expected?:AuthoringExpected) => Promise<unknown>;
  onSaveSettings: (input: StreamSettings) => Promise<unknown>;
};
export function EventOperatorControls({
  status,
  title,
  onCommand,
  onStart,
  onStop,
  onPolicy,
  onCancel,
  onCreate,
  onReplace,
  onRemove,
  onSaveSettings,
  onPrepare,
  nextSource,
}: ControlsProps) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const stopLock = useRef(false);
  const cutLock = useRef(false);
  const cancelLock = useRef(false);
  const [cutBusy, setCutBusy] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const [change, setChange] = useState<{title:string; message:string; label:string; sessionId:string; epoch?:number; run:()=>Promise<unknown>; cancel?:()=>void} | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {if (change) dialog.current?.showModal(); else dialog.current?.close();}, [change]);
  const [outputKey, setOutputKey] = useState("");
  const [overrun, setOverrun] = useState(
    status.program?.broadcastPolicy?.maxOverrunMs === undefined
      ? ""
      : String(status.program.broadcastPolicy.maxOverrunMs / 60000),
  );
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    setElapsed(0);
    const receivedAt = performance.now();
    const timer = setInterval(
      () => setElapsed(performance.now() - receivedAt),
      1000,
    );
    return () => clearInterval(timer);
  }, [status.serverNow]);
  const view = operatorViewState(status, elapsed, busy, stopBusy);
  const { session, active, observationFresh } = view;
  const workerStatus = !session
    ? "Stopped"
    : ["ended", "error"].includes(session.status)
      ? session.status
      : view.lifecycleFresh
        ? session.status
      : observationFresh
        ? session.status
        : "Unknown";

  const sessionCommands = status.commands.filter(
    (row) =>
      row.sessionId === undefined || row.sessionId === session?.sessionId,
  );
  const pending = sessionCommands.some((row) =>
    ["queued", "claimed"].includes(row.status),
  );
  const sessionPending = sessionCommands.some(
    (row) =>
      row.sessionId !== undefined &&
      row.sessionId === session?.sessionId &&
      ["queued", "claimed"].includes(row.status),
  );
  const disabled =
    busy ||
    Boolean(session?.connectionTest) ||
    Boolean(view.pending) ||
    !status.canControl ||
    stopBusy ||
    session?.status === "stopping";
  async function submit(action: () => Promise<unknown>) {
    if (
      lock.current ||
      stopLock.current ||
      !status.canControl ||
      session?.status === "stopping"
    )
      return false;
    lock.current = true;
    setBusy(true);
    setFailure(false);
    try {
      await action();
      return true;
    } catch {
      setFailure(true);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function confirmAndStop() {
    if (stopLock.current || !status.canControl || !session) return;
    stopLock.current = true;
    setStopBusy(true);
    setFailure(false);
    try {
      await onStop(session.sessionId);
    } catch {
      setFailure(true);
    } finally {
      stopLock.current = false;
      setStopBusy(false);
      setChange(null);
    }
  }
  async function cut(expected?:CommandExpected) {
    if (cutLock.current || stopLock.current || !view.canCut) return;
    cutLock.current = true;
    setCutBusy(true);
    setFailure(false);
    try {
      await onCommand("switch_hold", undefined, expected);
    } catch {
      setFailure(true);
    } finally {
      cutLock.current = false;
      setCutBusy(false);
    }
  }
  async function cancel() {
    if (
      cancelLock.current ||
      stopLock.current ||
      !view.canCancel ||
      !view.pending
    )
      return;
    cancelLock.current = true;
    setFailure(false);
    try {
      await onCancel(view.pending.commandId);
    } catch {
      setFailure(true);
    } finally {
      cancelLock.current = false;
    }
  }
  function requestCommand(type: Command, key?:string, label?:string) {
    if (!session || !status.canControl) return;
    const source = type === "switch_next" ? nextSource : type === "hold_current" ? status.sources.find(row=>row.sourceId === session.currentSourceId) : key ? status.sources.find(row => row.key === key) : undefined;
    const capturedKey = type === "hold_current" ? source?.key ?? "hold-slate" : key;
    const expected = {expectedSessionId:session.sessionId,expectedIntentSequence:session.intentSequence ?? 0, ...(source ? {expectedSourceRevision:source.revision} : {})};
    setChange({title:label ?? "Change broadcast?", label:label ?? "Confirm", sessionId:session.sessionId, epoch:session.epoch,
      message:type === "switch_next" ? "Advance the lineup. The current automatic or manual mode stays the same." : type === "set_automatic_mode" ? "Resume following the event lineup." : type === "resume_previous" ? "Return to the previous source. Automatic switching stays paused." : type === "switch_source" ? "Put this source on air and pause automatic switching." : "Pause automatic switching and hold this output.",
      run:() => type === "switch_hold" ? cut(expected) : submit(() => onCommand(type,capturedKey,expected)),
    });
  }
  async function confirmChange() {
    if (!change || !status.canControl || change.sessionId !== session?.sessionId || change.epoch !== session?.epoch) {
      change?.cancel?.(); setChange(null); setFailure(true); return;
    }
    const action = change.run; setChange(null); await action();
  }
  function dismissChange() {
    change?.cancel?.();
    setChange(null);
  }
  function outputHealth(output:OperatorStatus["outputs"][number]) {
    if (output.authorized === false) return "Unknown";
    if (view.offAir) return "Off air";
    const fresh=eventBroadcastObservationFresh({serverNow:status.serverNow,elapsedMs:elapsed,leaseExpiresAt:session?.leaseExpiresAt,observedAt:session?.outputHealthObservedAt,status:session?.status});
    const observed = fresh ? session?.outputHealth.find(row=>row.outputId===output.outputId) : undefined;
    return observed?.status ?? (view.lifecycleFresh ? session?.status ?? "Unknown" : "Unknown");
  }
  const usableOutputs = status.outputs.filter(row => row.authorized !== false && ["ready", "active"].includes(row.state));
  const primaryOutputs = usableOutputs.filter(row=>!row.simulcastEnabled);
  const readyOutputs = primaryOutputs.length ? primaryOutputs : usableOutputs;
  const actualLabel = view.observedSource ? status.sources.find(source=>source.sourceId===view.observedSource?.sourceId && source.revision===view.observedSource.revision)?.label ?? view.actual : view.actual;
  const selectedOutput = readyOutputs.length === 1 ? readyOutputs[0].key : outputKey;
  const destination = (active ? status.outputs.find(row=>row.outputId===status.program?.currentOutputId) : undefined) ?? status.outputs.find(row => row.key === selectedOutput) ?? status.outputs[0];
  const outputLink = destination?.playbackLinks.find(link=>link.platform === "standalone") ?? destination?.playbackLinks[0];
  const destinationLinks = destination?.playbackLinks.filter(link=>link.platform !== "browser" || !destination.playbackLinks.some(other=>other.platform !== "browser" && other.url === link.url)) ?? [];
  let outputInput: OperatorStatus["sources"][number]["input"];
  try {outputInput = outputLink ? parseBroadcastInputUrl(outputLink.url) : undefined;} catch { /* Keep the public playback link available. */ }
  const setupPath = `${status.eventPath}/operate/setup`;
  return (
    <PageShell className="py-5">
      <PageContainer max="6xl">
        <div className="ph-no-capture space-y-8" data-ph-no-capture data-testid="event-operator-controls">
          <PageActions><Link href={status.eventPath}>Event</Link><Link href={`${status.eventPath}/host`}>Host view</Link><Link href={`${status.eventPath}/edit`}>Edit event</Link></PageActions>
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div><Link className="text-sm text-muted" href={status.eventPath}>{title ?? status.eventTitle}</Link><h1 className="mt-2 text-4xl font-semibold tracking-tight">Broadcast</h1></div>
            <div className="flex items-center gap-4"><span className="text-sm capitalize" role="status">{workerStatus}</span><Button variant="secondary" disabled={stopBusy || !status.canControl || !active || session?.status === "stopping"} onClick={() => session && setChange({title:"Stop this broadcast?",message:"The output will stop.",label:"Stop broadcast",sessionId:session.sessionId,epoch:session.epoch,run:confirmAndStop})}>Stop</Button></div>
          </header>
          <div className="grid items-start gap-8 min-[850px]:grid-cols-[minmax(0,1fr)_310px]">
            <section className="min-w-0" aria-label="Broadcast output">
              <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Output</h2><span className="text-sm text-muted">{actualLabel}</span></div>
              {active && observationFresh && outputInput && outputLink ? <EventOperatorPreview source={{label:destination?.label ?? "Output",input:outputInput,publicUrl:outputLink.url}}/> : <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-control border border-border bg-[#070b12] text-white">
                <Radio aria-hidden="true" className="size-10 text-accent"/><strong className="text-xl">{session?.status === "error" ? "Error" : actualLabel}</strong><span className="text-sm text-slate-400">{active ? workerStatus : title ?? status.eventTitle}</span>
              </div>}
              <dl className="flex flex-wrap gap-8 border-b border-border py-4"><div><dt className="text-xs text-muted">On air</dt><dd className="mt-1 text-sm font-medium">{active ? actualLabel : "None"}</dd></div><div><dt className="text-xs text-muted">Up next</dt><dd className="mt-1 text-sm font-medium">{nextSource?.label ?? status.nextSlot?.displayLabel ?? "End of lineup"}</dd></div><div><dt className="text-xs text-muted">Switching</dt><dd className="mt-1 text-sm font-medium">{observationFresh ? session?.broadcastMode ?? "Unknown" : active ? "Unknown" : "Automatic"}</dd></div></dl>
              <div className="mt-4 flex flex-wrap gap-3">
            {active && session?.status === "hold" && session.resumeSource && <Button disabled={disabled} onClick={()=>requestCommand("resume_previous",status.sources.find(source=>source.sourceId===session.resumeSource?.sourceId)?.key,"Resume previous source")}>Resume previous source</Button>}
            <Button
              disabled={disabled || !active || !nextSource}
              onClick={() => requestCommand("switch_next", nextSource?.key, nextSource ? `Next DJ: ${nextSource.label}` : "Next DJ") }
            >
              {nextSource ? `Next DJ: ${nextSource.label}` : "Next"}
            </Button>
            <Button
              variant="secondary"
              disabled={disabled || !active}
              onClick={() => requestCommand("hold_current", undefined, "Hold current")}
            >
              Hold current
            </Button>
            <Button
              variant="secondary"
              disabled={!view.canCut || cutBusy}
              onClick={() => requestCommand("switch_hold", undefined, "Hold slate")}
            >
              Cut to slate
            </Button>
            <Button
              variant="secondary"
              disabled={disabled || !active}
              onClick={() => requestCommand("set_automatic_mode", undefined, "Return to auto")}
            >
              Return to auto
            </Button>
          </div>

            </section>
            <aside className="min-w-0 rounded-control border border-border bg-surface p-5" aria-label="Destination">
              {destination ? <>
                <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Destination</h2>{status.canControl && !status.outputConfigurationLocked && <Link className="text-sm text-muted" href={setupPath}>Edit connection</Link>}</div>
                <div className="mb-4 flex items-center justify-between gap-3"><strong className="text-sm">{destination.label}</strong><span className="text-sm capitalize text-muted">{active ? outputHealth(destination) : destination.testState === "not_tested" ? "Not tested" : destination.testState === "failed" ? "Test failed" : destination.testState === "passed" ? "Test passed" : destination.state}</span></div>
                {!active && readyOutputs.length > 1 && <label className="mb-4 grid gap-2 text-sm">Primary output<select aria-label="Primary output" className="rounded-control border border-border bg-surface p-2" value={outputKey} onChange={e=>setOutputKey(e.target.value)}><option value="">Select output</option>{readyOutputs.map(row=><option key={row.outputId} value={row.key}>{row.label}</option>)}</select></label>}
                {!active && <Button className="w-full" disabled={busy || sessionPending || !status.canControl || Boolean(active) || status.outputConfigurationLocked || !selectedOutput} onClick={()=>submit(()=>onStart(selectedOutput))}>Start</Button>}
                {destinationLinks.length > 0 && <div className="mt-4 border-t border-border pt-1">{destinationLinks.map(link=><CopyValueRow key={`${link.platform}:${link.url}`} label={link.label ?? `${link.platform} URL`} value={link.url}/>)}</div>}
                <details className="mt-5 border-t border-border pt-3"><summary className="cursor-pointer text-sm">Stream settings</summary><div className="pt-4"><EventStreamSettings embedded settings={status.program?.mediaSettings ?? NEW_PROGRAM_MEDIA_SETTINGS} activeSettings={active ? session?.mediaSettings : undefined} canControl={status.canControl} onSave={onSaveSettings}/></div></details>
              </> : <Link aria-disabled={!status.canControl} href={status.canControl ? setupPath : status.eventPath} className="flex min-h-[100px] items-center gap-4 rounded-control bg-gradient-to-br from-accent/15 to-surface p-1"><Radio aria-hidden="true" className="size-8 shrink-0 text-accent"/><span className="flex-1 text-lg font-semibold">Set up broadcast</span><ArrowUpRight aria-hidden="true" className="size-5"/></Link>}
            </aside>
          </div>
          {change && <dialog ref={dialog} onCancel={dismissChange} aria-labelledby="broadcast-change-title" className="m-auto w-full max-w-md rounded-control border border-border bg-surface-strong p-6 text-foreground backdrop:bg-black/60">
            <h2 id="broadcast-change-title" className="text-xl font-semibold">{change?.title}</h2><p className="my-4 text-sm text-muted">{change?.message}</p><div className="flex gap-3"><Button autoFocus onClick={dismissChange}>Cancel</Button><Button variant={change?.label === "Stop broadcast" ? "danger" : "primary"} disabled={!status.canControl} onClick={() => void confirmChange()}>{change?.label}</Button></div>
          </dialog>}
          <p role="status">
            {failure
              ? "Command failed"
              : stopBusy || session?.status === "stopping"
                ? "Stopping"
                : view.pending?.phase === "preparing"
                  ? "Preparing"
                  : view.pending?.phase === "promoting"
                    ? "Promoting"
                    : busy || pending
                      ? "Command pending"
                      : ""}
          </p>
          {onPrepare && <EventBroadcastQuickSwitch eventPath={status.eventPath} now={status.serverNow + elapsed} observedSource={view.observedSource} disabled={!status.canControl || stopBusy || session?.status === "stopping"} canTake={view.canTake} onPrepare={onPrepare} onTake={source => {
            if (!session) return;
            const expected = {expectedSessionId:session.sessionId,expectedIntentSequence:session.intentSequence ?? 0,expectedSourceRevision:source.revision};
            setChange({title:`Put ${source.label} on air?`,message:"This replaces the current output and pauses automatic switching.",label:`Put ${source.label} on air`,sessionId:session.sessionId,epoch:session.epoch,run:()=>submit(()=>onCommand("switch_source",source.key,expected))});
          }} />}
          <EventOperatorSources
            sources={status.sources}
            control={{
              status,
              canTake: view.canTake,
              canCancel: view.canCancel,
              pending: view.pending ?? null,
              now: status.serverNow + elapsed,
              observedSource: view.observedSource,
            }}
            canControl={
              status.canControl && !stopBusy && session?.status !== "stopping"
            }
            onTake={(source) =>
              requestCommand("switch_source", source.key, `Put ${source.label} on air`)
            }
            onCancel={() => {if (!session) return;setChange({title:"Cancel this switch?",message:"Keep the current output.",label:"Cancel switch",sessionId:session.sessionId,epoch:session.epoch,run:cancel});}}
            onCreate={onCreate}
            onReplace={(source,input) => {
              const expected = {expectedSourceRevision:source.revision,...(active && session ? {expectedSessionId:session.sessionId,expectedIntentSequence:session.intentSequence ?? 0} : {})};
              if (!active || !session) return onReplace(source,input,expected);
              return new Promise<boolean>(resolve => setChange({title:`Replace ${source.label}?`,message:"Update this input for the broadcast.",label:"Replace source",sessionId:session.sessionId,epoch:session.epoch,cancel:()=>resolve(false),run:async()=>resolve(await submit(()=>onReplace(source,input,expected)))}));
            }}
            onRemove={source => {
              const expected = {expectedSourceRevision:source.revision,...(active && session ? {expectedSessionId:session.sessionId,expectedIntentSequence:session.intentSequence ?? 0} : {})};
              if (!active || !session) return onRemove(source,expected);
              setChange({title:`Remove ${source.label}?`,message:"Remove this source from the broadcast lineup.",label:"Remove source",sessionId:session.sessionId,epoch:session.epoch,run:()=>submit(()=>onRemove(source,expected))});
              return Promise.resolve();
            }}
          />

          <details className="border-t border-border pt-4"><summary className="cursor-pointer text-sm text-muted">Broadcast details</summary><div className="mt-5 space-y-6">
          <dl className="grid grid-cols-2 gap-6 border-y border-border py-6 sm:grid-cols-4">
            <div>
              <dt className="text-sm text-muted">Scheduled now</dt>
              <dd>{status.currentSlot?.displayLabel ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Scheduled next</dt>
              <dd>{status.nextSlot?.displayLabel ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Desired source</dt>
              <dd>{view.desired}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Observed output</dt>
              <dd>{view.actual}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Pending source</dt>
              <dd>{view.pendingLabel}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Worker</dt>
              <dd className="capitalize">{workerStatus}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Observed mode</dt>
              <dd>
                {view.offAir ? "None" : observationFresh
                  ? (session?.broadcastMode ?? "Unknown")
                  : "Unknown"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Session deadline</dt>
              <dd>
                {session?.runtimeDeadlineAt ? (
                  <ViewerLocalEventDateTime
                    timestamp={session.runtimeDeadlineAt}
                  />
                ) : (
                  "None"
                )}
              </dd>
            </div>
          </dl>
{!destination && <EventStreamSettings settings={status.program?.mediaSettings ?? NEW_PROGRAM_MEDIA_SETTINGS} activeSettings={active ? session?.mediaSettings : undefined} canControl={status.canControl} onSave={onSaveSettings}/>}
<section className="space-y-3"><h2 className="text-lg font-semibold">Output health</h2>{status.outputs.map(output=><div key={output.outputId} className="flex justify-between gap-3 border-b border-border py-2 text-sm"><span>{output.label}</span><span>{outputHealth(output)}</span></div>)}</section>
<EventOperatorDiagnostics session={session} now={status.serverNow + elapsed}/>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Handoff policy</h2>
            <label className="block text-sm">
              Maximum overrun (minutes)
              <input
                className="ml-3 w-24 rounded border border-border bg-surface p-2"
                type="number"
                min="0"
                max="1440"
                value={overrun}
                placeholder="Off"
                onChange={(e) => setOverrun(e.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              disabled={disabled || Boolean(active)}
              onClick={() =>
                submit(() =>
                  onPolicy(
                    overrun === "" ? undefined : Number(overrun) * 60000,
                  ),
                )
              }
            >
              Save policy
            </Button>
          </section>
          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Commands</h2>
            {status.commands.slice(0, 10).map((command) => (
              <div
                className="flex flex-wrap justify-between gap-3 border-b border-border py-2 text-sm"
                key={command.commandId}
              >
                <span>{command.commandType.replaceAll("_", " ")}</span>
                <span>
                  {command.controlOutcome === "superseded"
                    ? "superseded"
                    : command.status}
                </span>
              </div>
            ))}
          </section>

          </div></details>
        </div>
      </PageContainer>
    </PageShell>
  );
}
