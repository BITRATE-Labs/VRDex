"use client";

import { api } from "@convex-generated-api";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ANALYTICS_CHOICE_KEY, ANALYTICS_OFFER_KEY, ANALYTICS_POLICY_VERSION, analyticsAccountMatches, parseAnalyticsChoice, resolveAnalyticsMode, type AnalyticsChoice, type AnalyticsMode } from "@/lib/analytics-preference";
import { parseDeploymentCategory } from "@/lib/analytics-capture";
import { ANALYTICS_FOUNDATION_ENABLED, ANALYTICS_CHOICE_OWNER_KEY, analyticsChoiceOwnerMatches } from "@/lib/analytics-preference";

type PanelPlacement = "offer" | "settings";

type AccountState = { resolved: boolean; choice?: AnalyticsChoice; analyticsId?: string; revision?: number; userId?: string };
type Preferences = {
  mode: AnalyticsMode | undefined;
  analyticsId?: string;
  identityKey?: string;
  open: (opener: HTMLButtonElement) => void;
  firstVisitOffer?: ReactNode;
  pauseRef: { current: (withdraw?: boolean) => void };
};
const Context = createContext<Preferences>({ mode: undefined, open: () => {}, pauseRef: { current: () => {} } });
export const useAnalyticsPreferences = () => useContext(Context);

type AccountBridgeProps = {
  update: (state: AccountState) => void;
  saveRef: { current: ((choice: AnalyticsChoice) => Promise<void>) | undefined };
  browserChoice: AnalyticsChoice | undefined;
  failed: () => void;
  inherited: () => void;
};

function ClerkAccount(props: AccountBridgeProps) {
  const { isLoaded, userId } = useClerkAuth();
  return <ConnectedAccount {...props} authLoaded={isLoaded} expectedSubject={userId ?? null} />;
}

function ConnectedAccount({ update, saveRef, browserChoice, failed, inherited, authLoaded = true, expectedSubject }: AccountBridgeProps & {
  authLoaded?: boolean;
  expectedSubject?: string | null;
}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.accounts.viewer, isAuthenticated ? {} : "skip");
  const setPreference = useMutation(api.analyticsPreferences.set);
  const matches = authLoaded && analyticsAccountMatches(expectedSubject, viewer?.user.analyticsAuthSubject, isAuthenticated);
  const user = isAuthenticated && matches ? viewer?.user : undefined;
  useLayoutEffect(() => {
    update({
      resolved: matches && !isLoading && (!isAuthenticated || Boolean(user)),
      choice: user?.analyticsPreference?.choice,
      analyticsId: user?.analyticsId,
      revision: user?.analyticsPreference?.revision,
      userId: user?.id,
    });
    saveRef.current = isAuthenticated && matches && user
      ? async (choice) => { await setPreference({ choice, policyVersion: ANALYTICS_POLICY_VERSION, browserRestriction: choice }); }
      : undefined;
    return () => { saveRef.current = undefined; };
  }, [isAuthenticated, isLoading, user, matches, setPreference, update, saveRef]);
  useEffect(() => {
    if (browserChoice !== "on" || !user) return;
    let cancelled = false;
    let owner: string | null = null;
    try { owner = localStorage.getItem(ANALYTICS_CHOICE_OWNER_KEY); } catch { /* An unproven browser choice cannot grant account consent. */ }
    if (user.analyticsPreference) {
      try { localStorage.setItem(ANALYTICS_CHOICE_OWNER_KEY, user.id); } catch { /* The account preference remains authoritative. */ }
      return;
    }
    if (!analyticsChoiceOwnerMatches(owner, user.id)) {
      inherited();
      return;
    }
    try { localStorage.setItem(ANALYTICS_CHOICE_OWNER_KEY, user.id); } catch { inherited(); return; }
    void setPreference({ choice: "on", policyVersion: ANALYTICS_POLICY_VERSION, browserRestriction: "on" })
      .catch(() => { if (!cancelled) failed(); });
    return () => { cancelled = true; };
  }, [browserChoice, user, setPreference, failed, inherited]);
  return null;
}

