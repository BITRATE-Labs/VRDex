"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

export function PersonalIntakeControls({ ready, busy, failed, attachments, mode, eventId, events, artwork, onPrepare, onMode, onEvent, onArtwork, onDiscard }: {
  ready: boolean; busy: boolean; failed: boolean; attachments: { id: string; url: string; label: string }[];
  mode: "create" | "update"; eventId?: string; events: { eventId: string; title: string }[]; artwork: "keep" | "replace" | "remove";
  onPrepare: (options: { attachmentId?: string; skipPoster?: boolean; retry?: boolean }) => void;
  onMode: (mode: "create" | "update") => void; onEvent: (id: string) => void; onArtwork: (choice: "keep" | "replace" | "remove") => void; onDiscard: () => void;
}) {
  const [poster, setPoster] = useState("");
  return <section aria-label="Discord import" className="mb-6 grid gap-4 rounded-control border border-border p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="font-medium">Discord</h2><Button type="button" variant="ghost" disabled={busy} onClick={onDiscard}>Discard</Button></div>
    {failed ? <Notice>Unavailable</Notice> : null}
    {(!ready || failed) && attachments.length > 1 ? <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <Field>Poster<Select aria-label="Poster" value={poster} onChange={event => setPoster(event.target.value)} disabled={busy}><option value="">Select poster</option>{attachments.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field>
      <Button type="button" disabled={busy || !poster} onClick={() => onPrepare({ attachmentId: poster, retry: true })}>Continue</Button>
      {poster ? <>{/* Private signed previews bypass the public image optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachments.find(item => item.id === poster)?.url} referrerPolicy="no-referrer" alt="Selected poster" className="max-h-48 rounded-control object-contain" /></> : null}
    </div> : null}
    {busy ? <p role="status" className="text-sm text-muted">Importing…</p> : null}
    {failed ? <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy} onClick={() => onPrepare({ retry: true, ...(poster ? { attachmentId: poster } : {}) })}>Retry</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => onPrepare({ skipPoster: true, retry: true })}>Continue without poster</Button></div> : null}
    {ready ? <div className="grid gap-3 sm:grid-cols-2">
      <Field>Operation<Select aria-label="Operation" value={mode} onChange={event => onMode(event.target.value as "create" | "update")} disabled={busy}><option value="create">New event</option><option value="update">Update event</option></Select></Field>
      {mode === "update" ? <><Field>Existing event<Select aria-label="Existing event" value={eventId ?? ""} onChange={event => onEvent(event.target.value)} disabled={busy}><option value="">Select event</option>{events.map(event => <option key={event.eventId} value={event.eventId}>{event.title}</option>)}</Select></Field><Field>Artwork<Select aria-label="Artwork" value={artwork} onChange={event => onArtwork(event.target.value as "keep" | "replace" | "remove")} disabled={busy}><option value="replace">Use poster</option><option value="keep">Keep current artwork</option><option value="remove">Remove artwork</option></Select></Field></> : null}
    </div> : null}
  </section>;
}
