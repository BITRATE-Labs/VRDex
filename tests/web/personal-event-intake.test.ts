import assert from "node:assert/strict";
import { it } from "node:test";
import { mergePersonalLineupSuggestions, personalEventUpdatePatch } from "../../apps/web/src/lib/calendar/personal-event-intake";

it("a partial imported lineup keeps existing rows and stable identities", () => {
  const result = mergePersonalLineupSuggestions([{ clientKey: "ivy", position: 0, performerLabel: "JustIvy", start: { time: "22:00" } }, { clientKey: "other", position: 1, performerLabel: "Other DJ" }], [{ clientKey: "extracted-0", position: 0, performerLabel: "JustIvy", end: { time: "23:00" } }]);
  assert.deepEqual(result, [{ clientKey: "ivy", position: 0, performerLabel: "JustIvy", start: { time: "22:00" }, end: { time: "23:00" } }, { clientKey: "other", position: 1, performerLabel: "Other DJ" }]);
});

it("owner update patches omit untouched lineup and private-source fields", () => {
  const baseline = { title: "Existing", communitySlug: "club", lineup: [{ clientKey: "ivy", position: 0, performerLabel: "JustIvy" }] };
  assert.deepEqual(personalEventUpdatePatch(baseline, { ...baseline, venueLabel: "New room", sourceText: "Private chat", sourceUrl: "https://discord.com/channels/1/2/3" }), { venueLabel: "New room" });
});


it("repeated imports keep unique bounded keys and contiguous positions", () => {
  const result = mergePersonalLineupSuggestions([
    { clientKey: "import-extracted-0", position: 3, performerLabel: "Earlier import" },
    { clientKey: "import-2", position: 7, performerLabel: "Other DJ" },
  ], [
    { clientKey: "extracted-0", position: 0, performerLabel: "New DJ" },
    { clientKey: "extracted-0", position: 1, performerLabel: "Another DJ" },
  ]);
  assert.equal(new Set(result.map(row => row.clientKey)).size, 4);
  assert.deepEqual(result.map(row => row.position), [0, 1, 2, 3]);
  assert.deepEqual(result.slice(0, 2).map(row => row.clientKey), ["import-extracted-0", "import-2"]);
  assert.ok(result.every(row => row.clientKey.length <= 120));
});
