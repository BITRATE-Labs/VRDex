"use client";

import { api } from "@convex-generated-api";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ANALYTICS_CHOICE_KEY, ANALYTICS_OFFER_KEY, ANALYTICS_POLICY_VERSION, analyticsAccountMatches, parseAnalyticsChoice, resolveAnalyticsMode, type AnalyticsChoice, type AnalyticsMode } from "@/lib/analytics-preference";
import { parseDeploymentCategory } from "@/lib/analytics-capture";
import { ANALYTICS_FOUNDATION_ENABLED, ANALYTICS_CHOICE_OWNER_KEY, analyticsChoiceOwnerMatches } from "@/lib/analytics-preference";
import { ensureGuestReceipt, withdrawGuestReceipt, type GuestReceipt } from "@/lib/analytics-guest";

type AccountState = { resolved: boolean; choice?: AnalyticsChoice; analyticsId?: string; revision?: number; userId?: string };
type Preferences = {
  mode: AnalyticsMode | undefined;
  analyticsId?: string;
  guestAnalyticsId?: string;
  identityKey?: string;
  open: () => void;
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
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [guest, setGuest] = useState<GuestReceipt>();
  const browserRevision = useRef(0);
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
        setVisible(true);
        localStorage.setItem(ANALYTICS_OFFER_KEY, "1");
      }
    } catch { /* Browser storage is optional; do not assume consent. */ }
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key !== ANALYTICS_CHOICE_KEY) return;
      const next = parseAnalyticsChoice(event.newValue);
      if (next === undefined) return;
      browserRevision.current++;
      setChoice((current) => {
        if (current !== next) pauseRef.current(next === "off");
        return next;
      });
    };
    window.addEventListener("storage", sync);
    return () => { mounted.current = false; window.removeEventListener("storage", sync); };
  }, []);
  useEffect(() => {
    if (mode === "off") {
      setGuest(undefined);
      const retry = () => { void withdrawGuestReceipt().catch(() => {}); };
      retry();
      window.addEventListener("online", retry);
      return () => window.removeEventListener("online", retry);
    }
    if (mode !== "full" || account.userId) return;
    let cancelled = false;
    const retry = () => {
      void ensureGuestReceipt().then((receipt) => { if (!cancelled) setGuest(receipt); }).catch(() => {});
    };
    retry();
    window.addEventListener("online", retry);
    return () => { cancelled = true; window.removeEventListener("online", retry); };
  }, [mode, account.userId]);
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
  const failedAccountSave = useCallback(() => { setError(true); setVisible(true); }, []);
  const inheritedChoice = useCallback(() => {
    setChoice(undefined);
    setVisible(true);
    try { localStorage.removeItem(ANALYTICS_CHOICE_KEY); } catch { /* Keep capture unconsented in memory. */ }
  }, []);
  const dismiss = () => {
    setVisible(false);
    returnFocusRef.current?.focus();
    try { localStorage.setItem(ANALYTICS_OFFER_KEY, "1"); } catch { /* Keep the page usable. */ }
  };
  const save = async (next: AnalyticsChoice) => {
    if (saving || (!account.resolved && next === "on")) return;
    const savingFor = account.userId;
    const savingRevision = browserRevision.current;
    setSaving(true);
    setError(false);
    if (next === "off") {
      browserRevision.current++;
      pauseRef.current(true);
      setChoice("off");
      try { localStorage.setItem(ANALYTICS_CHOICE_KEY, "off"); } catch { /* Retain in-memory restriction. */ }
    }
    if (!account.resolved) { setError(true); setSaving(false); return; }
    try {
      await saveRef.current?.(next);
      if (next === "off") await withdrawGuestReceipt();
      else if (!savingFor) {
        const receipt = await ensureGuestReceipt();
        if (browserRevision.current !== savingRevision) return;
        setGuest(receipt);
      }
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
    if (visible && focusOnOpenRef.current) {
      panelRef.current?.focus();
      focusOnOpenRef.current = false;
    }
  }, [visible]);
  return <Context.Provider value={{ mode: mode === "full" && !(account.userId ? account.analyticsId : guest?.analyticsId) ? undefined : mode,
    analyticsId: account.analyticsId, guestAnalyticsId: account.userId ? undefined : guest?.analyticsId,
    identityKey: `${account.userId ?? guest?.analyticsId ?? "guest"}:${account.revision ?? 0}`, open: () => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusOnOpenRef.current = true;
    setVisible(true);
  }, pauseRef }}>
    {connected && (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      ? <ClerkAccount update={updateAccount} saveRef={saveRef} browserChoice={choice} failed={failedAccountSave} inherited={inheritedChoice} />
      : <ConnectedAccount update={updateAccount} saveRef={saveRef} browserChoice={choice} failed={failedAccountSave} inherited={inheritedChoice} />)}
    {children}
    {visible && ready && <section ref={panelRef} tabIndex={-1} onKeyDown={(event) => { if (event.key === "Escape") dismiss(); }} aria-label="Usage & privacy" data-ph-no-capture className="fixed inset-x-4 bottom-4 z-50 mx-auto max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-panel border border-border-strong bg-surface-strong p-5 text-foreground shadow-hero sm:left-auto sm:right-6 sm:mx-0">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Close analytics preferences">Close</Button>
      </div>
      <p className="mt-2 text-sm text-muted">Usage analytics and masked session replay.</p>
      <Link href="/privacy" className="mt-2 inline-block text-sm underline underline-offset-4">Privacy policy</Link>
      <div className="mt-4 grid grid-cols-2 gap-3" aria-label="Analytics choice">
        <Button disabled={saving} variant={mode === "off" ? "primary" : "secondary"} aria-pressed={mode === "off"} onClick={() => void save("off")}>Off</Button>
        <Button disabled={saving || !account.resolved} variant={mode === "full" ? "primary" : "secondary"} aria-pressed={mode === "full"} onClick={() => void save("on")}>On</Button>
      </div>
      <div role="status" className="mt-2 text-sm text-muted">{saving ? "Saving…" : error ? "Could not save. Try again." : ""}</div>
    </section>}
  </Context.Provider>;
}

export function AnalyticsSettingsButton() {
  const { open } = useAnalyticsPreferences();
  if (!ANALYTICS_FOUNDATION_ENABLED) return null;
  return <button type="button" onClick={open} className="cursor-pointer text-muted underline-offset-4 hover:text-foreground hover:underline">Usage & privacy</button>;
}
