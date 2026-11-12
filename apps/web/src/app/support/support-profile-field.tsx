"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { EventIdentityPicker } from "../events/event-identity-picker";
import type { EventIdentityOption } from "@/lib/event-editor-identity";

export function SupportProfileField({ required, disabled }: { required: boolean; disabled: boolean }) {
  const [kind, setKind] = useState<"person" | "community" | "">("");
  const [selected, setSelected] = useState<EventIdentityOption | null>(null);
  const [manual, setManual] = useState(false);
  return <div className="grid gap-4">
    <Field>Profile type<Select aria-label="Profile type" name="profileType" value={kind} required={required} disabled={disabled} onChange={event => { setKind(event.target.value as typeof kind); setSelected(null); }}>
      <option value="">Choose one</option><option value="person">Person</option><option value="community">Community</option>
    </Select></Field>
    {kind && !manual ? <>
      <EventIdentityPicker label="Find profile" kind={kind} selectedSlug={selected?.slug} selectedOption={selected} required={required} disabled={disabled} onSelect={setSelected} onClear={() => setSelected(null)} />
      <input type="hidden" name="profileSlug" value={selected?.slug ?? ""} />
      <input type="hidden" name="displayName" value={selected?.title ?? ""} />
    </> : null}
    {manual ? <div className="grid gap-4 sm:grid-cols-2">
      <Field>Profile link<Input name="profileSlug" disabled={disabled} /></Field>
      <Field>Name<Input name="displayName" maxLength={120} disabled={disabled} /></Field>
    </div> : null}
    {kind ? <button type="button" disabled={disabled} className="w-fit text-sm text-accent hover:underline" onClick={() => { setManual(!manual); setSelected(null); }}>{manual ? "Search profiles" : "Enter a link or name"}</button> : null}
  </div>;
}
