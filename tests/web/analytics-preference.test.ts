import assert from "node:assert/strict";
import { it } from "node:test";
import { analyticsAccountMatches, parseAnalyticsChoice, resolveAnalyticsMode } from "../../apps/web/src/lib/analytics-preference";
import { filterAnalyticsEvent } from "../../apps/web/src/lib/analytics-capture";
import { retainAnalyticsAuthOutcome } from "../../apps/web/src/lib/analytics-preference";
import { analyticsChoiceOwnerMatches } from "../../apps/web/src/lib/analytics-preference";

it("adopts guest consent once but never inherits another account's choice", () => {
  assert.equal(analyticsChoiceOwnerMatches("guest", "account-a"), true);
  assert.equal(analyticsChoiceOwnerMatches("account-a", "account-a"), true);
  assert.equal(analyticsChoiceOwnerMatches("account-a", "account-b"), false);
  assert.equal(analyticsChoiceOwnerMatches(null, "account-b"), false);
});

it("retains the last auth outcome across unresolved identity but clears it after withdrawal", () => {
  let previous: "authenticated" | "anonymous" | undefined = "authenticated";
  previous = retainAnalyticsAuthOutcome(previous, undefined);
  assert.equal(previous, "authenticated");
  assert.equal(retainAnalyticsAuthOutcome(previous, "full"), "authenticated");
  assert.equal(retainAnalyticsAuthOutcome(previous, "off"), undefined);
  assert.equal(retainAnalyticsAuthOutcome(previous, "limited"), undefined);
});

it("uses Limited only after preferences resolve, with either Off restriction winning", () => {
  assert.equal(resolveAnalyticsMode(undefined, undefined, true), "limited");
  assert.equal(resolveAnalyticsMode("on", undefined, false), undefined);
  assert.equal(resolveAnalyticsMode("off", undefined, false), "off");
  assert.equal(resolveAnalyticsMode("on", "off", true), "off");
  assert.equal(resolveAnalyticsMode("off", "on", true), "off");
  assert.equal(resolveAnalyticsMode(undefined, "on", true), "full");
  assert.equal(resolveAnalyticsMode("on", undefined, true), "full");
});

it("strips SDK identity, URLs and arbitrary strings from independent Limited counts", () => {
  const source = { event: "search_submitted", $set: { email: "root-private@example.test" }, properties: {
    distinct_id: "old-user", $device_id: "device", $session_id: "session", $current_url: "/search?q=secret",
    $set: { email: "private@example.test" }, query: "secret", surface: "home", view_key: "standard",
  } };
  const first = filterAnalyticsEvent(source, "limited", "staging", true)!;
  const second = filterAnalyticsEvent(source, "limited", "staging", true)!;
  assert.equal(JSON.stringify(first).includes("root-private"), false);
  assert.notEqual(first.properties.distinct_id, second.properties.distinct_id);
  const { distinct_id: id, ...properties } = first.properties;
  assert.ok(id);
  assert.deepEqual(properties, { surface: "home", view_key: "standard", deployment_category: "staging", analytics_mode: "limited", $process_person_profile: false, $geoip_disable: true, $ip: null });
  assert.equal(filterAnalyticsEvent({ event: "$snapshot", properties: {} }, "limited", "staging", true), null);
  assert.equal(filterAnalyticsEvent({ event: "claim_completed", properties: {} }, "limited", "staging", true), null);
  assert.equal(filterAnalyticsEvent(source, "limited", "staging", false), null);
});

it("drops every event while Off, auth unresolved, or environment unknown", () => {
  for (const mode of [undefined, "off"] as const) {
    assert.equal(filterAnalyticsEvent({ event: "$pageview", properties: {} }, mode, "production", true), null);
  }
  assert.equal(filterAnalyticsEvent({ event: "$pageview", properties: {} }, "full", undefined, true), null);
});

it("accepts only explicit binary stored choices", () => {
  for (const value of [null, "limited", "full", "null", "{}", "true"]) {
    assert.equal(parseAnalyticsChoice(value), undefined);
  }
  assert.equal(parseAnalyticsChoice("off"), "off");
  assert.equal(parseAnalyticsChoice("on"), "on");
});

it("rejects a stale backend identity during account switching and sign-out", () => {
  assert.equal(analyticsAccountMatches("user-b", "user-a", true), false);
  assert.equal(analyticsAccountMatches("user-b", undefined, false), false);
  assert.equal(analyticsAccountMatches(null, "user-a", true), false);
  assert.equal(analyticsAccountMatches("user-b", "user-b", true), true);
  assert.equal(analyticsAccountMatches(null, undefined, false), true);
  assert.equal(analyticsAccountMatches(undefined, undefined, false), true);
});
