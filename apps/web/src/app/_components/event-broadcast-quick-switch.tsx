"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex-generated-api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { EventIdentityOption } from "@/lib/event-editor-identity";
import { eventDjTarget } from "@/lib/event-dj-target";
import { parseSourceObservations, type SourceObservation } from "@/lib/event-source-observations";
import { operatorSourceAvailability } from "@/lib/event-operator-state";
import { parseBroadcastInputUrl, broadcastInputPublicUrl } from "../../../../../convex/_broadcastInputUrl";
import { EventIdentityPicker } from "../events/event-identity-picker";
import { EventOperatorPreview } from "./event-operator-preview";

export type PreparedBroadcastSource = FunctionReturnType<typeof api.eventMediaSources.create>;
export function EventBroadcastQuickSwitch({eventPath, disabled, canTake, now, observedSource, onPrepare, onTake}: {
  eventPath:string; disabled:boolean; canTake:boolean;
  now:number; observedSource?:{sourceId:string;revision:number};
  onPrepare:(name:string,url:string,idempotencyKey:string)=>Promise<PreparedBroadcastSource>;
  onTake:(source:PreparedBroadcastSource)=>void;
}) {
  const [person,setPerson] = useState<EventIdentityOption | null>(null);
  const choices = useQuery(api.events.getPersonBroadcastInputChoices, person ? {personSlug:person.slug} : "skip");
  const [url,setUrl] = useState("");
  const [source,setSource] = useState<PreparedBroadcastSource | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [observation,setObservation] = useState<SourceObservation>();
  const generation = useRef(0);
  const lock = useRef(false);
  const request = useRef<{url:string;name:string;key:string} | null>(null);
  useEffect(() => () => {generation.current++;}, []);
  function reset() {generation.current++; setBusy(false); setSource(null); setError(""); setObservation(undefined);}
  async function check() {
    if (lock.current || disabled) return;
    const target = eventDjTarget(url);
    let input;
    try {input = parseBroadcastInputUrl(url);} catch {setError("Enter a supported video or stream link."); return;}
    const name = person?.title ?? target?.label ?? (input.kind === "direct_media" ? new URL(input.url).hostname : "Video source");
    if (request.current?.url !== url || request.current?.name !== name) request.current = {url,name,key:crypto.randomUUID()};
    const current = ++generation.current;
    lock.current = true; setBusy(true); setError(""); setSource(null); setObservation(undefined);
    try {
      const prepared = await onPrepare(name,url,request.current.key);
      if (generation.current !== current) return;
      request.current = null;
      setSource(prepared);
      if (prepared.input?.kind === "direct_media") return;
      const response = await fetch(`${eventPath}/operate/status?ids=${encodeURIComponent(prepared.sourceId)}`, {signal:AbortSignal.timeout(12_000)});
      if (!response.ok) throw Error();
      const observations = parseSourceObservations(await response.json());
      if (generation.current === current) setObservation(target ? observations[target.key] : undefined);
    } catch {if (generation.current === current) setError("Couldn’t check this source. Try again.");}
    finally {lock.current=false; if (generation.current === current) setBusy(false);}
  }
  return <section className="space-y-3" aria-label="Quick switch"><h2 className="text-lg font-semibold">Quick switch</h2>
    <EventIdentityPicker kind="person" selectedSlug={person?.slug} selectedOption={person} disabled={disabled || busy} onSelect={value => {reset(); setPerson(value); setUrl("");}} onClear={() => {reset(); setPerson(null); setUrl("");}} />
    {person && choices === undefined && <p role="status">Loading stream links…</p>}
    {person && choices?.length === 0 && <p className="text-sm text-muted">No stream links on this profile. Paste a link below.</p>}
    {person && Boolean(choices?.length) && <Field>Stream<select disabled={disabled || busy} className="rounded-control border border-border bg-surface p-3" value={url} onChange={e=>{reset();setUrl(e.target.value);}}><option value="">Choose a stream</option>{choices?.map(choice => <option key={choice.key} value={broadcastInputPublicUrl(choice.input)}>{choice.label}</option>)}</select></Field>}
    <form className="flex items-end gap-3" onSubmit={e=>{e.preventDefault();void check();}}><Field className="min-w-0 flex-1">Or paste a link<Input required disabled={disabled || busy} value={url} onChange={e=>{reset();setUrl(e.target.value);}} /></Field><Button type="submit" disabled={disabled || busy}>{busy ? "Checking…" : "Check source"}</Button></form>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {source && <section className="space-y-3 rounded-control border border-border p-4" aria-label="Quick switch preview"><p role="status" className="text-sm capitalize">{busy ? "Checking…" : operatorSourceAvailability(source,observation,now,observedSource)}</p><EventOperatorPreview source={source} onClose={reset} /><Button disabled={!canTake || busy} onClick={()=>onTake(source)}>Put {source.label} on air</Button></section>}
  </section>;
}
