"use client";

import type { FunctionArgs, FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { EllipsisVertical } from "lucide-react";
import { api } from "@convex-generated-api";

import { ViewerLocalEventDateTime } from "@/app/_components/viewer-local-event-times";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EntityImage } from "@/components/ui/entity-image";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { formatCalendarDate } from "@/lib/calendar/zoned-date-time";

export type EventInventoryRow = FunctionReturnType<typeof api.eventInventory.listPage>["page"][number];
export type EventInventoryCriteria = Omit<FunctionArgs<typeof api.eventInventory.listPage>, "paginationOpts">;
export type EventInventoryView = EventInventoryCriteria["view"];
export type EventInventoryContent =
  | { kind: "failed" }
  | { kind: "loading" | "ready"; rows: EventInventoryRow[]; hasMore: boolean };

export type EventInventoryControlsProps = {
  view: EventInventoryView;
  query: string;
  onViewChange: (view: EventInventoryView) => void;
  onQueryChange: (query: string) => void;
};

export type EventInventoryListProps = {
  label?: string;
  showCommunity?: boolean;
  content: EventInventoryContent;
  onLoadMore: () => void;
  onRetry: () => void;
};

const views = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "drafts", label: "Drafts" },
  { value: "past", label: "Past" },
] satisfies { value: EventInventoryView; label: string }[];

const stateLabels = {
  draft: "Draft", published: "Published", cancelled: "Cancelled", retracted: "Retracted",
} satisfies Record<EventInventoryRow["state"], string>;

export function InventoryScheduleText({ schedule }: { schedule: EventInventoryRow["schedule"] }) {
  return schedule.kind === "timed" ? <ViewerLocalEventDateTime timestamp={schedule.startAt} />
    : schedule.kind === "date_only" ? <ViewerLocalEventDateTime scheduleKind="date_only" eventDate={schedule.eventDate} />
      : schedule.eventDate ? <time dateTime={schedule.eventDate}>{formatCalendarDate(schedule.eventDate)}</time> : null;
}

function InventoryAction({ row, titleId }: { row: EventInventoryRow; titleId: string }) {
  const continuation = row.continuation;
  switch (continuation.kind) {
    case "staff_editor":
      return <Link aria-describedby={titleId} className={buttonVariants({ variant: "secondary", size: "sm" })} href={continuation.href}>{row.state === "draft" ? "Continue" : "Edit"}</Link>;
    case "intake_editor":
      return <Link aria-describedby={titleId} className={buttonVariants({ variant: "secondary", size: "sm" })} href={continuation.href}>Continue</Link>;
    case "public_event":
      return <Link aria-describedby={titleId} className={buttonVariants({ variant: "secondary", size: "sm" })} href={continuation.href}>View event</Link>;
    case "unavailable":
      return <span className="text-sm text-muted">Unavailable</span>;
    default: {
      const exhaustive: never = continuation;
      return exhaustive;
    }
  }
}

type DiscardableDraft = FunctionArgs<typeof api.eventInventory.discardDraft>["draft"];

