"use client";

import { useConvex } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent } from "react";

import { api } from "@convex-generated-api";
import { EventIdentityPicker } from "@/app/events/event-identity-picker";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import type { EventIdentityOption } from "@/lib/event-editor-identity";

type Assignment = FunctionReturnType<typeof api.conciergeOwnership.previewAssignment>;

export function ConciergeOwnershipPanel() {
  const convex = useConvex();
  const [preview, setPreview] = useState<Assignment | null>(null);
  const [profileKind, setProfileKind] = useState<"community" | "person">("community");
  const [profile, setProfile] = useState<EventIdentityOption | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assigned, setAssigned] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (!preview && !profile)) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    setError("");
    setAssigned("");
    try {
      if (!preview) {
        setPreview(await convex.query(api.conciergeOwnership.previewAssignment, {
          slug: profile?.slug ?? "",
          email: String(values.get("email") ?? ""),
        }));
      } else {
        const response = await fetch("/api/account/concierge-ownership", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            slug: preview.slug,
            email: preview.email,
            expectedProfileId: preview.profileId,
            expectedUserId: preview.userId,
            reason: String(values.get("reason") ?? ""),
          }),
        });
        const result = await response.json() as { slug?: unknown; error?: unknown };
        if (!response.ok || typeof result.slug !== "string") {
          throw new ConvexError({ message: typeof result.error === "string" ? result.error : "Could not complete the assignment." });
        }
        setAssigned(result.slug);
        setPreview(null);
        setProfile(null);
        form.reset();
      }
    } catch (failure) {
      const data = failure instanceof ConvexError ? failure.data : null;
      setError(typeof data?.message === "string" ? data.message : "Could not complete the assignment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="concierge-ownership-heading" className="border-t border-border py-8 ph-no-capture" data-ph-no-capture>
      <h2 id="concierge-ownership-heading" className="text-2xl font-semibold">Assign profile ownership</h2>
      <form onSubmit={submit} className="mt-5 grid max-w-2xl gap-4">
        {preview ? (
          <>
            <Notice className="[overflow-wrap:anywhere]">
              <p className="font-medium">{preview.profileName} · {preview.slug}</p>
              <p>{preview.recipientName ? <>{preview.recipientName} · </> : null}{preview.email}</p>
            </Notice>
            <Field>
              Reason
              <Input name="reason" required minLength={10} maxLength={500} autoComplete="off" />
            </Field>
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 gap-3">
              <Field>
                Profile type
                <Select value={profileKind} disabled={busy} onChange={(event) => {
                  setProfileKind(event.currentTarget.value === "person" ? "person" : "community");
                  setProfile(null);
                }}>
                  <option value="community">Community</option>
                  <option value="person">Person</option>
                </Select>
              </Field>
              <EventIdentityPicker key={profileKind} kind={profileKind} label="Profile"
                selectedSlug={profile?.slug} selectedOption={profile} disabled={busy}
                onSelect={setProfile} onClear={() => setProfile(null)} />
            </div>
            <Field>
              Recipient’s verified email
              <Input name="email" type="email" required maxLength={320} autoComplete="off" />
            </Field>
          </div>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || (!preview && !profile)}>{preview ? "Assign owner" : "Review assignment"}</Button>
          {preview ? <Button type="button" variant="secondary" disabled={busy} onClick={() => { setPreview(null); setError(""); }}>Back</Button> : null}
        </div>
        {error ? <Notice role="alert" variant="error">{error}</Notice> : null}
        {assigned ? <Notice role="status" variant="success">Owner assigned to {assigned}.</Notice> : null}
      </form>
    </section>
  );
}
