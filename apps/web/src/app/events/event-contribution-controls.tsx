"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@convex-generated-api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { EventIntakeFieldsForm } from "./event-intake-form";

function CorrectionForm({ eventId, onDone, onGuardChange }: { eventId: Id<"events">; onDone: () => void; onGuardChange: (guard: (navigate: () => void) => boolean) => void }) {
  const viewer = useQuery(api.accounts.viewer);
  const event = useQuery(api.eventCorrections.getOwnContributedEvent, { eventId });
  const update = useMutation(api.eventCorrections.updateOwnContributedEvent);
  const saved = useRef<{ fields: NonNullable<typeof event>["fields"]; revision: number } | undefined>(undefined);
  if (!event) return <p aria-busy="true">Loading…</p>;
  return <EventIntakeFieldsForm correction onDone={onDone} onGuardChange={onGuardChange} savedTimezonePreference={viewer?.user.defaultEventTimezone} initialFields={event.fields} initialRevision={event.updatedAt} onPublish={async (fields, revision) => {
    const baseline = saved.current ?? { fields: event.fields, revision };
    const patch = { ...fields };
    delete patch.communitySlug; delete patch.sourceText; delete patch.posterSourceId;
    delete patch.posterDeclaration; delete patch.evidence;
    delete patch.tentative; delete patch.questions; delete patch.duplicateAcknowledgements;
    for (const key of Object.keys(patch) as Array<keyof typeof patch>) {
      if (JSON.stringify(patch[key]) === JSON.stringify(baseline.fields[key])) delete patch[key];
    }
    if (!Object.keys(patch).length) return { kind: "saved" };
    const result = await update({ eventId, expectedUpdatedAt: baseline.revision, patch, duplicateAcknowledgements: fields.duplicateAcknowledgements?.map(id => id as Id<"events">) }); saved.current = { fields, revision: result.updatedAt }; return { kind: "saved" };
  }} />;
}

export function EventContributionControls({ eventId, reportOpen, onReportClose }: { eventId: string; reportOpen?: boolean; onReportClose?: () => void }) {
  const [localReportOpen, setLocalReportOpen] = useState(false);
  const open = reportOpen ?? localReportOpen;
  const closeReport = onReportClose ?? (() => setLocalReportOpen(false));
  const dialog = useRef<HTMLDialogElement>(null);
  const reportTitle = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const { isAuthenticated } = useConvexAuth();
  const id = eventId as Id<"events">;
  const access = useQuery(api.eventCorrections.getEventContributionAccess, isAuthenticated ? { eventId: id } : "skip");
  const report = useMutation(api.eventCorrections.reportEvent);
  const retract = useMutation(api.eventCorrections.retractOwnContributedEvent);
  const takeOver = useMutation(api.eventCorrections.takeOverContributedEvent);
  const remove = useMutation(api.eventCorrections.removeContributedEvent);
  const router = useRouter();
  const leaveEditor = useRef<(navigate: () => void) => boolean>(navigate => { navigate(); return true; });
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, leave = false) {
    setBusy(true); setMessage("");
    try { await action(); setMessage("Submitted"); setReason(""); if (leave) router.replace("/account/events"); }
    catch { setMessage("Unable to submit. Try again."); }
    finally { setBusy(false); }
  }
  return <>
    {access?.canCorrect || access?.canTakeOver || editing ? <section className="grid gap-4">
    <div className="flex flex-wrap gap-2">
      {access?.canCorrect ? <><Button variant="secondary" onClick={() => { if (editing) leaveEditor.current(() => setEditing(false)); else setEditing(true); }}>Correct event</Button><Button variant="secondary" disabled={busy} onClick={() => { if (window.confirm("Retract event?")) void run(() => retract({ eventId: id }), true); }}>Retract event</Button></> : null}
      {access?.canTakeOver ? <Button variant="secondary" disabled={busy} onClick={() => { if (window.confirm("Take over this event and close contributor editing?")) void run(() => takeOver({ eventId: id })); }}>Take over</Button> : null}
    </div>
    {editing && access?.canCorrect ? <CorrectionForm onGuardChange={guard => { leaveEditor.current = guard; }} eventId={id} onDone={() => setEditing(false)} /> : null}
    </section> : null}
    {reportOpen === undefined ? <Button variant="secondary" onClick={() => setLocalReportOpen(true)}>Report event</Button> : null}
    <dialog ref={dialog} aria-labelledby={reportTitle} onCancel={event => { event.preventDefault(); closeReport(); }} onClose={closeReport} className="ph-no-capture fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-panel border border-border bg-background p-5 text-foreground backdrop:bg-black/60" data-ph-no-capture>
      <div className="flex items-center justify-between gap-4"><h2 id={reportTitle} className="text-xl font-semibold">{access?.canSuggest ? "Suggest correction" : "Report event"}</h2><Button variant="ghost" onClick={closeReport}>Close</Button></div>
      <div className="mt-4 grid gap-3"><Field>{access?.canSuggest ? "Proposed correction" : "Reason"}<Textarea value={reason} minLength={5} maxLength={500} onChange={event => setReason(event.target.value)} /></Field>
        <div className="flex flex-wrap gap-2"><Button disabled={busy || reason.trim().length < 5} onClick={() => void run(() => report({ eventId: id, reason }))}>{access?.canSuggest ? "Submit correction" : "Submit report"}</Button>
          {access?.canRemove ? <Button variant="secondary" disabled={busy || reason.trim().length < 5} onClick={() => { if (window.confirm("Remove event?")) void run(() => remove({ eventId: id, reason }), true); }}>Remove event</Button> : null}</div>
      </div>
      {message ? <Notice><span role="status">{message}</span></Notice> : null}
    </dialog>
    {!open && message ? <Notice><span role="status">{message}</span></Notice> : null}
  </>;
}
