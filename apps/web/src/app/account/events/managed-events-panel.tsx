"use client";

import Link from "next/link";
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { Component, useEffect, useState, type ReactNode } from "react";
import { api } from "@convex-generated-api";

import { buttonVariants } from "@/components/ui/button";
import { SectionTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EventIdentityPicker } from "@/app/events/event-identity-picker";
import type { EventIdentityOption } from "@/lib/event-editor-identity";
import { EventInventoryControls, EventInventoryList, type EventInventoryCriteria, type EventInventoryView } from "./event-inventory-list";
import { useLoadMoreOnScroll } from "@/lib/use-load-more-on-scroll";
import type { FunctionArgs } from "convex/server";
import { HeldImportsSection } from "./held-imports-section";

const candidatePageSize = 20;
type DraftSection = FunctionArgs<typeof api.eventInventory.listPage>["draftSection"];

type InventoryBoundaryProps = {
  children: ReactNode;
  controls: ReactNode;
  shortcuts: ReactNode;
  resetKey: string;
  onRetry: () => void;
};
type InventoryBoundaryState = { failed: boolean; resetKey: string };

class InventoryErrorBoundary extends Component<InventoryBoundaryProps, InventoryBoundaryState> {
  state = { failed: false, resetKey: this.props.resetKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps({ resetKey }: Pick<InventoryBoundaryProps, "resetKey">, state: InventoryBoundaryState) {
    return resetKey === state.resetKey ? null : { failed: false, resetKey };
  }
  render() {
    return <div className="grid min-w-0 gap-6">
      {this.state.failed ? null : this.props.shortcuts}
      <div className="grid min-w-0 gap-4">
        {this.props.controls}
        {this.state.failed ? <EventInventoryList content={{ kind: "failed" }} onRetry={this.props.onRetry} onLoadMore={() => undefined} /> : this.props.children}
      </div>
    </div>;
  }
}

// Retries on the inventory's refresh. Held imports are extra: when they fail, My events carries on without them.
class HeldImportsBoundary extends Component<{ children: ReactNode; resetKey: string }, InventoryBoundaryState> {
  state = { failed: false, resetKey: this.props.resetKey };
  static getDerivedStateFromError() { return { failed: true }; }
  static getDerivedStateFromProps = InventoryErrorBoundary.getDerivedStateFromProps;
  render() { return this.state.failed ? null : this.props.children; }
}

function InventoryPager({ criteria, onRetry, draftSection, title }: {
  criteria: EventInventoryCriteria;
  onRetry: () => void;
  draftSection?: DraftSection;
  title?: string;
}) {
  const args = draftSection === undefined ? criteria : { ...criteria, draftSection };
  const { results, status, loadMore } = usePaginatedQuery(api.eventInventory.listPage, args, { initialNumItems: candidatePageSize });
  const sentinel = useLoadMoreOnScroll(status, loadMore, candidatePageSize);
  if (title && draftSection !== "personal" && status === "Exhausted" && results.length === 0) return null;

  return <div className="grid min-w-0 gap-2">
    {title ? <h3 className="text-lg font-semibold">{title}</h3> : null}
    <EventInventoryList onRetry={onRetry} label={title} showCommunity={draftSection === undefined || draftSection === "personal"} content={{
      kind: status === "LoadingFirstPage" || status === "LoadingMore" ? "loading" : "ready",
      rows: results,
      hasMore: status === "CanLoadMore" || status === "LoadingMore",
    }} onLoadMore={() => loadMore(candidatePageSize)} />
    <div ref={sentinel} aria-hidden="true" />
  </div>;
}

function InventoryTraversal({ timeZone, normalizedQuery, view, onRetry }: { timeZone: string; normalizedQuery: string; view: EventInventoryView; onRetry: () => void }) {
  const [asOf] = useState(Date.now);
  const criteria = { view, query: normalizedQuery, timeZone, asOf };
  const communities = useQuery(api.events.listManagedCommunities, view === "drafts" ? { includeNonPublic: true } : "skip");
  if (view !== "drafts") return <InventoryPager onRetry={onRetry} criteria={criteria} />;
  return <div className="grid min-w-0 gap-6">
    {communities?.map(community => <InventoryPager key={community.profileId} draftSection={community.profileId} title={community.displayName} criteria={criteria} onRetry={onRetry} />)}
    <InventoryPager draftSection="personal" title="Personal drafts" criteria={criteria} onRetry={onRetry} />
  </div>;
}

function EventOwnerMode() {
  const mode = useQuery(api.events.getEventOwnerMode, {});
  const setMode = useMutation(api.events.setEventOwnerMode);
  const [community, setCommunity] = useState<EventIdentityOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!mode) return null;
  const change = async (communitySlug: string | null) => {
    setSaving(true);
    setFailed(false);
    try {
      await setMode({ communitySlug });
      setCommunity(null);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {mode.community ? (
        <>
          <span>Admin access · {mode.community.name}</span>
          <button className={buttonVariants({ variant: "secondary" })} disabled={saving} type="button"
            onClick={() => void change(null)}>End admin access</button>
        </>
      ) : (
        <form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          if (community) void change(community.slug);
        }}>
          <div className="w-full min-w-0 sm:w-64">
            <EventIdentityPicker kind="community" selectedSlug={community?.slug}
              selectedOption={community} disabled={saving}
              onSelect={setCommunity} onClear={() => setCommunity(null)} />
          </div>
          <button className={buttonVariants({ variant: "secondary" })} disabled={saving || !community} type="submit">
            Manage as admin
          </button>
        </form>
      )}
      {failed ? <span role="alert">Could not change admin access</span> : null}
    </div>
  );
}

