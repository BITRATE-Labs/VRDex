"use client";
import { useEffect, useState } from "react";
import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import { EventIntakeForm } from "../../events/event-intake-form";
import { SupportRequestForm } from "../../support/support-request-form";
import { EventContributionControls } from "../../events/event-contribution-controls";
import type { EventIntakePatch } from "../../../../../../packages/api-contracts/src/event-intake";

const fetchAccessToken = async () => "fixture-token";
const useFixtureAuth = () => ({ isLoading: false, isAuthenticated: typeof sessionStorage === "undefined" || sessionStorage.getItem("fixture-personal-signed-out") !== "true", fetchAccessToken });

// Exercise the connected forms and reactive queries with a local transport.
// The matching backend conflict checks have their own Convex tests.
function revisionFixture(correction: boolean, sourceMode?: string, staff = false, held?: string) {
  const personalMode = sourceMode?.startsWith("discord");
  let personalStatus = typeof sessionStorage !== "undefined" && sessionStorage.getItem("fixture-personal-prepared") ? "ready" : "pending";
  let personalExpiresAt: number | undefined;
  let personalCreateFields: EventIntakePatch | undefined;
  let personalTarget: { eventId: string; updatedAt: number; baseline: EventIntakePatch } | null = null;
  let fields: EventIntakePatch = { communitySlug: "afterglow", title: "Original title", eventDate: "2027-07-15", timeTba: true, venueLabel: "Original venue" };
  if (correction) fields.lineup = [{ clientKey: "private-person", position: 0, performerLabel: "Private performer" }];
  if (sourceMode) fields = {};
  if (personalMode) fields = { sourceText: "Harbor Sessions Friday, JustIvy 22:00 UTC" };
  const heldImport = { communitySlug: "afterglow", title: "Held night", eventDate: "2027-07-15" };
  if (held === "held") fields = { ...fields, timeTba: false, timezone: "UTC", start: { time: "20:00", dayOffset: 0 } };
  if (held === "held-date-only") fields = { tentative: heldImport };
  if (held === "held-cleared-start") fields = { ...fields, timeTba: false };
  if (held === "held-redated") fields = { communitySlug: "afterglow", title: "Held night", eventDate: "2027-07-16", tentative: { ...heldImport, timezone: "UTC", start: { time: "20:00", dayOffset: 0 } } };
  if (held === "held-tentative-start") fields = { tentative: { ...heldImport, timezone: "UTC", start: { time: "20:00", dayOffset: 0 } } };
  let version = 1;
  let completion: { sourceId: string; version: number } | undefined;
  let droppedCompletion = false;
  if (sourceMode && typeof sessionStorage !== "undefined") { const stored = sessionStorage.getItem("fixture-source-draft"); if (stored) ({fields, version} = JSON.parse(stored)); }
  let draft = { artworkSourceId: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("fixture-artwork-source") ?? undefined : undefined, _id: "fixture-draft", version, fields, artworkAssetId: typeof sessionStorage !== "undefined" && sessionStorage.getItem("fixture-artwork") ? "art" : undefined, ...(held ? { connectorId: "fixture-connector" } : {}), ...(personalMode ? { personalSubmissionId: "fixture-personal" } : {}) };
  let delayedDraft: typeof draft | undefined;
  let event = { eventId: "fixture-event", updatedAt: version, fields };
  const listeners = new Set<() => void>();
  let access = { canCorrect: !staff, canSuggest: false, canTakeOver: staff, canRemove: staff };
  const empty: unknown[] = [];
  const communities = [{ slug: "afterglow", title: "Afterglow", imageUrl: "/test-media/event-poster.png" }, { slug: "playwright-afterglow-social", title: "Afterglow Social", imageUrl: "/test-media/event-poster.png" }];
  const publicCommunities = [...communities, { slug: "night-market", title: "Night Market", imageUrl: "/test-media/event-poster.png" }];
  const scrollCommunities = Array.from({ length: 8 }, (_, index) => ({ slug: `scroll-community-${index + 1}`, title: `Scroll Community ${index + 1}` }));
  let searchLoading = sourceMode === "search-loading";
  if (searchLoading && typeof window !== "undefined") window.addEventListener("release-community-search", () => { searchLoading = false; listeners.forEach(listener => listener()); }, { once: true });
  const people = [{ slug: "aurora", title: "Aurora", imageUrl: "/test-media/event-poster.png" }];
  const viewer = { user: { name: "Fixture contributor", defaultEventTimezone: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("fixture-correction-timezone") ?? undefined : undefined } };
  const personalProjection = () => ({ status: personalStatus, preparationExpiresAt: personalExpiresAt ?? null, ownerCommunitySlug: sourceMode !== "discord-contribution" && fields.communitySlug === "afterglow" ? "afterglow" : null, target: personalTarget, attachments: personalStatus === "ready" ? [] : (sourceMode === "discord-multiple" ? [1, 2] : [1]).map(index => ({ id: `poster-${index}`, url: "/test-media/event-poster.png", label: `Poster ${index}` })) });
  const refresh = (patch: EventIntakePatch) => {
    fields = { ...fields, ...patch };
    if (draft?.artworkSourceId && "posterSourceId" in patch && fields.posterSourceId !== draft.artworkSourceId) {
      draft = { ...draft, artworkSourceId: undefined, artworkAssetId: undefined };
      sessionStorage.removeItem("fixture-artwork-source");
    }
    version += 1;
    draft = { ...draft, version, fields };
    event = { ...event, updatedAt: version, fields };
    if (sourceMode) sessionStorage.setItem("fixture-source-draft", JSON.stringify({ fields, version }));
    listeners.forEach(listener => listener());
  };
  const client = {
    setAuth(_fetch: unknown, onChange: (authenticated: boolean) => void) { onChange(true); },
    clearAuth() {},
    async query(query: FunctionReference<"query">, args: { query?: string; profileType?: string; entityType?: string; slug?: string }) {
      const name = getFunctionName(query);
      if (name === "eventIntake:getEventIntakeDraft") return draft;
      if (name === "discordPersonalIntake:getSubmission") return personalProjection();
      if (name === "eventCorrections:getOwnContributedEvent") { if (sessionStorage.getItem("fixture-publication-foreign")) throw new Error("CONTRIBUTOR_REQUIRED"); if (held) throw new Error("CONTRIBUTOR_REQUIRED"); return event; }
      if (name === "profiles:lookupPeople") return people.filter(person => person.title.toLowerCase().includes(args.query?.toLowerCase() ?? "")).map(person => ({ slug: person.slug, displayName: person.title, avatarImageUrl: person.imageUrl, profilePath: `/${person.slug}`, roleTags: [], tags: [] }));
      if (name === "profiles:getPublicBySlug") {
        if (args.profileType === "person") {
          const person = people.find(item => item.slug === args.slug);
          return person ? { slug: person.slug, displayName: person.title, avatarImageUrl: person.imageUrl, profileType: "person", person: { roleTags: [] }, tags: [], mediaKit: {} } : null;
        }
        const community = publicCommunities.find(item => item.slug === args.slug);
        return community ? { slug: community.slug, displayName: community.title, avatarImageUrl: community.imageUrl, mediaKit: { primaryLogo: { imageUrl: community.imageUrl } } } : null;
      }
      if (name === "worlds:getPublicBySlug") {
        if (sourceMode === "world-delay") await new Promise<void>(resolve => window.addEventListener("release-world-presentation", () => resolve(), { once: true }));
        return args.slug === "harbor-world" ? { slug: args.slug, displayName: "Harbor World", tags: [], heroImageUrl: "/test-media/event-poster.png" } : null;
      }
      if (name === "search:searchUniversal") {
        if (searchLoading) await new Promise<void>(resolve => window.addEventListener("release-community-search", () => resolve(), { once: true }));
        if (args.entityType === "world") return [{ entityType: "world", slug: "harbor-world", title: "Harbor World", routePath: "/harbor-world", imageUrl: "/test-media/event-poster.png" }];
        const query = args.query?.toLowerCase() ?? "";
        return (query.startsWith("scroll") ? scrollCommunities : publicCommunities).filter(item => `${item.title} ${item.slug}`.toLowerCase().includes(query)).map(item => ({ ...item, entityType: "profile", profileType: "community", routePath: `/${item.slug}`, logoImageUrl: "imageUrl" in item ? item.imageUrl : undefined }));
      }
      return null;
    },
    watchQuery(query: FunctionReference<"query">, args?: { query?: string; profileType?: string }) {
      return {
        localQueryResult: () => {
          switch (getFunctionName(query)) {
            case "discordPersonalIntake:getSubmission": return personalProjection();
            case "events:listManagedEvents": return [{ eventId: "fixture-existing", title: "Existing harbor event", slug: "existing", communitySlug: "afterglow" }];
            case "eventIntake:getEventIntakeDraft": return delayedDraft ?? draft;
            case "accounts:viewer": return viewer;
            case "events:listManagedCommunities": return communities.map((community, index) => ({ profileId: `community-${index}`, slug: community.slug, displayName: community.title, imageUrl: community.imageUrl, roleLabel: index === 0 ? "Owner" : "Staff" }));
            case "search:searchUniversal": {
              if (args?.profileType === "community") {
                if (searchLoading) return undefined;
                const query = args.query?.toLowerCase() ?? "";
                const results = query.startsWith("scroll") ? scrollCommunities : communities;
                return results.filter(community => `${community.title} ${community.slug}`.toLowerCase().includes(query));
              }
              return args?.profileType === "person" && args.query?.toLowerCase().includes("aurora") ? people : empty;
            }
            case "eventCorrections:getOwnContributedEvent": return event;
            case "eventCorrections:getEventContributionAccess": return access;
            default: return empty;
          }
        },
        onUpdate: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
        journal: () => undefined,
      };
    },
    async action(action: FunctionReference<"action">, args: { expectedVersion: number }) {
      sessionStorage.setItem("event-intake-review-command", getFunctionName(action));
      if (args.expectedVersion !== version) throw new ConvexError({ code: "VERSION_CONFLICT" });
      if (sourceMode === "duplicates" && !fields.duplicateAcknowledgements?.includes("similar-event")) throw new ConvexError({ code: "NEAR_DUPLICATE", choices: [{ eventId: "similar-event", title: "Another Afterglow Night", eventPath: "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions" }] });
      sessionStorage.setItem("fixture-publication-count", String(Number(sessionStorage.getItem("fixture-publication-count") ?? "0") + 1));
      if (sessionStorage.getItem("fixture-publication-defer") === "true") await new Promise<void>(resolve => window.addEventListener("release-publication", () => resolve(), { once: true }));
      sessionStorage.setItem("fixture-published", JSON.stringify(fields));
      if (sourceMode === "discord-contribution") {
        draft = null as unknown as typeof draft;
        listeners.forEach(listener => listener());
        sessionStorage.setItem("fixture-personal-resolved", "true");
        await new Promise<void>(resolve => window.addEventListener("release-personal-publication", () => resolve(), { once: true }));
      }
      return { eventId: "fixture-event", eventPath: "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions" };
    },
    async mutation(mutation: FunctionReference<"mutation">, args: Record<string, unknown>) {
      const name = getFunctionName(mutation);
      if (name === "discordPersonalIntake:selectUpdateTarget") {
        if (args.expectedVersion !== version) throw new ConvexError({ code: "VERSION_CONFLICT" });
        if (!args.eventId) { const clear = Object.fromEntries(Object.keys(personalTarget?.baseline ?? {}).map(key => [key, null])); personalTarget = null; refresh({ ...clear, ...personalCreateFields }); return { version }; }
        const baseline: EventIntakePatch = { communitySlug: "afterglow", title: "Existing harbor event", eventDate: "2026-12-01", timezone: "UTC", start: { time: "22:00" }, venueLabel: "Original room", lineup: [{ clientKey: "original-set", position: 0, performerLabel: "Original DJ" }] };
        if (!personalTarget) personalCreateFields = { ...Object.fromEntries(Object.keys(baseline).map(key => [key, fields[key as keyof EventIntakePatch] ?? null])), tentative: fields.tentative };
        personalTarget = { eventId: String(args.eventId), updatedAt: 1, baseline };
        refresh({ ...baseline });
        return { version };
      }
      if (name === "discordPersonalIntake:publishReviewedDraft") {
        sessionStorage.setItem("fixture-owner-operation", JSON.stringify(args));
        if (sessionStorage.getItem("fixture-owner-denied")) throw new ConvexError({ code: "EVENT_STAFF_REQUIRED" });
        return { eventId: "fixture-event", eventPath: "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions", outcome: "updated" };
      }
      if (name === "supportRequests:submitSupportRequest" || name === "suppressions:requestProfileSuppression") {
        sessionStorage.setItem("fixture-support-submission", JSON.stringify({ name, args }));
        if (sessionStorage.getItem("fixture-support-defer") === "true") await new Promise<void>(resolve => window.addEventListener("fixture-support-release", () => resolve(), { once: true }));
        if (sessionStorage.getItem("fixture-support-fail") === "true") throw new ConvexError({ code: "SUPPORT_INPUT_INVALID", message: "Tell us a little more about what you need." });
        return null;
      }
      sessionStorage.setItem("event-intake-review-command", name);
      sessionStorage.setItem("event-intake-review-count", String(Number(sessionStorage.getItem("event-intake-review-count") ?? "0") + 1));
      if (sessionStorage.getItem("event-intake-review-defer") === "true") await new Promise<void>(resolve => window.addEventListener("event-intake-review-release", () => resolve(), { once: true }));
      sessionStorage.setItem("event-intake-revision-submission", JSON.stringify(args));
      if (name === "eventCorrections:takeOverContributedEvent") {
        access = { ...access, canTakeOver: false };
        listeners.forEach(listener => listener());
        return true;
      }
      if (name === "eventCorrections:removeContributedEvent") return true;
      const expected = name === "eventIntake:saveEventIntakeDraft" || name === "eventIntakeHeld:publish" ? args.expectedVersion : args.expectedUpdatedAt;
      if (expected !== version) throw new ConvexError({ code: "VERSION_CONFLICT" });
      if (name === "eventIntakeHeld:publish") {
        sessionStorage.setItem("fixture-published", JSON.stringify(fields));
        // A resolved draft reads as null for any manager but its actor.
        draft = null as unknown as typeof draft;
        listeners.forEach(listener => listener());
        return { outcome: "published", eventId: "fixture-event", eventPath: "/playwright-afterglow-social/events/playwright-afterglow-harbor-sessions" };
      }
      if (sessionStorage.getItem("fixture-save-fail") === "true") throw new Error("Fixture save failed");
      const patch = args.patch as EventIntakePatch;
      if (name === "eventCorrections:updateOwnContributedEvent" && Object.keys(patch).some(key => !["title", "eventDate", "timeTba", "timezone", "start", "end", "doors", "venueLabel", "worldSlug", "sourceUrl", "summary", "lineup"].includes(key))) throw new ConvexError({ code: "PATCH_FIELD" });
      refresh(patch);
      return name === "eventIntake:saveEventIntakeDraft" ? { draftId: draft._id, version } : { eventId: event.eventId, updatedAt: version };
    },
  } as unknown as ConvexReactClient;

  const transport: typeof fetch = async (input, init) => {
    if (String(input).endsWith("/fixture-upload")) {
      if (sourceMode === "upload-stale") refresh({ venueLabel: "Changed elsewhere" });
      return new Response(null, { status: 204 });
    }
    const { operation, input: args } = JSON.parse(String(init?.body));
    if ("actorUserId" in args) throw new Error("Browser actor forbidden");
    switch (operation) {
      case "discord_source_prepare": {
        sessionStorage.setItem("fixture-personal-preparation-input", JSON.stringify(args));
        sessionStorage.setItem("fixture-personal-preparations", String(Number(sessionStorage.getItem("fixture-personal-preparations") ?? "0") + 1));
          if (sessionStorage.getItem("fixture-personal-fail-once")) {
            sessionStorage.removeItem("fixture-personal-fail-once");
            personalStatus = "failed";
            listeners.forEach(listener => listener());
            return Response.json({ status: 502 }, { status: 502 });
          }
        if (sessionStorage.getItem("fixture-personal-preparation-defer")) {
          sessionStorage.removeItem("fixture-personal-preparation-defer");
          personalStatus = "processing"; personalExpiresAt = Date.now() + 1000;
          listeners.forEach(listener => listener());
          await new Promise<void>(resolve => window.addEventListener("release-personal-preparation", () => resolve(), { once: true }));
        }
        if (sourceMode === "discord-delayed") {
          delayedDraft = draft;
          window.addEventListener("release-personal-draft", () => { delayedDraft = undefined; listeners.forEach(listener => listener()); }, { once: true });
        }
        personalStatus = "ready";
        sessionStorage.setItem("fixture-personal-prepared", "true");
        draft = { ...draft, artworkSourceId: "poster-1", artworkAssetId: "art" };
        sessionStorage.setItem("fixture-artwork-source", "poster-1"); sessionStorage.setItem("fixture-artwork", "selected");
        if (sessionStorage.getItem("fixture-personal-fail-after-adoption")) {
          sessionStorage.removeItem("fixture-personal-fail-after-adoption");
          personalStatus = "failed";
          refresh({ posterSourceId: "poster-1" });
          return Response.json({ status: 429 }, { status: 429 });
        }
        refresh({ posterSourceId: "poster-1", tentative: { title: "Harbor Sessions", communitySlug: "afterglow", eventDate: "2026-12-01", timezone: "UTC", start: { time: "22:00" } } });
        if (sourceMode === "discord-lineup") {
          refresh({
            tentative: { title: "Harbor Sessions", communitySlug: "afterglow", eventDate: "2027-07-15", lineup: [
              { clientKey: "first", position: 0, performerLabel: "First DJ", start: { time: "23:00", dayOffset: 0 } },
              { clientKey: "second", position: 1, performerLabel: "Second DJ", start: { time: "00:00", dayOffset: 1 } },
            ] },
            questions: ["lineup.0.start: date_timezone_required", "lineup.1.start: date_timezone_required"],
          });
        }
        if (sourceMode === "discord-contribution") refresh({ communitySlug: "afterglow", title: "Harbor Sessions", eventDate: "2026-12-01", timezone: "UTC", start: { time: "22:00" }, tentative: null });
        return Response.json({ ...draft, preparationStatus: "ready" });
      }
      case "poster_upload_begin": {
        const count = Number(sessionStorage.getItem("fixture-upload-count") ?? "0") + 1;
        sessionStorage.setItem("fixture-upload-count", String(count));
        return Response.json({ posterAssetId: `poster-${count}`, expiresAt: Date.now() + 60000, transfer: { method: "POST", url: `${location.origin}/fixture-upload`, fields: {}, fileField: "file" } });
      }
      case "poster_upload_complete":
        if (sourceMode === "completion-delay") await new Promise<void>(resolve => window.addEventListener("release-poster-completion", () => resolve(), { once: true }));
        if (sourceMode === "derivative-failure" && !sessionStorage.getItem("fixture-derivative-failed")) { sessionStorage.setItem("fixture-derivative-failed", "true"); return Response.json({}, { status: 503 }); }
        if (args.expectedVersion !== undefined && args.expectedVersion !== version && !(completion && completion.sourceId === args.posterAssetId && completion.version === version && args.expectedVersion === version - 1)) return Response.json({}, { status: 409 });
        if (!draft.artworkSourceId && fields.posterSourceId === args.posterAssetId) {
          draft = { ...draft, artworkSourceId: args.posterAssetId, artworkAssetId: "art" };
          sessionStorage.setItem("fixture-artwork-source", args.posterAssetId);
          refresh({});
          completion = { sourceId: args.posterAssetId, version };
        }
        if (sourceMode === "completion-response-lost" && !droppedCompletion) { droppedCompletion = true; throw new TypeError("Failed to fetch"); }
        return Response.json({ posterAssetId: args.posterAssetId, version, artworkAssetId: draft.artworkSourceId === args.posterAssetId ? "art" : undefined });
      case "poster_read": {
        if (sourceMode === "preview-failure") return Response.json({}, { status: 503 });
        if (sourceMode === "replacement-delay" && args.posterAssetId === "poster-2") await new Promise<void>(resolve => window.addEventListener("release-poster-preview", () => resolve(), { once: true }));
        const response = await fetch("/test-media/event-poster.png");
        const dataUrl = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); void response.blob().then(blob => reader.readAsDataURL(blob)); });
        return Response.json({ dataUrl: `${dataUrl}#${args.posterAssetId}` });
      }
      case "artwork_select": {
        if (args.expectedVersion !== version) return Response.json({}, { status: 409 });
        const sourceId = args.posterAssetId;
        draft = { ...draft, artworkAssetId: sourceId ? "art" : undefined, artworkSourceId: sourceId ?? undefined };
        if (sourceId) sessionStorage.setItem("fixture-artwork-source", sourceId);
        else sessionStorage.removeItem("fixture-artwork-source");
        refresh({}); sessionStorage.setItem("fixture-artwork", "selected");
        return Response.json({ artworkAssetId: sourceId ? "art" : null, artworkSourceId: sourceId, version });
      }
      case "extract":
        if (sourceMode === "extraction-delay") await new Promise<void>(resolve => window.addEventListener("release-extraction", () => resolve(), { once: true }));
        sessionStorage.setItem("fixture-extraction", JSON.stringify(args));
        if (sourceMode === "stale") refresh({ venueLabel: "Changed elsewhere" });
        return Response.json({ event: { title: sourceMode === "poster" ? null : "Afterglow Night", communitySlug: null, eventDate: null, start: null, end: null, startDate: null, endDate: null, timezone: null, venueLabel: null, summary: null, sourceUrl: null }, lineup: [], evidence: [{ fieldPath: "event.title", origin: "text", excerpt: "Afterglow Night", assessment: "explicit" }], questions: [{ fieldPath: sourceMode === "poster" ? "source" : "timezone", reason: sourceMode === "poster" ? "disabled" : "Which time zone?", alternatives: [] }], decision: { kind: "new" } });
      default: throw new Error("Unexpected fixture operation");
    }
  };
  return { client, refresh, transport };
}

