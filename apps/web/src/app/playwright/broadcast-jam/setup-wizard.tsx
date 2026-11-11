"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyValueRow } from "@/components/ui/copy-value-row";
import { Field, FieldText, Input } from "@/components/ui/field";
import { PageContainer, PageActions, PageShell } from "@/components/ui/page-shell";
import { checkIngestUrl, setupPlaybackLinks, serverPresets, type BroadcastConnection } from "./destination-setup";
import styles from "./preview.module.css";

export function BroadcastSetup({ connection, onCancel, onComplete, showTools = false }: {
  showTools?: boolean;
  connection: BroadcastConnection | null;
  onCancel: () => void;
  onComplete: (value: BroadcastConnection) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [provider, setProvider] = useState<BroadcastConnection["provider"]>(connection?.provider ?? "VRCDN");
  const [serverUrl, setServerUrl] = useState(connection?.serverUrl ?? serverPresets[connection?.provider ?? "VRCDN"]);
  const [streamKey, setStreamKey] = useState("");
  const [playbackUrl, setPlaybackUrl] = useState(connection?.playback.at(-1)?.url ?? "");
  const [error, setError] = useState("");
  const [test, setTest] = useState<"idle" | "running" | "passed" | "failed">("idle");
  const [testStage, setTestStage] = useState(0);
  const [failTest, setFailTest] = useState(false);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const canReuseKey = connection?.provider === provider && connection.serverUrl === serverUrl;
  const dirty = Boolean(streamKey) || provider !== (connection?.provider ?? "VRCDN") || serverUrl !== (connection?.serverUrl ?? serverPresets.VRCDN) || playbackUrl !== (connection?.playback.at(-1)?.url ?? "");
  function leave() {
    if (test === "passed") finish(true);
    else if (dirty) leaveDialog.current?.showModal();
    else onCancel();
  }
  let parsedPlayback: BroadcastConnection["playback"] = [];
  try { parsedPlayback = setupPlaybackLinks(playbackUrl); } catch { /* Validate on Continue. */ }
  const title = useRef<HTMLHeadingElement>(null);
  const passed = test === "passed";
  useEffect(() => { title.current?.focus(); }, [step, passed]);
  useEffect(() => {
    if (test !== "running") return;
    const timers = [
      window.setTimeout(() => setTestStage(1), 650),
      window.setTimeout(() => setTestStage(2), 1300),
      window.setTimeout(() => {setTestStage(3); setTest(failTest ? "failed" : "passed");}, 1950),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [test, failTest]);
  function advance() {
    try {
      if (step === 1) {
        checkIngestUrl(serverUrl);
        if (!streamKey.trim() && !canReuseKey) throw Error("Enter your stream key.");
        setStep(2);
      } else {
        setupPlaybackLinks(playbackUrl);
        setTest("idle"); setTestStage(0); setStep(3);
      }
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Check the connection details.");
    }
  }
  function chooseProvider(value: BroadcastConnection["provider"]) {
    if (value === provider) return;
    setProvider(value); setServerUrl(serverPresets[value]); setStreamKey(""); setPlaybackUrl(""); setError("");
  }
  function finish(tested: boolean) {
    onComplete({ label:provider === "Twitch" ? "Twitch" : "World stream", provider, serverUrl, tested, playback:setupPlaybackLinks(playbackUrl) });
  }
  return <PageShell className={styles.shell}><PageContainer max="3xl">
    <PageActions>{test !== "passed" && <Button variant="secondary" onClick={leave}>Back to broadcast</Button>}</PageActions>
    <header className={styles.setupHeader}><p className={styles.context}>Afterglow Harbor Sessions</p><h1 ref={title} tabIndex={-1}>{test === "passed" ? "Connection test passed" : step === 1 ? "Connect your stream" : step === 2 ? "Add the playback link" : "Test your connection"}</h1></header>
    <ol className={styles.steps} aria-label="Setup progress">{["Connection", "Playback", "Test"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <section className={styles.setupCard}>
      {step === 1 && <form onSubmit={event => {event.preventDefault(); advance();}} className={styles.setupForm}>
        <fieldset className={styles.providerChoices}><legend>Service</legend>{(["Twitch", "VRCDN", "Custom"] satisfies BroadcastConnection["provider"][]).map(value => <Button key={value} type="button" aria-pressed={provider === value} variant={provider === value ? "primary" : "secondary"} onClick={() => chooseProvider(value)}>{value}</Button>)}</fieldset>
        {provider === "Custom" ? <Field>Server URL<Input required value={serverUrl} onChange={event => {setServerUrl(event.target.value); setError("");}} placeholder="rtmps://…" autoComplete="off" /></Field> : <p className={styles.presetServer}>{serverUrl}</p>}
        <Field>Stream key<Input type="password" required={!canReuseKey} placeholder={canReuseKey ? "Saved stream key" : undefined} value={streamKey} onChange={event => {setStreamKey(event.target.value); setError("");}} autoComplete="off" />{canReuseKey && <FieldText>Leave blank to keep the saved key.</FieldText>}</Field>
        {error && <p role="alert" className={styles.setupError}>{error}</p>}
        <div className={styles.setupActions}><Button type="button" onClick={leave}>Back to broadcast</Button><Button variant="primary" type="submit">Continue</Button></div>
      </form>}
      {step === 2 && <form onSubmit={event => {event.preventDefault(); advance();}} className={styles.setupForm}>
        <Field>Playback URL<Input required value={playbackUrl} onChange={event => {setPlaybackUrl(event.target.value); setError("");}} placeholder="https://…" autoComplete="off" /><FieldText>Playback or VRCDN preview link.</FieldText></Field>
        {parsedPlayback.length === 2 && <section aria-label="VRCDN playback links" className={styles.parsedLinks}>{parsedPlayback.map(link => <CopyValueRow key={link.label} label={link.label} value={link.url} />)}</section>}
        {error && <p role="alert" className={styles.setupError}>{error}</p>}
        <div className={styles.setupActions}><Button type="button" onClick={() => {setError(""); setStep(1);}}>Back</Button><Button variant="primary" type="submit">Continue</Button></div>
      </form>}
      {step === 3 && <div className={styles.setupForm}>
        {test === "passed" && <div className={styles.confetti} aria-hidden="true">{Array.from({length:24}, (_,index) => <span key={index} style={{left:`${(index * 43) % 100}%`, backgroundColor:["#8ed8ff", "#a5e6b5", "#f3d27b", "#d7b5fa"][index % 4], animationDelay:`${(index % 6) * 80}ms`}} />)}</div>}
        {test !== "passed" && <p role="status">A test screen will briefly play on your stream. You can skip this for now.</p>}
        <dl className={styles.setupReview}><div><dt>Server</dt><dd>{checkIngestUrl(serverUrl).host}</dd></div><div><dt>Stream key</dt><dd>••••••••</dd></div><div><dt>Playback</dt><dd>{playbackUrl}</dd></div></dl>
        {test !== "idle" && <ol className={styles.testChecks} aria-live="polite" aria-busy={test === "running"}>{["Connect to stream", "Send test screen", "Confirm playback"].map((label,index) => <li key={label}><span>{test === "failed" && index === 2 ? "×" : testStage > index ? "✓" : "○"}</span>{label}</li>)}</ol>}
        {test === "failed" && <div className={styles.setupError} role="alert"><p>Couldn’t play back the test. Check the playback link and try again.</p><Button variant="ghost" onClick={() => {setTest("idle"); setStep(2);}}>Edit playback link</Button></div>}
        <div className={styles.setupActions}>{test === "running" ? <Button onClick={() => {setTest("idle"); setTestStage(0);}}>Cancel test</Button> : test !== "passed" && <Button onClick={() => {setTest("idle"); setError(""); setStep(2);}}>Back</Button>}<div className={styles.setupPrimaryActions}>{test !== "running" && test !== "passed" && <Button variant="ghost" onClick={() => finish(false)}>Skip test</Button>}{test === "passed" ? <Button variant="primary" onClick={() => finish(true)}>Back to broadcast</Button> : <Button variant="primary" disabled={test === "running"} onClick={() => {setTestStage(0); setTest("running");}}>{test === "running" ? "Testing…" : test === "failed" ? "Try again" : "Run test"}</Button>}</div></div>
      </div>}
    </section>
    <dialog ref={leaveDialog} className={styles.dialog} aria-labelledby="leave-setup-title"><h2 id="leave-setup-title">Discard setup changes?</h2><p>Your saved connection will stay as it is.</p><div><Button autoFocus onClick={() => leaveDialog.current?.close()}>Keep editing</Button><Button variant="danger" onClick={onCancel}>Discard changes</Button></div></dialog>
    {showTools && <footer className={styles.scenarios}><span>Preview tools</span>{step < 3 && <Button onClick={() => {if(provider === "Custom") setServerUrl("rtmps://ingest.example.invalid/live"); setStreamKey("demo-stream-key"); setPlaybackUrl(provider === "Twitch" ? "https://www.twitch.tv/afterglow_demo" : "https://panel.vrcdn.live/preview/afterglow-demo"); setError("");}}>Fill demo details</Button>}<label><input type="checkbox" disabled={test === "running"} checked={failTest} onChange={event => setFailTest(event.target.checked)} /> Fail playback test</label></footer>}
  </PageContainer></PageShell>;
}