function DraftActions({ draft, title }: { draft: DiscardableDraft; title: string }) {
  const discard = useMutation(api.eventInventory.discardDraft);
  const menu = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function confirmDiscard() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await discard({ draft });
      dialog.current?.close();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <details ref={menu} className="relative" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }} onKeyDown={event => {
      if (event.key === "Escape") {
        event.currentTarget.open = false;
        event.currentTarget.querySelector("summary")?.focus();
      }
    }}>
      <summary aria-label={`More actions for ${title}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <EllipsisVertical aria-hidden="true" className="size-5" />
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-max rounded-control border border-border bg-surface-elevated p-1 shadow-lg">
        <Button size="sm" variant="dangerGhost" onClick={() => {
          if (menu.current) menu.current.open = false;
          setFailed(false);
          dialog.current?.showModal();
        }}>Discard draft</Button>
      </div>
    </details>
    <dialog ref={dialog} aria-labelledby={headingId} className="m-auto max-w-[calc(100%-2rem)] rounded-control border border-border bg-surface p-6 text-foreground backdrop:bg-black/60 sm:max-w-md" onCancel={event => {
      if (busy) event.preventDefault();
    }} onClose={() => menu.current?.querySelector("summary")?.focus()}>
      <h2 id={headingId} className="text-xl font-semibold">Discard draft?</h2>
      <p className="mt-2 break-words text-sm text-muted">{title}</p>
      {failed ? <Notice className="mt-3" role="alert" variant="error">Could not discard this draft. Close this dialog and try again.</Notice> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button autoFocus disabled={busy} onClick={() => dialog.current?.close()}>Keep draft</Button>
        <Button disabled={busy} variant="danger" onClick={() => void confirmDiscard()}>Discard draft</Button>
      </div>
    </dialog>
  </>;
}

function InventoryRow({ row, showCommunity }: { row: EventInventoryRow; showCommunity: boolean }) {
  const titleId = useId();
  const title = row.title ?? "Untitled event";
  const draft: DiscardableDraft | null = row.kind === "intake_draft"
    ? { kind: row.kind, id: row.draftId, version: row.version }
    : row.kind === "managed_event" && row.discardVersion !== undefined
      ? { kind: row.kind, id: row.eventId, version: row.discardVersion }
      : null;
  return (
    <li className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 px-4 py-5 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-5 sm:px-5">
      <EntityImage alt="" className="aspect-[4/3] w-full rounded-control" label={title} sizes="96px" src={row.thumbnailUrl} />
      <div className="min-w-0">
        <h3 className="break-words text-base font-semibold sm:text-lg" id={titleId}>{title}</h3>
        {showCommunity && row.community ? <p className="mt-1 break-words text-sm text-muted">{row.community.displayName}</p> : null}
        {row.schedule.eventDate ? <p className="mt-1 text-sm text-muted"><InventoryScheduleText schedule={row.schedule} /></p> : null}
      </div>
      <div className="col-start-2 flex flex-wrap items-center gap-3 sm:col-start-auto sm:justify-end sm:gap-6">
        <div className="text-sm sm:text-right">
          <p>{stateLabels[row.state]}</p>
          {row.kind === "intake_draft" ? <p className="mt-1 text-xs text-muted">Expires <ViewerLocalEventDateTime timestamp={row.expiresAt} /></p> : null}
        </div>
        <InventoryAction row={row} titleId={titleId} />
        {draft ? <DraftActions draft={draft} title={title} /> : null}
      </div>
    </li>
  );
}

export function EventInventoryControls({ view, query, onViewChange, onQueryChange }: EventInventoryControlsProps) {
  return <div className="flex flex-wrap items-end justify-between gap-4">
    <div aria-label="Event filters" className="grid w-full grid-cols-4 gap-1 sm:w-auto" role="group">
      {views.map(item => <Button aria-pressed={view === item.value} className={view === item.value ? "border-b-2 border-accent bg-surface-strong" : "border-b-2 border-transparent"} key={item.value} onClick={() => onViewChange(item.value)} variant="ghost">{item.label}</Button>)}
    </div>
    <Field className="w-full sm:max-w-xs">Find an event<Input maxLength={120} onChange={event => onQueryChange(event.currentTarget.value)} type="search" value={query} /></Field>
  </div>;
}

export function EventInventoryList({ content, onLoadMore, onRetry, label = "My events", showCommunity = true }: EventInventoryListProps) {
  return (
    <div className="grid min-w-0 gap-4">
      {content.kind === "failed" ? <Notice role="alert" variant="error">Unable to load this page.<Button className="ml-3" onClick={onRetry} size="sm">Retry</Button></Notice> : <>
        {content.rows.length > 0 ? <Card padding="none"><ul aria-busy={content.kind === "loading"} aria-label={label} className="divide-y divide-border">{content.rows.map(row => <InventoryRow key={row.id} row={row} showCommunity={showCommunity} />)}</ul></Card> : null}
        <div aria-live="polite">
          {content.kind === "loading" ? <p aria-busy="true" className="text-sm text-muted">Loading events…</p> : null}
          {content.kind === "ready" && !content.hasMore && content.rows.length === 0 ? <Notice>No events</Notice> : null}
        </div>
        {content.hasMore ? <Button className="sr-only justify-self-start focus:not-sr-only" disabled={content.kind === "loading"} onClick={onLoadMore}>Load more</Button> : null}
      </>}
    </div>
  );
}
