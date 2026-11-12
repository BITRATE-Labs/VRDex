import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/ui/card";

// Throwaway interaction study. No provider requests or production data.
function RecoveryDesign() {
  const [resolved, setResolved] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const rows = [
    { id: "mira", name: "Mira", profile: true, member: true, action: "Assigned role: DJ", actor: "Sol", detail: "Role recorded with event: DJ", time: "Nov 12, 12:24 AM" },
    { id: "nightbird", name: "Nightbird", profile: false, member: true, action: "Removed role: Deputy", actor: "Sol", detail: "Role recorded with event: Deputy", time: "Nov 12, 12:21 AM" },
    { id: "318b18fc", name: resolved ? "Juniper" : "Member 318b18fc", profile: false, member: true, action: "Joined", actor: "", detail: resolved ? "Name last checked: Nov 12, 12:25 AM" : "Name lookup pending", time: "Nov 12, 12:17 AM" },
    { id: "c00a5fe5", name: "Member c00a5fe5", profile: false, member: true, action: "Role assigned", actor: "", detail: "Name not available. Role not recorded.", time: "Nov 9, 1:24 PM" },
    { id: "group", name: "Group settings", profile: false, member: false, action: "Updated", actor: "Sol", detail: "Event type: group.update", time: "Nov 8, 10:04 PM" },
  ];
  function toggle(id: string) {
    setExpanded(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }
  return (
    <div className="mx-auto max-w-5xl p-5 sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Design preview · Synthetic data · Profile links disabled</p>
        <Button size="sm" onClick={() => setResolved(current => !current)}>{resolved ? "Reset demo lookup" : "Complete demo lookup"}</Button>
      </div>
      <Card padding="lg">
        <SectionTitle>Membership activity</SectionTitle>
        <div className="mt-2 divide-y divide-border">
          {rows.map(row => {
            const open = expanded.includes(row.id);
            return (
              <div key={row.id} className="py-5">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    {row.profile ? (
                      <a href="#" onClick={event => event.preventDefault()} aria-label={`${row.name}, VRDex profile (demo)`} className="block w-fit text-base font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2"><bdi>{row.name}</bdi></a>
                    ) : (
                      <p className="text-base font-semibold"><bdi>{row.name}</bdi></p>
                    )}
                    {row.member ? <Button size="sm" variant="surface" className="mt-3 min-h-10 gap-2" aria-label={`VRChat profile for ${row.name} (demo)`}>VRChat <ArrowUpRight size={16} aria-hidden="true" /></Button> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm">{row.action}</p>
                    {row.actor ? <p className="mt-1 text-sm text-muted">By <a href="#" onClick={event => event.preventDefault()} className="text-foreground underline-offset-4 hover:underline">{row.actor}</a></p> : null}
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:items-end sm:flex-col sm:justify-start">
                    <span className="text-xs text-muted">{row.time}</span>
                    <button type="button" onClick={() => toggle(row.id)} aria-label={`Details for ${row.name}`} aria-expanded={open} aria-controls={`evidence-${row.id}`} className="flex cursor-pointer items-center gap-1 text-sm text-muted underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2">Details {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}</button>
                  </div>
                </div>
                {open ? <div id={`evidence-${row.id}`} className="mt-4 grid gap-2 border-l border-border pl-4 text-sm text-muted"><p>{row.detail}</p>{row.member ? <p>Member ID: usr_{row.id}</p> : null}<p>Audit ID: demo-{row.id}</p></div> : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

const meta = { title: "Clubs/Membership recovery design", component: RecoveryDesign, parameters: { layout: "fullscreen" } } satisfies Meta<typeof RecoveryDesign>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RowInteractions: Story = {};
