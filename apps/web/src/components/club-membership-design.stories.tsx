import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card, SectionTitle } from "@/components/ui/card";
import { metricTime } from "@/app/account/communities/[slug]/club-chart";

// Throwaway design preview. Names, identifiers and links are synthetic.
const rows = [
  { name: "Lumen", action: "Joined", user: "001", profile: true },
  { name: "Mira", action: "Assigned role: DJ", user: "002", profile: true, actor: "Sol", detail: "Latest known role name: DJ. Name recorded with event: Mira Moon." },
  { name: "Nightbird", action: "Removed role: Deputy", user: "003", actor: "Sol", detail: "Role recorded with event: Deputy. Latest known role name: Event staff." },
  { name: "Echo", action: "Role assigned", user: "004", missingRole: true, detail: "This older record has no role or actor metadata." },
  { name: "Unknown member", action: "Role removed", user: "005", missingRole: true, detail: "No cached name is available. No unique visible verified VRDex profile match." },
];

function RoleActivityPreview() {
  return (
    <div className="mx-auto max-w-5xl p-5">
      <p className="mb-4 text-sm text-muted">Design preview · Synthetic data · Profile links are disabled</p>
      <Card padding="lg">
        <SectionTitle>Membership activity</SectionTitle>
        <div className="mt-4 divide-y divide-border">
          {rows.map((row, index) => {
            const at = Date.UTC(2026, 10, 9, 18, 24) - index * 60_000;
            return (
              <div key={row.user} className="py-4">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_12rem]">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{row.name}</p>
                    <div className="mt-1 flex gap-4 text-xs text-muted">
                      <a aria-disabled="true" role="link" className="underline underline-offset-4">VRChat<span className="sr-only"> profile, opens in a new tab</span></a>
                      {row.profile ? <a aria-disabled="true" role="link" className="underline underline-offset-4">VRDex</a> : null}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm">{row.action}</p>
                    {row.actor ? <p className="mt-1 text-xs text-muted">By {row.actor}</p> : null}
                    {row.missingRole ? <p className="mt-1 text-xs text-muted">Role unavailable</p> : null}
                  </div>
                  <time dateTime={new Date(at).toISOString()} className="text-xs text-muted sm:text-right">{metricTime(at)}</time>
                </div>
                <details className="mt-3 text-xs text-muted">
                  <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Details</summary>
                  <div className="mt-3 grid gap-2 border-l border-border pl-3">
                    <p className="break-all">Target ID: usr_00000000-0000-4000-8000-000000000{row.user}</p>
                    <p>Audit ID: synthetic-{row.user}</p>
                    {row.detail ? <p>{row.detail}</p> : null}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

const meta = { title: "Clubs/Membership design", component: RoleActivityPreview, parameters: { layout: "fullscreen" } } satisfies Meta<typeof RoleActivityPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RoleActivity: Story = {};
