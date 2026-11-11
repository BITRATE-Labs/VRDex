export const ANALYTICS_GUEST_KEY = "vrdex-analytics-guest";
export type GuestReceipt = { analyticsId: string; receipt: string; withdrawn?: boolean };

function parse(value: unknown): GuestReceipt | undefined {
  if (typeof value !== "object" || value === null || !("analyticsId" in value) || !("receipt" in value)
    || typeof value.analyticsId !== "string" || !/^[a-f0-9-]{36}$/.test(value.analyticsId)
    || typeof value.receipt !== "string" || !/^[a-f0-9]{64}$/.test(value.receipt)) return undefined;
  return { analyticsId: value.analyticsId, receipt: value.receipt, withdrawn: "withdrawn" in value && value.withdrawn === true };
}

function read() {
  const raw = localStorage.getItem(ANALYTICS_GUEST_KEY);
  if (!raw) return undefined;
  try { return parse(JSON.parse(raw)); } catch { return undefined; }
}

async function post(body: { action: "start" } | { action: "withdraw"; receipt: string }) {
  const response = await fetch("/api/analytics/guest", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Guest analytics preference unavailable");
  return response;
}

async function withdrawStored() {
  const current = read();
  if (!current) return;
  localStorage.setItem(ANALYTICS_GUEST_KEY, JSON.stringify({ ...current, withdrawn: true }));
  await post({ action: "withdraw", receipt: current.receipt });
  localStorage.removeItem(ANALYTICS_GUEST_KEY);
}

export async function ensureGuestReceipt(): Promise<GuestReceipt> {
  // shortcut: guest Full requires Web Locks, revisit when supporting browsers without them.
  if (!navigator.locks) throw new Error("Guest analytics storage unavailable");
  return navigator.locks.request(ANALYTICS_GUEST_KEY, async () => {
    const current = read();
    if (current && !current.withdrawn) return current;
    if (current) await withdrawStored();
    // Reserve receipt-sized storage before creating a server identity.
    localStorage.setItem(ANALYTICS_GUEST_KEY, " ".repeat(512));
    localStorage.removeItem(ANALYTICS_GUEST_KEY);
    const response = await post({ action: "start" });
    const guest = parse(await response.json());
    if (!guest) throw new Error("Invalid guest analytics receipt");
    localStorage.setItem(ANALYTICS_GUEST_KEY, JSON.stringify(guest));
    return guest;
  });
}

export async function withdrawGuestReceipt() {
  if (!navigator.locks) return;
  await navigator.locks.request(ANALYTICS_GUEST_KEY, withdrawStored);
}
