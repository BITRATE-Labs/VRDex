"use client";

import posthog, { PostHog } from "posthog-js";
import { PostHogProvider as Provider } from "posthog-js/react";
import { Suspense, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAnalyticsPreferences } from "./_components/analytics-preferences";
import { analyticsRouteClass, filterAnalyticsEvent, parseDeploymentCategory } from "@/lib/analytics-capture";
import { retainAnalyticsAuthOutcome, type AnalyticsMode } from "@/lib/analytics-preference";
import { guardAnalyticsRequests } from "@/lib/analytics-transport";
import { captureProductEvent, SESSION_REPLAY_MASKED_SELECTOR } from "@/lib/posthog";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const category = parseDeploymentCategory(process.env.NEXT_PUBLIC_POSTHOG_DEPLOYMENT_CATEGORY);
const limitedEnabled = process.env.NEXT_PUBLIC_POSTHOG_LIMITED_ENABLED === "true";
let activeMode: AnalyticsMode | undefined;
let activeClient: PostHog | undefined;
let previousIdentity: string | undefined;
let previousMode: AnalyticsMode | undefined;

function NavigationCapture() {
  const pathname = usePathname();
  const search = useSearchParams();
  const navigation = `${pathname}?${search.toString()}`;
  const previous = useRef(navigation);
  useEffect(() => {
    if (previous.current === navigation) return;
    previous.current = navigation;
    activeClient?.capture("$pageview");
  }, [navigation]);
  return null;
}

function pauseCapture(withdraw = false) {
  activeMode = undefined;
  const client = activeClient;
  activeClient = undefined;
  if (!client) return;
  if (withdraw) {
    client.reset(true);
    client.set_config({ disable_persistence: true });
  }
  client.set_config({ disable_session_recording: true, autocapture: false, capture_pageleave: false, advanced_disable_flags: true });
  client.stopSessionRecording();
  client.opt_out_capturing();
  client.clear_opt_in_out_capturing();
}

function initializeClient(token: string, mode: "limited" | "full", analyticsId: string | undefined, onReady: (client: PostHog) => void) {
  const client = new PostHog();
  if (!guardAnalyticsRequests(client, () => activeClient === client && activeMode === mode)) return undefined;
  activeClient = client;
  activeMode = mode;
  client.init(token, {
    api_host: "/ingest", ui_host: "https://us.posthog.com", defaults: "2025-05-24",
    persistence: mode === "full" ? "localStorage" : "memory",
    person_profiles: mode === "full" ? "identified_only" : "never",
    bootstrap: mode === "full" && analyticsId ? { distinctID: analyticsId, isIdentifiedID: true } : undefined,
    capture_pageview: false, capture_pageleave: false, autocapture: false,
    disable_session_recording: true, advanced_disable_flags: mode !== "full",
    opt_out_capturing_by_default: true,
    consent_persistence_name: `vrdex-analytics-${mode}`,
    // Keep each consent-bound event independently dispatchable; measure proxy request volume during the pilot.
    request_batching: false, ip: false, capture_performance: false, enable_recording_console_log: false,
    // Nonproduction must admit synthetic browser acceptance traffic.
    opt_out_useragent_filter: category !== "production",
    mask_all_text: true, mask_all_element_attributes: true,
    disable_surveys: true, disable_product_tours: true, disable_conversations: true,
    disable_web_experiments: true, enable_heatmaps: false,
    loaded: () => {
      if (activeClient === client && activeMode === mode) onReady(client);
    },
    session_recording: {
      blockSelector: SESSION_REPLAY_MASKED_SELECTOR, maskAllInputs: true,
      maskTextSelector: SESSION_REPLAY_MASKED_SELECTOR, captureCanvas: { recordCanvas: false },
      recordHeaders: false, recordBody: false,
    },
    before_send: (event) => !event || activeClient !== client ? null : filterAnalyticsEvent({
      ...event, properties: { ...event.properties, route_class: analyticsRouteClass(window.location.pathname) },
    }, activeMode, category, limitedEnabled),
  });
  return client;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  const { mode, analyticsId, identityKey, pauseRef } = useAnalyticsPreferences();
  const [client, setClient] = useState<PostHog>(posthog);
  const authSessionRef = useRef<"anonymous" | "authenticated" | undefined>(undefined);
  useLayoutEffect(() => {
    pauseRef.current = pauseCapture;
    authSessionRef.current = retainAnalyticsAuthOutcome(authSessionRef.current, mode);
    pauseCapture();
    if (!key || !category || !mode || mode === "off" || (mode === "limited" && !limitedEnabled)) {
      previousMode = mode;
      return;
    }
    // A new instance prevents retired queues and recording buffers from joining a later consent session.
    const next = initializeClient(key, mode, analyticsId, setClient);
    if (!next) return;
    const identityChanged = previousIdentity !== undefined && previousIdentity !== identityKey;
    const modeChanged = previousMode !== undefined && previousMode !== mode;
    next.set_config({ advanced_disable_flags: mode !== "full" });
    if (identityChanged || modeChanged || (analyticsId && next.get_distinct_id() !== analyticsId)
      || (!analyticsId && next.get_property("$user_id"))) next.reset(true);
    previousIdentity = identityKey;
    previousMode = mode;
    activeMode = mode;
    activeClient = next;
    next.register({ deployment_category: category, analytics_mode: mode });
    next.opt_in_capturing({ captureEventName: false });
    if (mode === "full" && analyticsId) next.identify(analyticsId);
    next.set_config({ autocapture: mode === "full", capture_pageleave: mode === "full", disable_session_recording: mode !== "full" });
    next.capture("$pageview");
    if (mode === "full") {
      const outcome = analyticsId ? "authenticated" : "anonymous";
      if (authSessionRef.current === undefined) captureProductEvent(next, "auth_session_restore_completed", {
        outcome, route_class: analyticsRouteClass(window.location.pathname),
      });
      else if (authSessionRef.current !== outcome) captureProductEvent(next, "auth_session_state_changed", {
        from: authSessionRef.current, to: outcome, intent: "unclassified",
      });
      authSessionRef.current = outcome;
      next.reloadFeatureFlags();
    }
    return pauseCapture;
  }, [mode, analyticsId, identityKey, pauseRef]);
  return <Provider client={client}><Suspense><NavigationCapture /></Suspense>{children}</Provider>;
}