function InventoryShortcuts() {
  const communities = useQuery(api.events.listManagedCommunities, {});
  const reportsAllowed = useQuery(api.eventCorrections.getEventReportAccess, {});
  return <div className="flex flex-wrap gap-2">
    <EventOwnerMode />
    {reportsAllowed ? <Link className={buttonVariants({ variant: "secondary" })} href="/account/events/reports">Event reports</Link> : null}
    {communities?.map(community => <Link aria-label={`Add event for ${community.displayName}`} className={buttonVariants({ variant: "secondary" })} href={`/${community.slug}/events/create`} key={community.profileId}>{`Manage ${community.displayName} event`}</Link>)}
  </div>;
}

function ConnectedInventory({ viewerId }: { viewerId: string }) {
  const [view, setView] = useState<EventInventoryView>("all");
  const [query, setQuery] = useState("");
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [refresh, setRefresh] = useState(0);
  const normalizedQuery = query.trim().replace(/\s+/g, " ").toLowerCase();

  useEffect(() => {
    const browserClock = () => ({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", day: new Date().toLocaleDateString("en-CA") });
    let clock = browserClock();
    const refreshClock = (force: boolean) => {
      const next = browserClock();
      if (force || next.timeZone !== clock.timeZone || next.day !== clock.day) {
        setTimeZone(next.timeZone);
        setRefresh(value => value + 1);
        clock = next;
      }
    };
    const onFocus = () => refreshClock(true);
    const onVisibility = () => { if (document.visibilityState === "visible") refreshClock(true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => refreshClock(false), 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, []);

  const traversalKey = JSON.stringify([viewerId, view, normalizedQuery, timeZone, refresh]);
  const onRetry = () => setRefresh(value => value + 1);
  return <InventoryErrorBoundary
    controls={<EventInventoryControls view={view} query={query} onViewChange={setView} onQueryChange={setQuery} />}
    onRetry={onRetry}
    resetKey={traversalKey}
    shortcuts={<><InventoryShortcuts /><HeldImportsBoundary resetKey={traversalKey}><HeldImportsSection /></HeldImportsBoundary></>}
  >
    <InventoryTraversal key={traversalKey} view={view} normalizedQuery={normalizedQuery} timeZone={timeZone} onRetry={onRetry} />
  </InventoryErrorBoundary>;
}

export function ManagedEventsPanel() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.accounts.viewer, isAuthenticated && !isLoading ? {} : "skip");
  return <div className="grid min-w-0 gap-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <SectionTitle>My events</SectionTitle>
      <Link className={buttonVariants({ variant: "primary" })} href="/events/new">Add event</Link>
    </div>
    {isLoading || (isAuthenticated && viewer === undefined) ? <p aria-busy="true" className="text-sm text-muted">Loading events…</p>
      : !isAuthenticated ? <Link className={buttonVariants({ variant: "secondary" })} href="/sign-in?returnTo=%2Faccount%2Fevents">Sign in</Link>
        : viewer ? <ConnectedInventory key={viewer.user.id} viewerId={viewer.user.id} /> : <Notice variant="warning">You do not have access to this page.</Notice>}
  </div>;
}
