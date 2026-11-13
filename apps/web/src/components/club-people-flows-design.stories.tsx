import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";

const people = [
  { id: "usr_00000000-0000-4000-8000-000000000001", name: "Mira", profile: true },
  { id: "usr_00000000-0000-4000-8000-000000000002", name: "Nightbird", profile: false },
  { id: "usr_318b18fc-0000-4000-8000-000000000003", name: "Member 318b18fc", profile: false },
  { id: "usr_00000000-0000-4000-8000-000000000004", name: "Juniper", profile: true },
];
function DemoName({ person }: { person: (typeof people)[number] }) {
  return person.profile
    ? <a href="#" onClick={event => event.preventDefault()} aria-label={`${person.name}, VRDex profile (demo)`} className="font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"><bdi>{person.name}</bdi></a>
    : <span className="font-semibold"><bdi>{person.name}</bdi></span>;
}
function PersonDetails({ person, children }: { person: (typeof people)[number]; children?: ReactNode }) {
  return <details className="mt-3 text-sm text-muted"><summary aria-label={`Details for ${person.name}`} className="w-fit cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2">Details</summary><div className="mt-3 grid gap-2 border-l border-border pl-3"><p className="break-all">{person.id}</p>{children}</div></details>;
}
function VrchatControl({ name }: { name: string }) {
  return <Button variant="surface" size="sm" className="min-h-10 gap-2" aria-label={`VRChat profile for ${name} (demo)`}>VRChat <ArrowUpRight size={16} aria-hidden="true" /></Button>;
}

function InvitationPreview() {
  const [selected, setSelected] = useState(people.slice(0, 3).map(person => person.id));
  const [reviewing, setReviewing] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <>
      <div className="mb-5"><h1 className="text-2xl font-semibold">Invitations</h1><p className="mt-1 text-sm text-muted">BITRATE · Friday session</p></div>
      {!reviewing ? <Card padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle>{sent ? "Invitation results" : "Review recipients"}</SectionTitle><span className="text-sm text-muted">{sent ? `${selected.length} processed` : `${selected.length} selected · 1 already a member`}</span></div>
        <div className="mt-3 divide-y divide-border">
          {people.map((person, index) => (
            <div key={person.id} className="py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  {!sent ? <input type="checkbox" aria-label={`Select ${person.name}`} checked={selected.includes(person.id)} disabled={index === 3 || reviewing} onChange={event => setSelected(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} className="mt-1 h-4 w-4 accent-accent" /> : null}
                  <div><DemoName person={person} /><p className="mt-1 text-sm text-muted">{index === 3 ? "Already a member" : sent ? selected.includes(person.id) ? index === 2 ? "Outcome unknown" : "Sent" : "Not selected" : "Ready"}</p></div>
                </div>
                <VrchatControl name={person.name} />
              </div>
              <PersonDetails person={person}><p>{index === 2 ? "Name lookup pending" : "Name last checked: today, 12:15 AM"}</p>{sent && index === 2 && selected.includes(person.id) ? <p>Check the invitation outcome before sending again.</p> : null}</PersonDetails>
            </div>
          ))}
        </div>
        {!sent ? <div className="mt-5 flex justify-end border-t border-border pt-5"><Button disabled={!selected.length} onClick={() => setReviewing(true)}>Review {selected.length} invitations</Button></div> : null}
      </Card> : null}
      {reviewing ? <Card padding="lg" className="mt-5"><SectionTitle>Send {selected.length} invitations?</SectionTitle><p className="mt-2 text-sm text-muted">BITRATE · Friday session</p><ul className="mt-4 grid gap-3">{people.filter(person => selected.includes(person.id)).map(person => <li key={person.id}><DemoName person={person} /><p className="mt-1 break-all font-mono text-xs text-muted">{person.id}</p></li>)}</ul><div className="mt-5 flex flex-wrap gap-3"><Button variant="primary" onClick={() => { setSent(true); setReviewing(false); }}>Send invitations</Button><Button onClick={() => setReviewing(false)}>Back to recipients</Button></div></Card> : null}
      {sent ? <Button className="mt-5" onClick={() => setSent(false)}>Reset demo results</Button> : null}
    </>
  );
}

