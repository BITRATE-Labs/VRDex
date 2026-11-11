import assert from "node:assert/strict";
import { it } from "node:test";
import { ensureGuestReceipt, withdrawGuestReceipt, ANALYTICS_GUEST_KEY } from "../../apps/web/src/lib/analytics-guest";

it("does not mint a server identity when browser receipt storage cannot be written", async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
  const previousFetch = globalThis.fetch;
  let requests = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => null, setItem: () => { throw new Error("quota exhausted"); }, removeItem: () => {} } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_name: string, callback: () => Promise<unknown>) => callback() } });
  globalThis.fetch = async () => { requests++; throw new Error("must not request an identity"); };
  try {
    await assert.rejects(ensureGuestReceipt());
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage); else Reflect.deleteProperty(globalThis, "localStorage");
    if (previousLocks) Object.defineProperty(navigator, "locks", previousLocks); else Reflect.deleteProperty(navigator, "locks");
  }
});

it("an Off retry queued during a new On cannot withdraw the new consent period", async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
  const previousFetch = globalThis.fetch;
  const values = new Map<string, string>();
  let queue: Promise<unknown> = Promise.resolve();
  let release: () => void = () => {};
  let started: () => void = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const starting = new Promise<void>((resolve) => { started = resolve; });
  let withdrawals = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key),
  } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, callback: () => Promise<unknown>) => {
    const result = queue.then(callback); queue = result.catch(() => {}); return result;
  } } });
  globalThis.fetch = async (_url, init) => {
    const command = JSON.parse(String(init?.body));
    if (command.action === "withdraw") { withdrawals++; return Response.json({ accepted: true }); }
    started(); await pending;
    return Response.json({ analyticsId: "11111111-1111-4111-8111-111111111111", receipt: "a".repeat(64) });
  };
  try {
    const enabling = ensureGuestReceipt();
    await starting;
    const retryingOldOff = withdrawGuestReceipt();
    release();
    await Promise.all([enabling, retryingOldOff]);
    assert.equal(withdrawals, 0);
    assert.ok(values.get(ANALYTICS_GUEST_KEY));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage); else Reflect.deleteProperty(globalThis, "localStorage");
    if (previousLocks) Object.defineProperty(navigator, "locks", previousLocks); else Reflect.deleteProperty(navigator, "locks");
  }
});
