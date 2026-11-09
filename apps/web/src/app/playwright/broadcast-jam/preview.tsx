"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ArrowUpRight, Radio } from "lucide-react";
import { CopyValueRow } from "@/components/ui/copy-value-row";
import { BrandLink, PageContainer, PageNav, PageShell } from "@/components/ui/page-shell";
import { previewVideoLink } from "./video-link";
import { PersonLookup } from "./person-lookup";
import { BroadcastSetup } from "./setup-wizard";
import { demoConnection, type BroadcastConnection } from "./destination-setup";
import styles from "./preview.module.css";

type Phase = "ready" | "starting" | "live" | "reconnecting" | "stopped";
type Source = ReturnType<typeof previewVideoLink> & { name: string; time: string; status: "checking" | "ready" | "failed" };
type StreamChange = {
  title: string;
  message: string;
  label: string;
  apply: () => void;
  url?: string;
  destructive?: boolean;
};
const initialSources: Source[] = [
  { key: "aurora", name: "Aurora", title: "Aurora", time: "Now", provider: "VRCDN", status: "ready", url: "" },
  { key: "nova", name: "Nova", title: "Nova", time: "Next", provider: "Twitch", status: "ready", url: "" },
  { key: "orion", name: "Orion", title: "Orion", time: "Later", provider: "VRCDN", status: "ready", url: "" },
];
export function BroadcastJam({ showTools = false }: { showTools?: boolean }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [sources, setSources] = useState(initialSources);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = sources.find(source => source.key === selectedKey);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selectedKey) previewHeading.current?.focus();
    else previewTrigger.current?.focus();
  }, [selectedKey]);
  const [adding, setAdding] = useState(false);
  const [inputName, setInputName] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [inputError, setInputError] = useState("");
  const [quickUrl, setQuickUrl] = useState("");
  const [quickSource, setQuickSource] = useState<Source | null>(null);
  const [checkingKey, setCheckingKey] = useState<string | null>(null);
  const [failSourceCheck, setFailSourceCheck] = useState(false);
  const checkTimer = useRef<number | undefined>(undefined);
  const [switchMessage, setSwitchMessage] = useState("");
  const [lineupPosition, setLineupPosition] = useState(-1);
  const nextSource = initialSources[lineupPosition + 1];
  const switchTimer = useRef<number | undefined>(undefined);
  const [onAir, setOnAir] = useState("Aurora");
  const [hasPreviousSource, setHasPreviousSource] = useState(false);
  const [automatic, setAutomatic] = useState(true);
  const [slate, setSlate] = useState(false);
  const [pendingChange, setPendingChange] = useState<StreamChange | null>(null);
  const changeDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (pendingChange) changeDialog.current?.showModal(); else changeDialog.current?.close(); }, [pendingChange]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [connection, setConnection] = useState<BroadcastConnection | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const destination = connection?.label ?? "World stream";
  const [quality, setQuality] = useState({ resolution: "1080p", frameRate: "30" });
  const [activeQuality, setActiveQuality] = useState(quality);
  const active = phase === "live" || phase === "reconnecting";
  useEffect(() => () => {window.clearTimeout(switchTimer.current); window.clearTimeout(checkTimer.current);}, []);
  function requestChange(change: StreamChange) {
    if (checkingKey) cancelSourceCheck();
    if (active) setPendingChange(change);
    else change.apply();
  }
  function previewState(label: string, apply: () => void) {
    requestChange({ title: `Change preview to ${label}?`, message: "This changes the simulated broadcast state.", label: "Change preview", apply });
  }
  function requestTake(source: Source | undefined, preserveMode = false) {
    if (!source) return;
    requestChange({
      title: `Switch to ${source.name}?`,
      message: `This puts ${source.name} on air. ${preserveMode ? automatic ? "Automatic switching stays on." : "Automatic switching stays paused." : "Automatic switching will pause."}`,
      label: `Switch to ${source.name}`,
      url: source.url || undefined,
      apply: () => take(source, preserveMode),
    });
  }
  function cancelSwitch() {
    window.clearTimeout(switchTimer.current);
    switchTimer.current = undefined;
    setSwitching(null);
  }
  function start() {
    if (!connection) return;
    setLineupPosition(-1);
    setHasPreviousSource(false);
    setActiveQuality(quality);
    setSlate(true); setAutomatic(true); setPhase("starting");
    window.setTimeout(() => setPhase("live"), 1100);
  }
  function take(source: Source | undefined, preserveMode: boolean) {
    if (!source || phase !== "live" || switchTimer.current !== undefined) return;
    if (source.status !== "ready") {
      setSwitchMessage(`${source.name} is not ready. The current output stays on air.`);
      return;
    }
    setSwitchMessage("");
    setSwitching(source.name);
    switchTimer.current = window.setTimeout(() => {
      switchTimer.current = undefined;
      setOnAir(source.name); setHasPreviousSource(true); setSlate(false); if (!preserveMode) setAutomatic(false); setSwitching(null);
      const position = initialSources.findIndex(row => row.key === source.key);
      if (position >= 0) setLineupPosition(position);
    }, 900);
  }
  function checkSource(source: Source, previewAfter = false) {
    if (checkTimer.current !== undefined) return;
    setCheckingKey(source.key);
    if (previewAfter) setQuickSource({...source, status:"checking"});
    setSources(rows => rows.map(row => row.key === source.key ? {...row, status:"checking"} : row));
    // shortcut: readiness is simulated here; replace with decoded-media checks when integrating the worker.
    checkTimer.current = window.setTimeout(() => {
      checkTimer.current = undefined; setCheckingKey(null);
      const checked: Source = {...source, status:failSourceCheck ? "failed" : "ready"};
      setSources(rows => rows.map(row => row.key === source.key ? {...row, status:checked.status} : row));
      if (previewAfter) {
        setQuickSource(checked);
        if (failSourceCheck) setSwitchMessage("Couldn’t play this source. Check the link and try again.");
      }
    }, 900);
  }
  function cancelSourceCheck() {
    window.clearTimeout(checkTimer.current); checkTimer.current = undefined; setCheckingKey(null);
    setSources(rows => rows.map(row => row.status === "checking" ? {...row, status:"failed"} : row));
    setQuickSource(source => source?.status === "checking" ? null : source);
  }
  function retrySource(source: Source, value: string) {
    try {
      const input = previewVideoLink(value);
      setInputError("");
      setSources(rows => rows.map(row => row.key === source.key ? {...row, url:input.url, provider:input.provider} : row));
      checkSource({...source, url:input.url, provider:input.provider});
    } catch {
      setInputError("Use a YouTube, Twitch, VRCDN or direct video link.");
    }
  }
  function stop() {
    cancelSwitch(); cancelSourceCheck();
    setPendingChange(null); setPhase("stopped"); setAutomatic(true); setSlate(false); setHasPreviousSource(false); setLineupPosition(-1); setSwitchMessage("");
  }
  function switchLink() {
    try {
      const input = previewVideoLink(quickUrl);
      const saved = sources.find(source => source.key === input.key || source.url === input.url);
      setSwitchMessage("");
      checkSource({ ...input, key:saved?.key ?? input.key, name:saved?.name ?? input.title, time:saved?.time ?? "Temporary", status: "checking" }, true);
    } catch {
      setSwitchMessage("Use a YouTube, Twitch, VRCDN or direct video link.");
    }
  }
  function choosePerson(name: string, url: string) {
    const input = previewVideoLink(url);
    setQuickUrl(url); setSwitchMessage("");
    checkSource({...input, name, time:"Temporary", status:"checking"}, true);
  }
  function addInput() {
    if (!inputName.trim()) {
      setInputError("Enter a name for this input.");
      return;
    }
    try {
      const input = previewVideoLink(inputUrl);
      const key = input.key;
      if (sources.some(source => source.key === key)) {
        setInputError("That input has already been added.");
        return;
      }
      const source: Source = {...input, key, name:inputName.trim(), time:"Custom", status:"checking"};
      setSources([...sources, source]);
      checkSource(source);
      setSelectedKey(key);
      setInputName(""); setInputUrl(""); setInputError(""); setAdding(false);
    } catch {
      setInputError("Use a YouTube, Twitch, VRCDN or direct video link.");
    }
  }
  if (setupOpen) return <BroadcastSetup showTools={showTools} connection={connection} onCancel={() => setSetupOpen(false)} onComplete={value => {setConnection(value); setPhase("ready"); setSetupOpen(false);}} />;
  return <PageShell className={styles.shell}><PageContainer max="5xl">
    <PageNav showMyEvents={false}><BrandLink /><Link className={buttonVariants({variant:"secondary"})} href="/account/events">My events</Link></PageNav>
    <header className={styles.header}><div><p className={styles.context}>Afterglow Harbor Sessions</p><h1>Broadcast</h1></div><div className={styles.headerActions}><span className={styles.state} data-active={active}>{phase === "live" ? "● Live" : phase === "reconnecting" ? "◌ Reconnecting" : phase === "starting" ? "◌ Starting" : "○ Offline"}</span>{active && <Button variant="secondary" onClick={() => requestChange({title:"Stop this broadcast?", message:`The output to ${destination} will stop.`, label:"Stop broadcast", destructive:true, apply:stop})}>Stop broadcast</Button>}</div></header>
    {phase === "reconnecting" && <div className={styles.warning} role="status"><div><strong>Output connection lost</strong><p>Reconnecting. What viewers can see is unknown.</p></div>{showTools && <Button variant="secondary" onClick={() => requestChange({title:"Simulate recovery?", message:"The preview will return to its live state.", label:"Simulate recovery", apply:() => setPhase("live")})}>Simulate recovery</Button>}</div>}
    <div className={styles.workspace}>
      <section aria-label="Broadcast output" className={styles.output}>
        <div className={styles.sectionHead}><h2>{active ? "Broadcast output" : "Output preview"}</h2><span>{active ? destination : "Not broadcasting"}</span></div>
        <div className={styles.screen} data-live={phase === "live"}>
          <div className={styles.frame}><span className={styles.frameCorner}>AFTERGLOW / HARBOR SESSIONS</span><div><div className={styles.orbit}/><h3>{phase === "reconnecting" ? "Connection interrupted" : slate || !active ? "Starting soon" : onAir}</h3><p>{phase === "reconnecting" ? "Last confirmed: " + (slate ? "Event slate" : onAir) : slate || !active ? "Afterglow Harbor Sessions" : null}</p></div><span className={styles.frameBottom}>AFTERGLOW</span></div>
        </div>
        <div className={styles.outputSummary} aria-live="polite"><div><span className={styles.label}>{active ? "On air" : "On start"}</span><strong>{phase === "reconnecting" ? "Unknown" : slate || !active ? "Event slate" : onAir}</strong></div><div><span className={styles.label}>Lineup</span><strong>{automatic ? "Automatic" : "Manual"}</strong></div><div><span className={styles.label}>Next DJ</span><strong>{nextSource?.name ?? "End of lineup"}</strong></div></div>
        <div className={styles.quickActions}><Button variant="primary" disabled={phase !== "live" || !nextSource || Boolean(switching)} onClick={() => requestTake(nextSource, true)}>{nextSource ? `Next DJ: ${nextSource.name}` : "End of lineup"}</Button><Button disabled={phase !== "live" || slate} onClick={() => requestChange({title:"Hold on the event slate?", message:"Show the event slate and pause automatic switching.", label:"Hold slate", apply:() => {cancelSwitch(); setSlate(true); setAutomatic(false); setSwitchMessage("");}})}>Hold slate</Button>{slate && active && hasPreviousSource && <Button disabled={phase !== "live" || Boolean(switching)} onClick={() => requestChange({title:`Resume ${onAir}?`, message:"Replace the event slate with this source. Automatic switching stays paused.", label:`Resume ${onAir}`, apply:() => {setSlate(false); setAutomatic(false);}})}>Resume {onAir}</Button>}<Button variant="ghost" disabled={phase !== "live" || Boolean(switching)} onClick={() => requestChange({title:automatic ? `Hold ${slate ? "the opening screen" : onAir}?` : "Return to automatic switching?", message:automatic ? "Keep the current source on air and pause automatic switching." : "Resume following the event lineup.", label:automatic ? "Hold current" : "Return to auto", apply:() => {setAutomatic(!automatic); if (!automatic && hasPreviousSource) setSlate(false);}})}>{automatic ? "Hold current" : "Return to auto"}</Button></div>
        <section className={styles.quickSwitchGroup} aria-label="Quick switch"><h3>Quick switch</h3><PersonLookup onReset={() => {if (quickSource?.status === "checking") cancelSourceCheck(); setQuickSource(null); setSwitchMessage("");}} disabled={Boolean(switching) || Boolean(checkingKey)} onSelect={choosePerson} />
        <form className={styles.quickSwitch} onSubmit={e => {e.preventDefault(); switchLink();}}><label htmlFor="quick-video-url">Or paste a link</label><div><input id="quick-video-url" type="url" required placeholder="DJ stream or video link" value={quickUrl} onChange={e => {if (quickSource?.status === "checking") cancelSourceCheck(); setQuickUrl(e.target.value); setQuickSource(null); setSwitchMessage("");}}/><Button type="submit" disabled={Boolean(switching) || Boolean(checkingKey)}>{quickSource?.status === "checking" ? "Checking…" : "Check source"}</Button></div></form></section>
        {quickSource && <section className={styles.quickPreview} aria-label="Quick switch preview" aria-busy={quickSource.status === "checking"}><div className={styles.previewImage}>{quickSource.status === "ready" ? quickSource.name : quickSource.status === "checking" ? "Checking source…" : "Couldn’t play this source"}</div><div className={styles.quickPreviewInfo}><div className={styles.sectionHead}><h3>{quickSource.provider}</h3><Button size="sm" variant="ghost" onClick={() => {if (quickSource.status === "checking") cancelSourceCheck(); setQuickSource(null);}}>Close</Button></div><p role="status" className={quickSource.status === "ready" ? styles.connection : styles.muted}>{quickSource.status === "ready" ? "Live" : quickSource.status === "checking" ? "Checking availability" : "Check failed"}</p><p className={styles.inputUrl}>{quickSource.url}</p>{quickSource.status === "ready" && <Button variant="primary" disabled={phase !== "live" || Boolean(switching) || (!slate && quickSource.name === onAir)} onClick={() => requestTake(quickSource)}>Put on air</Button>}{quickSource.status === "failed" && <Button disabled={Boolean(checkingKey)} onClick={switchLink}>Try again</Button>}</div></section>}
        <p role="status" className={styles.switchStatus}>{switching ? `Preparing ${switching}. Current output stays on air.` : switchMessage}</p>
      </section>
      <aside className={connection ? styles.side : styles.setupAside} aria-label="Broadcast setup">
        {connection && <h2>{active ? "Destination" : phase === "stopped" ? "Broadcast stopped" : connection.tested ? "Ready to broadcast" : "Broadcast setup"}</h2>}
        {!connection ? <button className={styles.setupCta} onClick={() => setSetupOpen(true)}><Radio aria-hidden="true" className={styles.setupCtaIcon} /><span>Set up broadcast</span><ArrowUpRight aria-hidden="true" className={styles.setupCtaArrow} /></button> : <>
        <div className={styles.destination}><div><strong>{destination}</strong><span className={phase !== "reconnecting" && (connection.tested || active) ? styles.connection : styles.muted}>{phase === "reconnecting" ? "Unknown" : active ? "Connected" : connection.tested ? "Ready" : "Not tested"}</span></div>{!active && phase !== "starting" && <Button size="sm" variant="ghost" aria-label="Edit connection" onClick={() => setSetupOpen(true)}>Edit</Button>}</div>
        {!active && <><div className={styles.check}><span>✓</span><div>Event slate available<small>Shown until the first DJ starts</small></div></div><div className={styles.check}><span>✓</span><div>Automatic lineup<small>Follows the event schedule</small></div></div><Button variant="primary" className={styles.start} disabled={phase === "starting"} onClick={start}>{phase === "starting" ? "Starting broadcast…" : "Start broadcast"}</Button></>}
        <section className={styles.worldLinks} aria-label="World player URLs"><div className={styles.sectionHead}><h3>World player URLs</h3></div><div>{connection.playback.map(link => <CopyValueRow key={link.label} label={link.label} value={link.url} />)}</div></section>
        </>}
        {connection && <details className={styles.details}><summary>Stream quality <span>{(active ? activeQuality : quality).resolution} · {(active ? activeQuality : quality).frameRate} fps</span></summary><div className={styles.settings}>{active && <p>On air: {activeQuality.resolution} · {activeQuality.frameRate} fps</p>}<label>Resolution<select value={quality.resolution} onChange={e => setQuality({ ...quality, resolution: e.target.value })}><option>480p</option><option>720p</option><option>1080p</option></select></label><label>Frame rate<select value={quality.frameRate} onChange={e => setQuality({ ...quality, frameRate: e.target.value })}><option value="30">30 fps</option><option value="60">60 fps</option></select></label><p>Changes apply on the next start.</p></div></details>}
      </aside>
    </div>
    <section className={styles.inputs} aria-label="Video sources"><div className={styles.sectionHead}><div><h2>Video sources</h2><p>DJ streams, videos and custom links</p></div><Button size="sm" onClick={() => {setAdding(!adding); setInputError("");}}>Add source</Button></div>
      {adding && <form className={styles.addInput} onSubmit={e => { e.preventDefault(); addInput(); }}><h3>Add source</h3><div className={styles.inputFields}><label>Name<input autoFocus required maxLength={80} value={inputName} onChange={e => setInputName(e.target.value)} placeholder="Guest DJ" /></label><label>Source URL<input type="url" required value={inputUrl} onChange={e => {setInputUrl(e.target.value); setInputError("");}} placeholder="YouTube, Twitch, VRCDN or video URL" aria-invalid={Boolean(inputError)} aria-describedby={inputError ? "input-error" : undefined} /></label></div>{inputError && <p id="input-error" role="alert">{inputError}</p>}<div className={styles.formActions}><Button variant="primary" type="submit" disabled={Boolean(checkingKey)}>Add source</Button><Button type="button" onClick={() => {setAdding(false); setInputError("");}}>Cancel</Button></div></form>}
      <div className={styles.inputLayout} data-preview={Boolean(selected)}><div>{sources.map(source => <div className={styles.source} key={source.key} data-selected={selectedKey === source.key}><div className={styles.avatar}>{source.name.slice(0,1)}</div><div className={styles.sourceName}><strong>{source.name}</strong><span>{active && !slate && source.name === onAir ? phase === "reconnecting" ? "Last on air" : "On air" : source.time === "Custom" ? "Custom" : source.key === nextSource?.key ? "Next" : "Lineup"} · {source.provider}</span></div><span className={source.status === "ready" ? styles.connection : styles.muted}>{source.status === "ready" ? "Live" : source.status === "checking" ? "Checking…" : "Check failed"}</span><Button variant="secondary" onClick={e => {previewTrigger.current = e.currentTarget; setSelectedKey(source.key);}} aria-pressed={selectedKey === source.key}>Preview</Button></div>)}</div>
      {selected && <section className={styles.inputPreview} aria-label="Input preview"><div className={styles.sectionHead}><h3 ref={previewHeading} tabIndex={-1}>Preview · {selected.name}</h3><Button size="sm" variant="ghost" onClick={() => setSelectedKey(null)}>Close preview</Button></div><div className={styles.previewImage}>{selected.status === "ready" ? selected.name : selected.status === "checking" ? "Checking source…" : "Couldn’t play this source"}</div>{selected.url && <p className={styles.inputUrl}>{selected.url}</p>}{selected.status === "failed" && <form className={styles.sourceRetry} onSubmit={e => {e.preventDefault(); retrySource(selected, String(new FormData(e.currentTarget).get("sourceUrl") ?? ""));}}><label>Source URL<input key={selected.key} name="sourceUrl" type="url" required defaultValue={selected.url} /></label><p role="alert" className={styles.inputUrl}>{inputError || "Check the source link and try again."}</p><Button type="submit" disabled={Boolean(checkingKey)}>Retry source check</Button></form>}<Button variant="primary" disabled={!active || phase !== "live" || selected.status !== "ready" || Boolean(switching) || (!slate && selected.name === onAir)} onClick={() => requestTake(selected)}>{switching ? "Preparing " + selected.name + "…" : "Put " + selected.name + " on air"}</Button></section>}</div>
    </section>
    <details className={styles.diagnostics}><summary>Technical details</summary><div className={styles.technical}><span>Worker: {active ? "Running" : "Stopped"}</span><span>Output: {phase === "reconnecting" ? "Unknown" : active ? "Confirmed" : "Inactive"}</span><span>{active ? "Active quality" : "Next start"}: {(active ? activeQuality : quality).resolution} · {(active ? activeQuality : quality).frameRate} fps · 320 kbps</span></div></details>
    {showTools && <footer className={styles.scenarios}><span>Preview states</span><label><input type="checkbox" checked={failSourceCheck} disabled={Boolean(checkingKey)} onChange={e => setFailSourceCheck(e.target.checked)} /> Fail source check</label><Button onClick={() => previewState("Needs setup", () => {cancelSwitch(); setConnection(null); setPhase("ready");})}>Needs setup</Button><Button onClick={() => previewState("Configured", () => {cancelSwitch(); setConnection(demoConnection); setPhase("ready");})}>Configured</Button><Button variant="secondary" onClick={() => previewState("Before start", () => {cancelSwitch(); setLineupPosition(-1); setSwitchMessage(""); setPhase("ready"); setSlate(false); setAutomatic(true);})}>Before start</Button><Button variant="secondary" onClick={() => previewState("Live", () => {if (!connection) setConnection(demoConnection); cancelSwitch(); setLineupPosition(0); setOnAir("Aurora"); setHasPreviousSource(true); setActiveQuality(quality); setPhase("live"); setSlate(false);})}>Live</Button><Button variant="secondary" onClick={() => previewState("Connection lost", () => {if (!connection) setConnection(demoConnection); setActiveQuality(quality); setPhase("reconnecting");})}>Connection lost</Button></footer>}
    <dialog ref={changeDialog} onCancel={() => setPendingChange(null)} aria-labelledby="change-title" aria-describedby="change-description" className={styles.dialog}><h2 id="change-title">{pendingChange?.title}</h2><p id="change-description">{pendingChange?.message}</p>{pendingChange?.url && <p className={styles.inputUrl}>{pendingChange.url}</p>}<div><Button autoFocus onClick={() => setPendingChange(null)}>Cancel</Button><Button variant={pendingChange?.destructive ? "danger" : "primary"} onClick={() => {const change=pendingChange; setPendingChange(null); change?.apply();}}>{pendingChange?.label}</Button></div></dialog>
  </PageContainer></PageShell>;
}