function ScheduledPreview() {
  const [confirmation, setConfirmation] = useState<null | "edit" | "cancel">(null);
  const [cancelled, setCancelled] = useState(false);
  const [role, setRole] = useState("DJ");
  const [draftRole, setDraftRole] = useState("DJ");
  const [draftTime, setDraftTime] = useState("20:00");
  const [time, setTime] = useState("8:00 PM");
  const mira = people[0];
  return (
    <>
      <div className="mb-5"><h1 className="text-2xl font-semibold">Scheduled actions</h1><p className="mt-1 text-sm text-muted">BITRATE · Friday session</p></div>
      {!confirmation ? <Card padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle>Upcoming</SectionTitle><span className="text-sm text-muted">America/Indianapolis</span></div>
        <div className="mt-3 divide-y divide-border">
          {people.slice(0, 3).map((person, index) => (
            <div key={person.id} className="py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><p className="text-sm text-muted">{index === 0 ? `Assign role: ${role}` : index === 1 ? "Invite to group" : "Remove role: DJ"}</p><p className="mt-1"><DemoName person={person} /></p><p className="mt-2 text-sm">{index === 0 ? `Nov 13 · ${time}` : index === 1 ? "Nov 13 · 8:15 PM" : "Nov 13 · 11:00 PM"}</p><p className="mt-1 text-xs text-muted">Scheduled by Sol</p></div>
                <div className="flex flex-wrap items-start justify-end gap-3"><VrchatControl name={person.name} /><span className="py-2 text-sm text-muted">{index === 0 && cancelled ? "Cancelled" : "Pending"}</span>{index === 0 && !cancelled ? <><Button size="sm" onClick={() => { setDraftRole(role); setConfirmation("edit"); }}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setConfirmation("cancel")}>Cancel action</Button></> : null}</div>
              </div>
              <PersonDetails person={person}><p>{index === 0 ? "Role ID: grol_00000000-0000-4000-8000-000000000001" : index === 2 ? "Name lookup pending" : "Operation ID: demo-invite-nightbird"}</p></PersonDetails>
            </div>
          ))}
        </div>
      </Card> : null}
      {confirmation ? <Card padding="lg" className="mt-5"><SectionTitle>{confirmation === "edit" ? "Edit scheduled action" : "Cancel scheduled action?"}</SectionTitle><p className="mt-3">Assign role: {role}</p><p className="mt-2"><DemoName person={mira} /></p><p className="mt-1 break-all font-mono text-xs text-muted">{mira.id}</p><p className="mt-2 text-sm text-muted">Nov 13 · {time} · America/Indianapolis</p>{confirmation === "edit" ? <div className="mt-4 grid max-w-sm gap-4"><label className="grid gap-2 text-sm">Role<select value={draftRole} onChange={event => setDraftRole(event.target.value)} className="rounded-control border border-border bg-surface p-2"><option>DJ</option><option>Event staff</option></select></label><label className="grid gap-2 text-sm">Time<input type="time" value={draftTime} onInput={event => setDraftTime(event.currentTarget.value)} className="rounded-control border border-border bg-surface p-2" /></label></div> : null}<div className="mt-5 flex flex-wrap gap-3"><Button disabled={confirmation === "edit" && !draftTime} variant={confirmation === "cancel" ? "danger" : "primary"} onClick={() => { if (confirmation === "cancel") setCancelled(true); else { setRole(draftRole); const [hours, minutes] = draftTime.split(":").map(Number); setTime(`${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`); } setConfirmation(null); }}>{confirmation === "cancel" ? "Confirm cancellation" : "Save changes"}</Button><Button onClick={() => setConfirmation(null)}>{confirmation === "cancel" ? "Keep action" : "Discard changes"}</Button></div></Card> : null}
      {cancelled ? <Button className="mt-5" onClick={() => setCancelled(false)}>Reset demo action</Button> : null}
    </>
  );
}

function PeopleFlows({ initialView = "invitations" }: { initialView?: "invitations" | "scheduled" }) {
  const [view, setView] = useState(initialView);
  return <div className="mx-auto max-w-5xl p-5 sm:p-8"><p className="mb-4 text-sm text-muted">Design preview · Synthetic people · All actions simulated</p><div className="mb-7 flex gap-2" role="tablist" aria-label="Workspace previews"><Button role="tab" aria-selected={view === "invitations"} variant={view === "invitations" ? "secondary" : "ghost"} onClick={() => setView("invitations")}>Invitations</Button><Button role="tab" aria-selected={view === "scheduled"} variant={view === "scheduled" ? "secondary" : "ghost"} onClick={() => setView("scheduled")}>Scheduled actions</Button></div><div role="tabpanel" aria-label={view === "invitations" ? "Invitations" : "Scheduled actions"}>{view === "invitations" ? <InvitationPreview /> : <ScheduledPreview />}</div></div>;
}

const meta = { title: "Clubs/People flows design", component: PeopleFlows, parameters: { layout: "fullscreen" } } satisfies Meta<typeof PeopleFlows>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Invitations: Story = { args: { initialView: "invitations" } };
export const ScheduledActions: Story = { args: { initialView: "scheduled" } };

