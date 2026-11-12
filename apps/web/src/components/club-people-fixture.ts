import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { api } from "@convex-generated-api";
import type { Id } from "../../../../convex/_generated/dataModel";

// Synthetic transport only. Components still request and subscribe to actual view contracts.
export class ClubPeopleFixture {
  resolved = true;
  profileNames = false;
  denied = false;
  pendingAllowed = true;
  private views = new Map<string, FunctionReturnType<typeof api.clubPeople.readView>>();
  private tickets = new Map<string, { viewId: Id<"clubPeopleViews">; expiresAt: number }>();
  private generation = 0;
  request(source: FunctionArgs<typeof api.clubPeople.requestView>["source"], ids: string[], names: Map<string, string> = new Map()) {
    const sourceKey = JSON.stringify(source), prior = this.tickets.get(sourceKey);
    const viewId = prior && prior.expiresAt > Date.now() ? prior.viewId : `people-${++this.generation}-${sourceKey}` as Id<"clubPeopleViews">;
    const expiresAt = prior && prior.expiresAt > Date.now() ? prior.expiresAt : Date.now() + 15 * 60_000;
    this.tickets.set(sourceKey, { viewId, expiresAt });
    const canonicalNames = new Map([...names].map(([id, name]) => [id.toLowerCase(), name]));
    this.views.set(viewId, {
      people: [...new Set(ids.map(id => id.toLowerCase()))].map((userId, index) => ({ userId, displayName: canonicalNames.get(userId) ?? ["Riley", "Nova", "Ash", "Morgan", "Eli"][index], ...(index === 0 ? { vrdexUrl: "/riley" } : {}), vrchatUrl: `https://vrchat.com/home/user/${userId}`, observedAt: Date.now(), source: "vrchat_private", status: "resolved" })),
      pendingCount: 0,
      expiresAt,
    });
    return { viewId, expiresAt };
  }
  read(viewId: string) {
    const view = this.views.get(viewId);
    if (!view) throw new Error("Unknown people view");
    if (this.denied) throw new Error("People access revoked");
    const resolved = this.profileNames ? { ...view, people: view.people.map(person => ({ ...person, source: "vrdex_profile" as const, observedAt: undefined })) } : view;
    return this.resolved ? resolved : { ...view, pendingCount: this.pendingAllowed ? view.people.length : 0, people: view.people.map(person => ({ userId: person.userId, vrchatUrl: person.vrchatUrl, status: this.pendingAllowed ? "pending" as const : "retry" as const })) };
  }
}
