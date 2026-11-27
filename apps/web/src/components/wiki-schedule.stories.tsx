import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TimelineChart } from "@/app/_components/timeline/timeline-chart";
import { packEvents } from "@/lib/timeline/packing";
import type {
  SavedResolution,
  TimelineEvent,
  TimelineSchedule,
} from "../../../../convex/_eventTimelineTypes";

const hour = 3_600_000;
const startAt = Date.UTC(2026, 10, 7, 21);
const range = { startAt, endAt: startAt + 8 * hour, timeZone: "UTC" };

function timed(startHour: number, endHour: number): Extract<TimelineSchedule, { kind: "timed" }> {
  return { kind: "timed", startAt: startAt + startHour * hour, endAt: startAt + endHour * hour };
}

const orbit: TimelineEvent = {
  id: "orbit",
  slug: "orbit",
  title: "ORBIT",
  communityName: "Prism Collective",
  status: "scheduled",
  schedule: timed(0.25, 4.75),
  slots: [
    { id: "aurora", eventId: "orbit", displayLabel: "Aurora", schedule: timed(0.25, 1.75) },
    { id: "nori", eventId: "orbit", displayLabel: "Nori", schedule: timed(1.75, 3.25) },
    { id: "vale", eventId: "orbit", displayLabel: "Vale", schedule: timed(3.25, 4.75) },
  ],
  performers: [],
  rosterCursor: null,
};

const lowTide: TimelineEvent = {
  id: "low-tide",
  slug: "low-tide",
  title: "Low Tide",
  communityName: "Tidal Society",
  status: "scheduled",
  schedule: timed(2.75, 7),
  slots: [],
  performers: [],
  rosterCursor: null,
};

const records = [orbit, lowTide];
const nori = orbit.slots[1];
const saved: SavedResolution = {
  kind: "available",
  status: "scheduled",
  event: orbit,
  slot: nori,
  reference: { kind: "set", eventId: orbit.id, slotId: nori.id },
};

const meta = { title: "Wiki/Schedule" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const PlanYourNight: Story = {
  render: () => (
    <section aria-label="Schedule preview" className="mx-auto max-w-[840px] bg-canvas p-5">
      <h2 className="mb-3 text-xl font-semibold">Schedule</h2>
      <div className="h-[310px] overflow-hidden">
        <TimelineChart
          records={records}
          lanes={packEvents({ events: records })}
          saved={[saved]}
          range={range}
          now={startAt - hour}
          slotCoverage={{ orbit: "complete", "low-tide": "complete" }}
          selection={null}
          plan={[saved.reference]}
          favoriteProfileIds={[]}
          onPan={() => {}}
          onWidth={() => {}}
          onNext={() => {}}
          onSelect={() => {}}
          onSave={() => {}}
          onFavorite={() => {}}
        />
      </div>
    </section>
  ),
};
