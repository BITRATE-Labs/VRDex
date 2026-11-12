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
  request(source: FunctionArgs<typeof api.clubPeople.requestView>["source"], ids: string[], names: Map<string, string> = new Map()) {
    const viewId = `people-${JSON.stringify(source)}` as Id<"clubPeopleViews">;
    const expiresAt = Date.now() + 15 * 60_000;
    this.views.set(viewId, {
      people: [...new Set(ids)].map((userId, index) => ({ userId, displayName: names.get(userId) ?? ["Riley", "Nova", "Ash", "Morgan", "Eli"][index], ...(index === 0 ? { vrdexUrl: "/riley" } : {}), vrchatUrl: `https://vrchat.com/home/user/${userId}`, observedAt: Date.now(), source: "vrchat_private", status: "resolved" })),
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
