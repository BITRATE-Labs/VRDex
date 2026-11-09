"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex-generated-api";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { CopyValueRow } from "@/components/ui/copy-value-row";
import { BrandLink, PageContainer, PageNav, PageShell } from "@/components/ui/page-shell";
import { broadcastPlaybackLinks, broadcastServers, checkBroadcastServer, type BroadcastProvider } from "@/lib/broadcast-connection";
export type BroadcastSetupState = FunctionReturnType<typeof api.eventBroadcastConnections.getSetup>;
type TestId = NonNullable<BroadcastSetupState["activeTest"]>["jobId"];
export const getBroadcastSetup = api.eventBroadcastConnections.getSetup;
export function EventBroadcastSetup({currentSlug,eventPath,eventTitle}:{currentSlug:string;eventPath:string;eventTitle:string}) {
  const {isAuthenticated}=useConvexAuth();
  const state = useQuery(getBroadcastSetup,isAuthenticated ? {currentSlug} : "skip");
  const start = useMutation(api.eventBroadcastConnectionTests.startConnectionTest), cancel = useMutation(api.eventBroadcastConnectionTests.cancelConnectionTest);
  const testRequest = useRef<{revision:number;key:string} | null>(null);
  if (!isAuthenticated || !state) return <PageShell><PageContainer max="3xl"><p role="status">Loading connection…</p></PageContainer></PageShell>;
  return <EventBroadcastSetupForm key={currentSlug} currentSlug={currentSlug} eventPath={eventPath} eventTitle={eventTitle} state={state} onStart={revision=>{
    if(testRequest.current?.revision!==revision || (state.activeTest && ["passed","failed","cancelled"].includes(state.activeTest.state))) testRequest.current={revision,key:crypto.randomUUID()};
    return start({currentSlug,expectedRevision:revision,idempotencyKey:testRequest.current.key});
  }} onCancel={jobId=>cancel({currentSlug,jobId})}/>;
}
export function EventBroadcastSetupForm({currentSlug,eventPath,eventTitle,state,onStart,onCancel}:{currentSlug:string;eventPath:string;eventTitle:string;state:BroadcastSetupState;onStart:(revision:number)=>Promise<unknown>;onCancel:(jobId:TestId)=>Promise<unknown>}) {
  const connection = state.connection;
  const [step,setStep] = useState(state.activeTest && state.activeTest.revision === connection?.revision ? 3 : 1), [provider,setProvider] = useState<BroadcastProvider>(connection?.provider ?? "vrcdn");
  const [server,setServer] = useState(connection?.serverUrl ?? broadcastServers.vrcdn), [key,setKey] = useState(""), [playback,setPlayback] = useState(connection?.playbackLinks.at(-1)?.url ?? "");
  const [permissions,setPermissions] = useState(false);
  const [error,setError] = useState(""), [busy,setBusy] = useState(false), [revision,setRevision] = useState(connection?.revision ?? 0);
  const lock = useRef(false), requestId = useRef<string | undefined>(undefined), leaveDialog = useRef<HTMLDialogElement>(null), title = useRef<HTMLHeadingElement>(null);
  const job = state.activeTest?.revision === revision ? state.activeTest : null, running = job && ["queued","running","stopping"].includes(job.state);
  const passed = step === 3 && job?.state === "passed";
  const canReuse = connection?.provider === provider && connection.serverUrl === server;
  const dirty = step < 3 && (Boolean(key) || playback !== (connection?.playbackLinks.at(-1)?.url ?? "") || server !== (connection?.serverUrl ?? broadcastServers.vrcdn));
  const returnPath = `${eventPath}/operate`;
  useEffect(()=>{title.current?.focus();},[step,passed]);
  let links: ReturnType<typeof broadcastPlaybackLinks> = [];
  try { links = broadcastPlaybackLinks(playback); } catch { /* Validate on Continue. */ }
  async function save() {
    if (lock.current || !state.canConfigure) return;
    try { broadcastPlaybackLinks(playback); checkBroadcastServer(server); } catch (failure) {setError(failure instanceof Error ? failure.message : "Check the connection details.");return;}
    lock.current=true;setBusy(true);setError("");
    requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/event-broadcast/connections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentSlug,provider,serverUrl:server,streamKey:key || undefined,permissionsAccepted:permissions,playbackUrl:playback,expectedRevision:revision,requestId:requestId.current})});
      if (!response.ok) throw Error("Couldn’t save this connection. Check the details and try again.");
      const body:unknown = await response.json();
      if (typeof body !== "object" || body === null || !("connection" in body) || typeof body.connection !== "object" || body.connection === null || !("revision" in body.connection) || typeof body.connection.revision !== "number") throw Error("Couldn’t save this connection. Try again.");
      setRevision(body.connection.revision);setKey("");setStep(3);requestId.current=undefined;
    } catch(failure) {setError(failure instanceof Error ? failure.message : "Couldn’t save this connection.");}
    finally {lock.current=false;setBusy(false);}
  }
  async function test() {
    if (lock.current || !state.canConfigure || running) return;
    lock.current=true;setBusy(true);setError("");
    try {await onStart(revision);} catch {setError("Couldn’t start the test. Try again.");} finally {lock.current=false;setBusy(false);}
  }
  function advance() {try {checkBroadcastServer(server);if (!key.trim() && !canReuse) throw Error("Enter your stream key.");setError("");setStep(2);}catch(failure){setError(failure instanceof Error ? failure.message : "Check the connection details.");}}
  return <PageShell className="py-5"><PageContainer max="3xl"><div className="ph-no-capture space-y-8" data-ph-no-capture>
    <PageNav showMyEvents={false}><BrandLink/>{!running && !passed && <Link href={returnPath} onClick={event=>{if(dirty){event.preventDefault();leaveDialog.current?.showModal();}}}>Back to broadcast</Link>}</PageNav>
    <dialog ref={leaveDialog} className="m-auto max-w-md rounded-control border border-border bg-surface p-6 text-foreground backdrop:bg-black/60"><h2 className="text-xl font-semibold">Discard connection changes?</h2><div className="mt-5 flex gap-3"><Button onClick={()=>leaveDialog.current?.close()}>Keep editing</Button><Link className={buttonVariants({variant:"secondary"})} href={returnPath}>Discard changes</Link></div></dialog>
    <header><p className="mb-2 text-sm text-muted">{eventTitle}</p><h1 ref={title} tabIndex={-1} className="text-3xl font-semibold tracking-tight">{passed ? "Connection test passed" : step === 1 ? "Connect your stream" : step === 2 ? "Add the playback link" : "Test your connection"}</h1></header>
    <ol className="flex gap-6 border-b border-border pb-4 text-sm" aria-label="Setup progress">{["Connection","Playback","Test"].map((label,index)=><li key={label} aria-current={step===index+1 ? "step" : undefined} className={step===index+1 ? "font-medium text-foreground" : "text-muted"}>{index+1}. {label}</li>)}</ol>
    <section className="relative overflow-hidden rounded-control border border-border bg-surface p-6 sm:p-8">
      {step===1 && <form className="grid gap-6" onSubmit={e=>{e.preventDefault();advance();}}><fieldset disabled={!state.canConfigure || busy} className="grid gap-6"><div className="flex flex-wrap gap-3" role="group" aria-label="Service">{(["twitch","vrcdn","custom"] satisfies BroadcastProvider[]).map(value=><Button key={value} type="button" aria-pressed={provider===value} variant={provider===value ? "primary" : "secondary"} onClick={()=>{setProvider(value);setServer(broadcastServers[value]);setKey("");setError("");requestId.current=undefined;}}>{value==="vrcdn" ? "VRCDN" : value==="twitch" ? "Twitch" : "Custom"}</Button>)}</div>
      {provider==="custom" ? <Field>Server URL<Input value={server} onChange={e=>{setServer(e.target.value);requestId.current=undefined;}} autoComplete="off" placeholder="rtmps://…" required/></Field> : <p className="break-all text-sm text-muted">{server}</p>}
      <Field>Stream key<Input type="password" autoComplete="off" value={key} placeholder={canReuse ? "Saved stream key" : undefined} onChange={e=>{setKey(e.target.value);requestId.current=undefined;}} required={!canReuse}/></Field><label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={permissions} onChange={e=>setPermissions(e.target.checked)}/>I confirm I am authorized to publish this event through the selected output account.</label><div className="flex justify-end"><Button type="submit">Continue</Button></div></fieldset></form>}
      {step===2 && <form className="grid gap-5" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={!state.canConfigure || busy} className="grid gap-5"><Field>Playback URL<Input required value={playback} onChange={e=>{setPlayback(e.target.value);requestId.current=undefined;}} autoComplete="off"/></Field>{links.length>1 && <div>{links.map(link=><CopyValueRow key={link.platform} label={link.label ?? `${link.platform} URL`} value={link.url}/>)}</div>}<div className="flex justify-between"><Button type="button" variant="secondary" onClick={()=>setStep(1)}>Back</Button><Button type="submit">{busy ? "Saving…" : "Continue"}</Button></div></fieldset></form>}
      {step===3 && <div className="grid gap-6">
        {passed ? <><div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">{Array.from({length:24},(_,i)=><span key={i} className="absolute h-3 w-1.5 bg-accent" style={{left:`${(i*37)%100}%`,top:`${(i*29)%75}%`,animation:`broadcast-confetti 1.8s ${i*20}ms both ease-out`,transform:`rotate(${i*23}deg)`}}/>)}</div><style>{`@keyframes broadcast-confetti {from {opacity:1;translate:0 -40px} to {opacity:0;translate:0 180px;rotate:180deg}}`}</style><h2 className="text-xl font-semibold">You’re connected</h2><Link className={buttonVariants()} href={returnPath}>Back to broadcast</Link></> : <><p className="text-sm text-muted">A short test video will play on this stream.</p>{job && <p role="status" className="capitalize">{running ? "Testing connection…" : job.state}</p>}{job?.state==="failed" && <p role="alert">The test didn’t complete. Check your connection and try again.</p>}<div className="flex flex-wrap gap-3"><Button disabled={!state.canConfigure || busy || Boolean(running)} onClick={()=>void test()}>{busy ? "Starting…" : "Test connection"}</Button>{running ? <Button variant="secondary" disabled={job.state==="stopping"} onClick={()=>{void onCancel(job.jobId).catch(()=>setError("Couldn’t cancel the test. Try again."));}}>Cancel test</Button> : <Link className={buttonVariants({variant:"secondary"})} href={returnPath}>Skip test</Link>}</div>{!running && <Button variant="ghost" onClick={()=>setStep(1)}>Edit connection</Button>}</>}
      </div>}
      {error && <p role="alert" className="mt-5 text-sm text-danger">{error}</p>}
    </section>
  </div></PageContainer></PageShell>;
}
