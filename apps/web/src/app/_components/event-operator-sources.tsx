"use client";
import { useEffect, useRef, useState } from "react";
import type { FunctionArgs } from "convex/server";
import type { api } from "@convex-generated-api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { CopyValueRow } from "@/components/ui/copy-value-row";
import {
  operatorStatusWindow,
  operatorSourceAvailability,
  type OperatorSource,
} from "@/lib/event-operator-state";
import { eventDjTarget } from "@/lib/event-dj-target";
import {
  parseSourceObservations,
  type SourceObservation,
} from "@/lib/event-source-observations";
import { EventOperatorPreview } from "./event-operator-preview";
import type { OperatorStatus } from "./event-operator-view";
export type SourceAuthoring = Omit<
  FunctionArgs<typeof api.eventMediaSources.create>,
  "currentSlug"
>;
export type SourcesControl = {
  status: OperatorStatus;
  canTake: boolean;
  canCancel: boolean;
  pending: OperatorStatus["sessions"][number]["pendingOperation"];
  now: number;
  observedSource?: { sourceId: string; revision: number };
};
export function EventOperatorSources({
  sources,
  control,
  canControl,
  onTake,
  onCancel,
  onRemove,
  onCreate,
  onReplace,
}: {
  sources: OperatorStatus["sources"];
  control: SourcesControl;
  canControl: boolean;
  onTake: (source: OperatorSource) => void;
  onCancel: () => void;
  onRemove: (source: OperatorSource) => Promise<unknown>;
  onCreate: (input: SourceAuthoring) => Promise<unknown>;
  onReplace: (
    source: OperatorSource,
    input: SourceAuthoring,
  ) => Promise<unknown>;
}) {
  const [page, setPage] = useState(0),
    [previewId, setPreviewId] = useState<string>(),
    [editing, setEditing] = useState<OperatorSource>();
  const [label, setLabel] = useState(""),
    [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const [observations, setObservations] = useState<
    Record<string, SourceObservation>
  >({});
  const preview = sources.find((source) => source.sourceId === previewId),
    start = Math.min(
      page * 4,
      Math.max(0, Math.ceil(sources.length / 4) - 1) * 4,
    ),
    visible = sources.slice(start, start + 4);
  const windowIds = operatorStatusWindow(control.status, preview, visible)
    .map((row) => row.sourceId)
    .join(",");
  const path = control.status.eventPath;
  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setObservations({});
    async function refresh() {
      try {
        const response = await fetch(
          `${path}/operate/status?ids=${encodeURIComponent(windowIds)}`,
          {
            signal: AbortSignal.any([
              abort.signal,
              AbortSignal.timeout(12_000),
            ]),
          },
        );
        if (response.ok) {
          const value = parseSourceObservations(await response.json());
          if (!cancelled) setObservations(value);
        } else if (!cancelled) setObservations({});
      } catch {
        /* Source links remain available. */
      } finally {
        if (!cancelled) timer = setTimeout(() => void refresh(), 30_000);
      }
    }
    if (windowIds) void refresh();
    return () => {
      cancelled = true;
      abort.abort();
      clearTimeout(timer);
    };
  }, [path, windowIds]);
  async function save(action: () => Promise<unknown>) {
    if (lock.current || !canControl) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    try {
      if (await action() === false) return;
      setEditing(undefined);
      setLabel("");
      setUrl("");
    } catch {
      setFailed(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="text-xl font-semibold">Inputs</h2>
        {control.canCancel ? (
          <div role="group" aria-label="Preparation">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
      <div className={preview ? "grid items-start gap-8 min-[1000px]:grid-cols-[minmax(0,1fr)_430px]" : ""}><div>
      {visible.map((source) => {
        const target = source.publicUrl
          ? eventDjTarget(source.publicUrl)
          : undefined;
        const state = operatorSourceAvailability(
          source,
          target ? observations[target.key] : undefined,
          control.now,
          control.observedSource,
        );
        return (
          <article
            key={source.sourceId}
            aria-label={source.label}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <span className="font-medium">{source.label}</span>
                <span className="ml-2 text-sm text-muted">
                  {source.editable ? "Custom" : "Lineup"}
                </span>
              </div>
              <span className="capitalize text-sm text-muted">{state}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={
                  !control.canTake ||
                  !source.input ||
                  !source.hasPublicUrl ||
                  source.state === "disabled"
                }
                aria-label={`Take ${source.label}`}
                onClick={() => onTake(source)}
              >
                Put on air
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!source.input || !source.publicUrl}
                aria-label={`Preview ${source.label}`}
                onClick={() => setPreviewId(source.sourceId)}
              >
                Preview
              </Button>
              {source.publicUrl ? (
                <>
                  <a
                    className="self-center text-sm"
                    href={source.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open
                  </a>
                  <CopyValueRow
                    actionOnly
                    label={source.label}
                    value={source.publicUrl}
                  />
                </>
              ) : null}
              {source.editable ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canControl || busy}
                    aria-label={`Replace ${source.label}`}
                    onClick={() => {
                      setEditing(source);
                      setLabel(source.label);
                      setUrl(source.publicUrl ?? "");
                    }}
                  >
                    Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canControl || busy}
                    aria-label={`Remove ${source.label}`}
                    onClick={() => void save(() => onRemove(source))}
                  >
                    Remove
                  </Button>
                </>
              ) : null}
            </div>
          </article>
        );
      })}
      {sources.length > 4 ? (
        <nav aria-label="Source pages" className="flex items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            disabled={start === 0}
            onClick={() => setPage(Math.max(0, page - 1))}
          >
            Previous
          </Button>
          <span>
            {Math.floor(start / 4) + 1} / {Math.ceil(sources.length / 4)}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={start + 4 >= sources.length}
            onClick={() => setPage(page + 1)}
          >
            Next page
          </Button>
        </nav>
      ) : null}
      </div>
      {preview ? (
        <EventOperatorPreview
          key={`${preview.sourceId}:${preview.revision}`}
          source={preview}
          onClose={() => setPreviewId(undefined)}
        />
      ) : null}
      </div>
      <details open={editing ? true : undefined}>
        <summary className="cursor-pointer text-sm">Add input</summary>
        <fieldset
          disabled={!canControl || busy}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <Field>
            Source label
            <Input
              maxLength={120}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </Field>
          <Field>
            Video or stream link
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={!label.trim() || !url.trim()}
              onClick={() =>
                void save(() =>
                  editing
                    ? onReplace(editing, { label, url })
                    : onCreate({ label, url }),
                )
              }
            >
              {editing ? "Replace source" : "Add source"}
            </Button>
            {editing ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setEditing(undefined);
                  setLabel("");
                  setUrl("");
                }}
              >
                Cancel edit
              </Button>
            ) : null}
          </div>
        </fieldset>
      </details>
      {failed ? <p role="status">Save failed</p> : null}
    </section>
  );
}