export function AnalyticsPreferencesProvider({ children }: { children: ReactNode }) {
  return ANALYTICS_FOUNDATION_ENABLED ? <EnabledAnalyticsPreferencesProvider>{children}</EnabledAnalyticsPreferencesProvider> : children;
}

function EnabledAnalyticsPreferencesProvider({ children }: { children: ReactNode }) {
  const connected = Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);
  const [account, setAccount] = useState<AccountState>({ resolved: !connected });
  const [ready, setReady] = useState(false);
  const [choice, setChoice] = useState<AnalyticsChoice>();
  const [placement, setPlacement] = useState<PanelPlacement>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const pauseRef = useRef<(withdraw?: boolean) => void>(() => {});
  const saveRef = useRef<((choice: AnalyticsChoice) => Promise<void>) | undefined>(undefined);
  const mounted = useRef(true);
  const accountIdentityRef = useRef<string | undefined>(undefined);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const focusOnOpenRef = useRef(false);
  const mode = resolveAnalyticsMode(choice, account.choice, ready && account.resolved
    && !(account.userId && choice === "on" && !account.choice));
  useEffect(() => {
    mounted.current = true;
    try {
      const stored = parseAnalyticsChoice(localStorage.getItem(ANALYTICS_CHOICE_KEY));
      setChoice(stored);
      if (!stored && process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
        && parseDeploymentCategory(process.env.NEXT_PUBLIC_POSTHOG_DEPLOYMENT_CATEGORY)
        && localStorage.getItem(ANALYTICS_OFFER_KEY) !== "1") {
        setPlacement("offer");
        localStorage.setItem(ANALYTICS_OFFER_KEY, "1");
      }
    } catch { /* Browser storage is optional; do not assume consent. */ }
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_CHOICE_KEY) return;
      const next = parseAnalyticsChoice(event.newValue);
      if (next === undefined) return;
      setChoice((current) => {
        if (current !== next) pauseRef.current(next === "off");
        return next;
      });
    };
    window.addEventListener("storage", sync);
    return () => { mounted.current = false; window.removeEventListener("storage", sync); };
  }, []);
  const updateAccount = useCallback((state: AccountState) => {
    accountIdentityRef.current = state.userId;
    setAccount((current) => {
      if (current.resolved === state.resolved && current.choice === state.choice
        && current.analyticsId === state.analyticsId && current.userId === state.userId
        && current.revision === state.revision) return current;
      pauseRef.current(state.choice === "off");
      return state;
    });
  }, []);
  const failedAccountSave = useCallback(() => {
    setError(true);
    setPlacement((current) => current ?? "settings");
  }, []);
  const inheritedChoice = useCallback(() => {
    setChoice(undefined);
    setPlacement((current) => current ?? "settings");
    try { localStorage.removeItem(ANALYTICS_CHOICE_KEY); } catch { /* Keep capture unconsented in memory. */ }
  }, []);
  const dismiss = () => {
    setPlacement(undefined);
    returnFocusRef.current?.focus();
    try { localStorage.setItem(ANALYTICS_OFFER_KEY, "1"); } catch { /* Keep the page usable. */ }
  };
  const save = async (next: AnalyticsChoice) => {
    if (saving || (!account.resolved && next === "on")) return;
    const savingFor = account.userId;
    setSaving(true);
    setError(false);
    if (next === "off") {
      pauseRef.current(true);
      setChoice("off");
      try { localStorage.setItem(ANALYTICS_CHOICE_KEY, "off"); } catch { /* Retain in-memory restriction. */ }
    }
    if (!account.resolved) { setError(true); setSaving(false); return; }
    try {
      await saveRef.current?.(next);
      if (!mounted.current || accountIdentityRef.current !== savingFor) return;
      localStorage.setItem(ANALYTICS_CHOICE_OWNER_KEY, savingFor ?? "guest");
      localStorage.setItem(ANALYTICS_CHOICE_KEY, next);
      setChoice(next);
      dismiss();
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setSaving(false);
    }
  };
  useEffect(() => {
    if (placement && focusOnOpenRef.current) {
      panelRef.current?.focus();
      focusOnOpenRef.current = false;
    }
  }, [placement]);
  const isOffer = placement === "offer";
  const panel = placement && ready ? (
    <section
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={(event) => { if (event.key === "Escape") dismiss(); }}
      aria-label="Usage & privacy"
      data-ph-no-capture
      className={cn(
        "max-w-md rounded-panel border border-border-strong bg-surface-strong p-5 text-foreground shadow-hero sm:fixed sm:right-6 sm:bottom-4 sm:z-50 sm:max-h-[calc(100dvh-2rem)] sm:overflow-y-auto",
        isOffer
          ? "max-sm:mx-4 max-sm:mt-3 max-sm:max-w-none max-sm:px-3 max-sm:py-2"
          : "max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:z-50 max-sm:mx-auto max-sm:max-h-[calc(100dvh-2rem)] max-sm:overflow-y-auto",
      )}
    >
      <div className={cn("flex items-center justify-between gap-4", isOffer && "max-sm:flex-wrap max-sm:gap-y-1")}>
        <h2 className="text-lg font-semibold">Analytics</h2>
        <Button size="sm" variant="ghost" className={isOffer ? "max-sm:ms-auto max-sm:min-h-11" : undefined} onClick={dismiss} aria-label="Close analytics preferences">Close</Button>
      </div>
      <p className={cn("mt-2 text-sm text-muted", isOffer && "max-sm:mt-0")}>Usage analytics and masked session replay.</p>
      <div className={isOffer ? "contents max-sm:mt-1 max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:justify-between max-sm:gap-x-3" : "contents"}>
        <Link href="/privacy" className={cn("mt-2 inline-block text-sm underline underline-offset-4", isOffer && "max-sm:mt-0 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center")}>Privacy policy</Link>
        <div className={cn("mt-4 grid grid-cols-2 gap-3", isOffer && "max-sm:mt-0 max-sm:gap-2")} aria-label="Analytics choice">
          <Button className={isOffer ? "max-sm:min-h-11 max-sm:min-w-11 max-sm:px-3" : undefined} disabled={saving} variant={mode === "off" ? "primary" : "secondary"} aria-pressed={mode === "off"} onClick={() => void save("off")}>Off</Button>
          <Button className={isOffer ? "max-sm:min-h-11 max-sm:min-w-11 max-sm:px-3" : undefined} disabled={saving || !account.resolved} variant={mode === "full" ? "primary" : "secondary"} aria-pressed={mode === "full"} onClick={() => void save("on")}>On</Button>
        </div>
      </div>
      <div role="status" className={cn("mt-2 text-sm text-muted", isOffer && "max-sm:empty:mt-0")}>{saving ? "Saving…" : error ? "Could not save. Try again." : ""}</div>
    </section>
  ) : null;
  return <Context.Provider value={{
    mode,
    analyticsId: account.analyticsId,
    identityKey: `${account.userId ?? "guest"}:${account.revision ?? 0}`,
    firstVisitOffer: isOffer ? panel : null,
    open: (opener) => {
      returnFocusRef.current = opener;
      focusOnOpenRef.current = true;
      setPlacement("settings");
    },
    pauseRef,
  }}>
    {connected && (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      ? <ClerkAccount update={updateAccount} saveRef={saveRef} browserChoice={choice} failed={failedAccountSave} inherited={inheritedChoice} />
      : <ConnectedAccount update={updateAccount} saveRef={saveRef} browserChoice={choice} failed={failedAccountSave} inherited={inheritedChoice} />)}
    {children}
    {!isOffer && panel}
  </Context.Provider>;
}

export function AnalyticsFirstVisitOffer() {
  return useAnalyticsPreferences().firstVisitOffer;
}

export function AnalyticsSettingsButton() {
  const { open } = useAnalyticsPreferences();
  if (!ANALYTICS_FOUNDATION_ENABLED) return null;
  return <button type="button" onClick={(event) => open(event.currentTarget)} className="cursor-pointer text-muted underline-offset-4 hover:text-foreground hover:underline">Usage & privacy</button>;
}