export function EventIntakeRevisionPreview({ correction, sourceMode, staff = false, held, initialCommunitySlug }: { correction: boolean; sourceMode?: string; staff?: boolean; held?: string; initialCommunitySlug?: string }) {
  const [fixture] = useState(() => revisionFixture(correction, sourceMode, staff, held));
  useEffect(() => {
    if (!sourceMode && !held) return;
    const original = window.fetch;
    window.fetch = (input, init) => ["/api/event-intake", `${location.origin}/fixture-upload`].includes(String(input)) ? fixture.transport(input, init) : original(input, init);
    return () => { window.fetch = original; };
  }, [fixture, sourceMode, held]);
  const [refreshed, setRefreshed] = useState(false);
  return <ConvexProviderWithAuth client={fixture.client} useAuth={useFixtureAuth}>
    <main className="mx-auto w-full max-w-6xl p-5">

      {!sourceMode ? <button onClick={() => { fixture.refresh({ venueLabel: "New venue" }); setRefreshed(true); }}>Update elsewhere</button> : null}
      {refreshed ? <output>Query refreshed</output> : null}
      {sourceMode === "support" ? <SupportRequestForm /> : correction ? <EventContributionControls eventId="fixture-event" /> : <EventIntakeForm heading={sourceMode ? <h1 className="text-3xl font-semibold">Add event</h1> : undefined} draftId={initialCommunitySlug ? undefined : "fixture-draft"} initialCommunitySlug={initialCommunitySlug} />}
    </main>
  </ConvexProviderWithAuth>;
}
